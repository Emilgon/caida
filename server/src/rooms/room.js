import { GameError, MODES, TARGETS, applyMove, createMatch, publicStateFor } from "../caida/index.js";

// Logica de sala: quien esta sentado donde, quien manda, cuando se puede
// empezar. Igual que el motor, no sabe que existen los sockets y cada funcion
// devuelve una sala NUEVA. La capa de sockets solo traduce eventos a estas
// llamadas.

export const MAX_NAME = 20;
// Tres bots alcanzan para llenar cualquier mesa: tu contra 1, 2 o 3.
export const BOT_NAMES = ["Odaa", "Key", "Toby"];
// Cuanto hay que esperar, con alguien caido, antes de poder proponer cancelar.
// Una recarga de pagina o un tunel del metro tardan segundos; esto da margen.
export const GRACE_MS = 60_000;

export const ROOM_PHASES = ["sala", "jugando", "terminada", "cancelada"];

function fail(code, message) {
  throw new GameError(code, message);
}

export function cleanName(name) {
  const clean = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (clean.length === 0) fail("NOMBRE_VACIO", "Escribe tu nombre para entrar a la mesa.");
  if (clean.length > MAX_NAME) {
    fail("NOMBRE_LARGO", `El nombre no puede pasar de ${MAX_NAME} caracteres.`);
  }
  return clean;
}

function validateConfig({ players, target, mode }) {
  if (![2, 3, 4].includes(players)) {
    fail("JUGADORES_INVALIDOS", "La mesa admite 2, 3 o 4 jugadores.");
  }
  if (!TARGETS.includes(target)) fail("META_INVALIDA", "La meta de puntos debe ser 24 o 48.");
  if (!MODES.includes(mode)) {
    fail("MODO_INVALIDO", 'El modo de mesa debe ser "tradicional" o "mayor-canto".');
  }
}

function seatOf(room, playerId) {
  return room.seats.findIndex((seat) => seat !== null && seat.id === playerId);
}

function requireHost(room, playerId) {
  if (room.hostId !== playerId) {
    fail("NO_ERES_LIDER", "Solo quien creo la mesa puede hacer eso.");
  }
}

function requireLobby(room) {
  if (room.phase !== "sala") {
    fail("PARTIDA_EMPEZADA", "La partida ya empezo; eso solo se puede cambiar antes.");
  }
}

/** Alguien sentado pero sin conexion: la mesa se congela hasta que vuelva. */
export function isPaused(room) {
  return room.phase === "jugando" && room.seats.some((seat) => seat && !seat.connected);
}

export function missingPlayers(room) {
  return room.seats
    .filter((seat) => seat && !seat.connected)
    .map((seat) => ({ name: seat.name, left: seat.left }));
}

// Cuanto se le aguanta al repartidor contando la mesa antes de soltar el
// juego solo. Es una red de seguridad: si cierra la pestana a mitad del
// conteo, la mesa no se queda congelada para siempre.
export const CONTEO_MS = 25_000;

/**
 * Mientras el repartidor pone las cuatro cartas cantando "una, dos, tres,
 * cuatro", nadie juega. Es asi en la mesa de verdad, y sin esto un bot tira
 * su carta a media cuenta y se lleva por delante el reparto.
 */
export function contandoMesa(room, now = Date.now()) {
  if (!room.contando) return false;
  return now - room.contando.desde < CONTEO_MS;
}

/** A quien le toca actuar ahora mismo, o `null` si no hay nada que hacer. */
export function currentSeat(room, now = Date.now()) {
  if (room.phase !== "jugando" || !room.match || room.match.winner !== null) return null;
  if (isPaused(room)) return null;
  if (contandoMesa(room, now)) return null;
  return room.match.phase === "reparto" ? room.match.dealer : room.match.hand.turn;
}

export function isBotSeat(room, seat) {
  return Boolean(room.seats[seat]?.bot);
}

// ---------------------------------------------------------------------------

export function createRoom({ code, hostId, hostName, players = 4, target = 24, mode = "tradicional", now = Date.now() }) {
  validateConfig({ players, target, mode });
  const name = cleanName(hostName);

  const seats = Array.from({ length: players }, () => null);
  seats[0] = { id: hostId, name, bot: false, connected: true, left: false, lastSeen: now };

  return {
    code,
    hostId,
    config: { players, target, mode },
    seats,
    phase: "sala",
    match: null,
    contando: null,
    pausedAt: null,
    cancelVotes: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Entrar por primera vez o volver tras caerse. Si el `playerId` ya tiene
 * asiento, es una reconexion: recupera SU asiento, no uno cualquiera.
 */
export function joinRoom(room, { playerId, name, now = Date.now() }) {
  const next = structuredClone(room);
  next.updatedAt = now;

  const existing = seatOf(next, playerId);
  if (existing !== -1) {
    next.seats[existing].connected = true;
    next.seats[existing].left = false;
    next.seats[existing].lastSeen = now;
    if (typeof name === "string" && name.trim()) next.seats[existing].name = cleanName(name);
    if (!isPaused(next)) {
      next.pausedAt = null;
      next.cancelVotes = [];
    }
    return next;
  }

  if (next.phase === "cancelada") fail("SALA_CANCELADA", "Esa mesa ya no existe.");
  if (next.phase !== "sala") {
    fail("PARTIDA_EMPEZADA", "La partida ya empezo y la mesa esta completa.");
  }

  const free = next.seats.findIndex((seat) => seat === null);
  if (free === -1) fail("SALA_LLENA", "La mesa ya esta completa.");

  next.seats[free] = {
    id: playerId,
    name: cleanName(name),
    bot: false,
    connected: true,
    left: false,
    lastSeen: now,
  };
  return next;
}

/**
 * Sienta un bot en el primer puesto libre (o en el que se pida). Los bots
 * siempre cuentan como conectados: no se caen ni hacen esperar a la mesa.
 */
export function addBot(room, { hostId, seat, now = Date.now() } = {}) {
  requireHost(room, hostId);
  requireLobby(room);

  const target = seat ?? room.seats.findIndex((player) => player === null);
  if (target === -1) fail("SALA_LLENA", "La mesa ya esta completa.");
  if (!Number.isInteger(target) || target < 0 || target >= room.seats.length) {
    fail("ASIENTO_INVALIDO", "Ese asiento no existe en esta mesa.");
  }
  if (room.seats[target] !== null) fail("ASIENTO_OCUPADO", "En ese asiento ya hay alguien.");

  const taken = new Set(room.seats.filter((player) => player?.bot).map((player) => player.name));
  const name = BOT_NAMES.find((candidate) => !taken.has(candidate));
  if (!name) fail("SIN_BOTS", `Solo hay ${BOT_NAMES.length} bots disponibles.`);

  const next = structuredClone(room);
  next.seats[target] = {
    id: `bot:${name.toLowerCase()}`,
    name,
    bot: true,
    connected: true,
    left: false,
    lastSeen: now,
  };
  next.updatedAt = now;
  return next;
}

export function removeBot(room, { hostId, seat, now = Date.now() } = {}) {
  requireHost(room, hostId);
  requireLobby(room);
  if (!room.seats[seat]?.bot) fail("NO_ES_BOT", "En ese asiento no hay un bot.");

  const next = structuredClone(room);
  next.seats[seat] = null;
  next.updatedAt = now;
  return next;
}

/** Se cayo la conexion. En la sala libera el puesto; en partida solo congela. */
export function disconnectPlayer(room, playerId, { now = Date.now(), left = false } = {}) {
  const seat = seatOf(room, playerId);
  if (seat === -1) return room;

  const next = structuredClone(room);
  next.updatedAt = now;

  if (next.phase === "sala") {
    next.seats[seat] = null;
    if (next.hostId === playerId) next.hostId = nextHost(next);
    return next;
  }

  next.seats[seat].connected = false;
  next.seats[seat].left = left;
  next.seats[seat].lastSeen = now;
  if (next.phase === "jugando" && next.pausedAt === null) next.pausedAt = now;
  return next;
}

function nextHost(room) {
  // Un bot no puede dirigir la mesa.
  const candidate = room.seats.find((seat) => seat !== null && seat.connected && !seat.bot);
  return candidate ? candidate.id : null;
}

/**
 * El lider arrastra a alguien a otro puesto para armar las parejas. Los
 * asientos 0 y 2 son pareja contra 1 y 3, asi que esto importa de verdad.
 */
export function moveSeat(room, { hostId, from, to }) {
  requireHost(room, hostId);
  requireLobby(room);

  const size = room.seats.length;
  const valid = (index) => Number.isInteger(index) && index >= 0 && index < size;
  if (!valid(from) || !valid(to)) fail("ASIENTO_INVALIDO", "Ese asiento no existe en esta mesa.");
  if (from === to) return room;
  if (room.seats[from] === null) fail("ASIENTO_VACIO", "En ese asiento no hay nadie.");

  const next = structuredClone(room);
  [next.seats[from], next.seats[to]] = [next.seats[to], next.seats[from]];
  next.updatedAt = Date.now();
  return next;
}

export function updateConfig(room, { hostId, players, target, mode }) {
  requireHost(room, hostId);
  requireLobby(room);

  const config = {
    players: players ?? room.config.players,
    target: target ?? room.config.target,
    mode: mode ?? room.config.mode,
  };
  validateConfig(config);

  const next = structuredClone(room);
  next.config = config;

  if (config.players !== next.seats.length) {
    const seated = next.seats.filter((seat) => seat !== null);
    if (seated.length > config.players) {
      fail("DEMASIADA_GENTE", `Hay ${seated.length} personas sentadas y la mesa quedaria en ${config.players}.`);
    }
    next.seats = Array.from({ length: config.players }, (_, i) => seated[i] ?? null);
  }

  next.updatedAt = Date.now();
  return next;
}

export function startMatch(room, { hostId, seed, now = Date.now() }) {
  requireHost(room, hostId);
  requireLobby(room);

  if (room.seats.some((seat) => seat === null)) {
    fail("FALTA_GENTE", "Faltan jugadores por sentarse.");
  }
  if (room.seats.some((seat) => !seat.connected)) {
    fail("ALGUIEN_SIN_CONEXION", "Hay alguien sin conexion en la mesa.");
  }

  const next = structuredClone(room);
  next.match = createMatch({ ...room.config, seed });
  next.phase = "jugando";
  next.contando = null;
  next.pausedAt = null;
  next.cancelVotes = [];
  next.updatedAt = now;
  return next;
}

/** Otra partida con la misma gente y los mismos asientos. */
export function rematch(room, { hostId, seed, now = Date.now() }) {
  requireHost(room, hostId);
  if (room.phase !== "terminada") {
    fail("PARTIDA_EN_CURSO", "La partida todavia no ha terminado.");
  }
  if (room.seats.some((seat) => seat === null || !seat.connected)) {
    fail("FALTA_GENTE", "Falta gente para la revancha.");
  }

  const next = structuredClone(room);
  next.match = createMatch({ ...room.config, seed });
  next.phase = "jugando";
  next.contando = null;
  next.pausedAt = null;
  next.cancelVotes = [];
  next.updatedAt = now;
  return next;
}

export function applyGameMove(room, { playerId, move, now = Date.now() }) {
  if (room.phase !== "jugando") fail("SIN_PARTIDA", "No hay una partida en curso.");
  if (isPaused(room)) {
    const who = missingPlayers(room).map((player) => player.name).join(", ");
    fail("MESA_EN_PAUSA", `La mesa esta esperando a ${who}.`);
  }

  const seat = seatOf(room, playerId);
  if (seat === -1) fail("NO_ESTAS_EN_LA_MESA", "No estas sentado en esta mesa.");
  if (contandoMesa(room, now)) {
    fail("CONTANDO_LA_MESA", "Espera, se estan poniendo las cartas de la mesa.");
  }

  const next = structuredClone(room);
  // applyMove valida el turno y la legalidad; si algo no cuadra lanza GameError
  // con un mensaje ya listo para mostrarle al jugador.
  next.match = applyMove(next.match, seat, move);
  if (next.match.winner !== null) next.phase = "terminada";

  // Recien repartido: la mesa se cuenta antes de que juegue nadie.
  next.contando = move?.type === "repartir" ? { desde: now, seat } : null;
  next.updatedAt = now;
  return next;
}

/** El repartidor avisa de que ya puso las cuatro cartas. */
export function endCount(room, { playerId, now = Date.now() } = {}) {
  if (!room.contando) return room;
  const seat = seatOf(room, playerId);
  if (seat !== room.contando.seat) {
    fail("NO_REPARTES_TU", "Solo quien reparte pone las cartas de la mesa.");
  }
  const next = structuredClone(room);
  next.contando = null;
  next.updatedAt = now;
  return next;
}

/**
 * Con alguien caido y pasado el margen de gracia, los que siguen conectados
 * pueden cancelar la mesa. Hace falta que esten TODOS de acuerdo: si no,
 * cualquiera podria disolver una partida que va perdiendo.
 */
export function voteCancel(room, { playerId, now = Date.now() }) {
  if (room.phase !== "jugando") fail("SIN_PARTIDA", "No hay una partida en curso.");
  if (!isPaused(room)) fail("MESA_ACTIVA", "La mesa esta completa; no hay nada que cancelar.");
  if (seatOf(room, playerId) === -1) fail("NO_ESTAS_EN_LA_MESA", "No estas sentado en esta mesa.");

  const abandoned = room.seats.some((seat) => seat && !seat.connected && seat.left);
  if (!abandoned && now - room.pausedAt < GRACE_MS) {
    const left = Math.ceil((GRACE_MS - (now - room.pausedAt)) / 1000);
    fail("ESPERA_UN_POCO", `Espera ${left} segundos mas por si vuelve.`);
  }

  const next = structuredClone(room);
  if (!next.cancelVotes.includes(playerId)) next.cancelVotes.push(playerId);

  // Los bots no votan: si contaran, la mesa nunca se podria cancelar.
  const connected = next.seats.filter((seat) => seat && seat.connected && !seat.bot);
  if (connected.every((seat) => next.cancelVotes.includes(seat.id))) {
    next.phase = "cancelada";
    next.match = null;
  }
  next.updatedAt = now;
  return next;
}

// ---------------------------------------------------------------------------

/**
 * La sala como la ve UN jugador. Los `playerId` de los demas son secretos —
 * con el token ajeno se podrian ver sus cartas — asi que aqui solo salen
 * nombre, asiento y si esta conectado.
 */
export function publicRoom(room, viewerId, { now = Date.now() } = {}) {
  const seat = seatOf(room, viewerId);
  return {
    code: room.code,
    phase: room.phase,
    config: { ...room.config },
    seats: room.seats.map((player, index) => {
      if (player === null) return { seat: index, empty: true };
      return {
        seat: index,
        empty: false,
        name: player.name,
        bot: Boolean(player.bot),
        connected: player.connected,
        left: player.left,
        host: player.id === room.hostId,
        you: player.id === viewerId,
      };
    }),
    teams: room.config.players === 4 ? [[0, 2], [1, 3]] : null,
    yourSeat: seat === -1 ? null : seat,
    youAreHost: room.hostId === viewerId,
    full: room.seats.every((player) => player !== null),
    paused: isPaused(room),
    // Quien reparte esta poniendo la mesa: nadie juega hasta que acabe.
    contando: contandoMesa(room, now) ? { seat: room.contando.seat } : null,
    waitingFor: missingPlayers(room).map((player) => player.name),
    canVoteCancel:
      isPaused(room) &&
      (room.seats.some((player) => player && !player.connected && player.left) ||
        now - room.pausedAt >= GRACE_MS),
    cancelVotes: room.cancelVotes.length,
    winner: room.match ? room.match.winner : null,
  };
}

/**
 * Lo que ve un jugador de la partida en si. Sin partida, `null`.
 *
 * Si la mesa esta en pausa o contandose, la vista se queda SIN jugadas
 * legales: si no, la interfaz te deja tocar una carta que el servidor va a
 * rechazar, y el juego se siente roto aunque la regla se este aplicando bien.
 */
export function gameViewFor(room, viewerId, { now = Date.now() } = {}) {
  if (!room.match) return null;
  const seat = seatOf(room, viewerId);
  if (seat === -1) return null;

  const view = publicStateFor(room.match, seat);
  if (isPaused(room) || contandoMesa(room, now)) return { ...view, legalMoves: [] };
  return view;
}

export { seatOf };
