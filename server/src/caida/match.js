import { GameError } from "./errors.js";
import { caidaPoints, createDeck, nextValue } from "./deck.js";
import { CANTOS, compareRank, detectCanto } from "./cantos.js";
import { createRng, normalizeSeed, shuffle } from "./rng.js";

export const MODES = ["tradicional", "mayor-canto"];
export const TARGETS = [24, 48];
export const DEAL_FIRST = ["manos", "mesa"];
export const DIRECTIONS = ["ascendente", "descendente"];

export const MESA_POINTS = 4; // dejar la mesa vacia al capturar
export const MAL_ECHADA_POINTS = 1; // consuelo si el repartidor no acerto ninguna
export const HAND_SIZE = 3;
export const TABLE_SIZE = 4;
// Cuantos eventos recientes viajan al cliente en cada estado.
const EVENT_FEED = 30;

// ---------------------------------------------------------------------------
// Ayudas puras
// ---------------------------------------------------------------------------

function buildTeams(players) {
  // Con 4 se juega en parejas cruzadas, igual que el domino. Con 2 o 3 cada
  // quien es su propio "equipo", asi el resto del motor no distingue casos.
  if (players === 4) return [[0, 2], [1, 3]];
  return Array.from({ length: players }, (_, seat) => [seat]);
}

function teamOf(match, seat) {
  return match.teams.findIndex((team) => team.includes(seat));
}

// Umbral de cartas capturadas por asiento al cerrar la mano. Los tres casos
// suman exactamente 40, que son las cartas del mazo.
function cardThreshold(players, seat, dealer) {
  if (players === 2) return 20;
  if (players === 3) return seat === dealer ? 14 : 13;
  return 10;
}

/**
 * Que se lleva una carta si se juega contra esta mesa.
 * Captura todas las cartas del mismo valor y sigue arrastrando en escalera
 * hacia arriba mientras la mesa tenga el valor siguiente (7 -> 10 -> 11 -> 12).
 * La escalera es obligatoria: no se puede cortar antes.
 * Devuelve `null` si la carta no captura nada.
 */
export function resolveCapture(table, card) {
  if (!table.some((other) => other.value === card.value)) return null;

  const taken = [];
  let remaining = [...table];
  let value = card.value;

  while (value !== null) {
    const matches = remaining.filter((other) => other.value === value);
    if (matches.length === 0) break;
    taken.push(...matches);
    remaining = remaining.filter((other) => other.value !== value);
    value = nextValue(value);
  }

  return { taken, remaining };
}

// ---------------------------------------------------------------------------
// Puntuacion
// ---------------------------------------------------------------------------

/**
 * Todo evento queda marcado con la mano en la que ocurrio. Importa por una
 * razon de seguridad: el log es de toda la partida, y una carta nombrada en
 * la mano 1 puede estar en la mano de otro jugador —o en el mazo— durante la
 * mano 2. Al cliente solo se le mandan los eventos de la mano en curso, donde
 * cada carta nombrada ya se vio boca arriba sobre la mesa.
 */
function pushLog(match, entry) {
  match.log.push({ hand: match.handNumber, ...entry });
}

/**
 * Lo que se puede enseñar de un canto declarado. `esperaCartas` lleva los ids
 * del par de una Ronda, que siguen en la mano de quien canto: mandarlo seria
 * enseñarle sus cartas a todo el mundo. Va por aqui SIEMPRE, no carta por
 * carta en cada sitio, para que no se escape en ninguno.
 */
function cantoPublico(canto) {
  const { esperaCartas, ...publico } = canto;
  return publico;
}

function addScore(match, team, points, reason, extra = {}) {
  if (points <= 0 || match.winner !== null) return;
  match.scores[team] += points;
  pushLog(match, { type: "puntos", team, points, reason, ...extra });
}

// La partida se gana en el instante en que un equipo llega a la meta. Si al
// cerrar la mano dos equipos la cruzan a la vez con el MISMO puntaje, no hay
// ganador y se juega otra mano: hay que ganar por delante.
function checkWinner(match) {
  if (match.winner !== null) return;
  const reached = match.scores
    .map((score, team) => ({ team, score }))
    .filter((entry) => entry.score >= match.target);
  if (reached.length === 0) return;

  const best = Math.max(...reached.map((entry) => entry.score));
  const leaders = reached.filter((entry) => entry.score === best);
  if (leaders.length !== 1) return;

  match.winner = leaders[0].team;
  match.phase = "terminada";
  pushLog(match, { type: "fin-partida", team: match.winner, score: best });
}

// ---------------------------------------------------------------------------
// Creacion de la partida
// ---------------------------------------------------------------------------

export function createMatch({ players, target = 24, mode = "tradicional", seed } = {}) {
  if (![2, 3, 4].includes(players)) {
    throw new GameError("JUGADORES_INVALIDOS", "La mesa admite 2, 3 o 4 jugadores.");
  }
  if (!TARGETS.includes(target)) {
    throw new GameError("META_INVALIDA", "La meta de puntos debe ser 24 o 48.");
  }
  if (!MODES.includes(mode)) {
    throw new GameError("MODO_INVALIDO", 'El modo de mesa debe ser "tradicional" o "mayor-canto".');
  }

  const resolvedSeed = normalizeSeed(seed);
  const rng = createRng(resolvedSeed);
  const teams = buildTeams(players);
  // El primer repartidor sale del boton de barajar.
  const dealer = rng.int(players);

  return {
    players,
    target,
    mode,
    seed: resolvedSeed,
    rng: rng.state,
    teams,
    scores: teams.map(() => 0),
    dealer,
    handNumber: 0,
    phase: "reparto",
    hand: null,
    lastHand: null,
    winner: null,
    log: [{ hand: 0, type: "partida-creada", players, target, mode, dealer, seed: resolvedSeed }],
  };
}

// ---------------------------------------------------------------------------
// Jugadas legales
// ---------------------------------------------------------------------------

function describePlay(match, seat, card) {
  const hand = match.hand;
  const capture = resolveCapture(hand.table, card);

  // Caida = caer sobre la carta que ACABA de lanzar el jugador anterior.
  // Capturar cualquier otra carta vieja de la mesa es "recoger": te llevas
  // las cartas pero no suma puntos de valor.
  const isCaida =
    capture !== null && hand.lastPlayed !== null && hand.lastPlayed.value === card.value;
  const clearsTable = capture !== null && capture.remaining.length === 0;

  let points = 0;
  if (isCaida) points += caidaPoints(card.value);
  if (clearsTable) points += MESA_POINTS;

  const canto = hand.canto[seat];
  const canDeclare = canto !== null && !hand.declared[seat] && canto.cards.includes(card.id);

  const pending = hand.pendingCanto;
  const killsCanto = Boolean(
    isCaida && pending && pending.seat !== seat && capture.taken.some((c) => c.id === pending.card),
  );

  return {
    type: "jugar",
    card: card.id,
    value: card.value,
    captures: capture ? capture.taken.map((c) => c.id) : [],
    caida: isCaida,
    mesaLimpia: clearsTable,
    points,
    canDeclare,
    canto: canDeclare ? { type: canto.type, points: canto.points } : null,
    killsCanto,
  };
}

export function legalMoves(match, seat) {
  if (!Number.isInteger(seat) || seat < 0 || seat >= match.players) return [];
  if (match.winner !== null) return [];

  if (match.phase === "reparto") {
    if (seat !== match.dealer) return [];
    return DEAL_FIRST.map((first) => ({ type: "repartir", first }));
  }

  // Contando la mesa: solo el repartidor actua, y solo puede cantar el numero
  // que toca. Abre por el 1 o por el 4 y de ahi sigue la fila; no puede
  // saltar al 2 ni al 3.
  if (match.phase === "contando") {
    if (seat !== match.hand.dealer) return [];
    return countableNumbers(match.hand).map((numero) => ({ type: "contar", numero }));
  }

  if (match.phase !== "juego") return [];
  const hand = match.hand;
  if (hand.turn !== seat) return [];
  return hand.hands[seat].map((card) => describePlay(match, seat, card));
}

// ---------------------------------------------------------------------------
// Reparto
// ---------------------------------------------------------------------------

function dealThree(match) {
  const hand = match.hand;
  const tandaVieja = hand.deals;

  // Repartir corta el hilo de la ronda. Ni se puede caer sobre la carta que
  // quedo en la mesa de la tanda anterior —la caida es sobre la carta que
  // acaba de soltar el de al lado, jugando— ni queda ventana para matar un
  // canto: quien lo canto ya se lo gano.
  hand.lastPlayed = null;
  hand.pendingCanto = null;
  resolveCantos(match, tandaVieja);

  for (let round = 0; round < HAND_SIZE; round += 1) {
    for (let offset = 1; offset <= match.players; offset += 1) {
      const seat = (hand.dealer + offset) % match.players;
      if (hand.deck.length > 0) hand.hands[seat].push(hand.deck.shift());
    }
  }
  // Los cantos se miran en cada tanda de 3 cartas nuevas, no solo en la
  // primera: una mano dura todo el mazo.
  hand.canto = hand.hands.map((cards) => detectCanto(cards));
  hand.declared = hand.hands.map(() => false);
  hand.deals += 1;
}

function dealHand(match, { first }) {
  const next = structuredClone(match);
  const players = next.players;
  const dealer = next.dealer;

  const rng = createRng(next.rng);
  const deck = shuffle(createDeck(), rng);
  next.rng = rng.state;

  const hands = Array.from({ length: players }, () => []);
  const table = [];

  const giveHands = () => {
    for (let round = 0; round < HAND_SIZE; round += 1) {
      for (let offset = 1; offset <= players; offset += 1) {
        hands[(dealer + offset) % players].push(deck.shift());
      }
    }
  };

  // Las 4 cartas de mesa nunca repiten valor entre si. En vez de simular el
  // redibujo del mazo fisico, saltamos la carta repetida y seguimos bajando.
  const giveTable = () => {
    const used = new Set();
    while (table.length < TABLE_SIZE) {
      const index = deck.findIndex((card) => !used.has(card.value));
      const [card] = deck.splice(index, 1);
      used.add(card.value);
      table.push(card);
    }
  };

  if (first === "manos") {
    giveHands();
    giveTable();
  } else {
    giveTable();
    giveHands();
  }

  next.handNumber += 1;
  // Repartidas las cartas, todavia falta contar la mesa. Hasta que el
  // repartidor no ponga las cuatro cantando su numero, no juega nadie: es
  // asi en la mesa de verdad, y ademas es lo que hace que las cartas se vean
  // salir una a una en vez de aparecer las cuatro de golpe.
  next.phase = "contando";
  next.hand = {
    dealer,
    first,
    direction: null,
    deck,
    hands,
    table,
    contadas: 0,
    aciertos: [],
    captured: Array.from({ length: players }, () => []),
    canto: hands.map((cards) => detectCanto(cards)),
    declared: hands.map(() => false),
    declaredCantos: [],
    turn: (dealer + 1) % players,
    lastPlayed: null,
    pendingCanto: null,
    lastCapturer: null,
    deals: 1,
  };
  pushLog(next, { type: "reparto", hand: next.handNumber, dealer, first });
  return next;
}

/** El numero que se canta en cada posicion, segun el sentido. */
function countNumbers(direction) {
  return direction === "ascendente" ? [1, 2, 3, 4] : [4, 3, 2, 1];
}

/** Qué numeros puede cantar el repartidor ahora mismo. */
function countableNumbers(hand) {
  if (hand.direction === null) return [1, TABLE_SIZE]; // se abre por el 1 o por el 4
  return [countNumbers(hand.direction)[hand.contadas]];
}

/**
 * El repartidor pone la siguiente carta de la mesa cantando su numero. Si el
 * valor de la carta coincide con el numero, esos puntos son suyos, y se
 * cobran en el acto.
 */
function countCard(match, { numero }) {
  const next = structuredClone(match);
  const hand = next.hand;

  if (hand.direction === null) {
    hand.direction = numero === 1 ? "ascendente" : "descendente";
  }

  const posicion = hand.contadas;
  const card = hand.table[posicion];
  hand.contadas += 1;

  if (card.value === numero) {
    hand.aciertos.push({ position: posicion + 1, number: numero, card: card.id });
    pushLog(next, { type: "mesa-cantada", seat: hand.dealer, number: numero, card: card.id, points: numero });
    addScore(next, teamOf(next, hand.dealer), numero, "mesa-cantada", { seat: hand.dealer });
  } else {
    pushLog(next, { type: "contada", seat: hand.dealer, number: numero, card: card.id });
  }

  if (hand.contadas === TABLE_SIZE) {
    next.phase = "juego";
    if (hand.aciertos.length === 0) {
      // Mal echada: no acerto ni una, y el primero en jugar se lleva el consuelo.
      const consoled = (hand.dealer + 1) % next.players;
      pushLog(next, { type: "mal-echada", seat: consoled });
      addScore(next, teamOf(next, consoled), MAL_ECHADA_POINTS, "mal-echada", { seat: consoled });
    }
    pushLog(next, { type: "mesa-puesta", seat: hand.dealer });
  }

  checkWinner(next);
  return next;
}

// ---------------------------------------------------------------------------
// Cierre de la mano
// ---------------------------------------------------------------------------

/**
 * Cobra un canto que ya esta a salvo. En Tradicional esto pasa en cuanto se
 * cierra la ventana del mata canto, no al final de la mano: si cantas Patrulla
 * y el de tu derecha no te cae, los 6 puntos son tuyos ya, en el marcador.
 *
 * La Ronda es la excepcion: no cuenta hasta que sueltas las DOS del par. Se
 * canta al jugar la primera, pero mientras la otra siga en tu mano el canto
 * esta a medias. Cuando cae la segunda y nadie te ha caido, ahi se ve.
 */
function pagarCanto(match, canto) {
  if (canto.killed || canto.paid) return;
  if (!canto.safe) return;

  const enMano = match.hand.hands[canto.seat] ?? [];
  const faltan = (canto.esperaCartas ?? []).filter((id) => enMano.some((c) => c.id === id));
  if (faltan.length > 0) return;

  canto.paid = true;
  const team = teamOf(match, canto.seat);
  pushLog(match, {
    type: "canto-cobrado",
    team,
    canto: canto.type,
    deal: canto.deal,
    points: canto.points,
    seats: [canto.seat],
  });
  addScore(match, team, canto.points, "canto");
}

/**
 * Cierra los cantos de una tanda.
 *
 * En Tradicional cada canto ya se cobro solo al quedar a salvo, asi que aqui
 * solo quedan los que se declararon sin que nadie llegara a tener turno para
 * matarlos (por ejemplo, cantar con la ultima carta de la tanda).
 *
 * En Mayor Canto no se puede pagar al instante: hay que comparar con los demas
 * cantos de la misma tanda, y para eso hay que esperar a que la tanda termine.
 */
function resolveCantos(match, soloTanda = null) {
  const hand = match.hand;
  const pendientes = hand.declaredCantos.filter(
    (canto) => !canto.killed && !canto.paid && (soloTanda === null || canto.deal === soloTanda),
  );
  if (pendientes.length === 0) return;

  if (match.mode === "tradicional") {
    for (const canto of pendientes) {
      // Se acaba la tanda: ya nadie puede matarlo y las cartas que faltaban
      // por soltar se sueltan igual, asi que el canto se ve entero.
      canto.safe = true;
      canto.esperaCartas = [];
      pagarCanto(match, canto);
    }
    return;
  }

  // Mayor Canto: solo cobra el canto mas alto, comparado dentro de la MISMA
  // tanda de 3 cartas, que es cuando todos tienen mano comparable.
  const buckets = new Map();
  for (const canto of pendientes) {
    const bucket = buckets.get(canto.deal);
    if (bucket) bucket.push(canto);
    else buckets.set(canto.deal, [canto]);
  }

  for (const group of buckets.values()) {
    for (const canto of group) canto.paid = true;
    const best = Math.max(...group.map((canto) => canto.points));
    let leaders = group.filter((canto) => canto.points === best);

    // Mismos puntos no es lo mismo que empate: una patrulla 4,5,6 le gana a
    // una 1,2,3 aunque las dos valgan 6. Solo se pisan si tambien coinciden
    // los numeros de las cartas.
    if (leaders.length > 1) {
      let top = leaders[0].rank;
      for (const canto of leaders) {
        if (compareRank(canto.rank, top) > 0) top = canto.rank;
      }
      leaders = leaders.filter((canto) => compareRank(canto.rank, top) === 0);
    }

    const teams = new Set(leaders.map((canto) => teamOf(match, canto.seat)));

    if (teams.size > 1) {
      // Dos rivales con el mismo canto y del mismo valor se pisan: no suma nadie.
      pushLog(match, {
        type: "canto-anulado",
        canto: leaders[0].type,
        deal: leaders[0].deal,
        points: best,
        seats: leaders.map((canto) => canto.seat),
      });
      continue;
    }

    const team = [...teams][0];
    pushLog(match, {
      type: "canto-cobrado",
      team,
      canto: leaders[0].type,
      deal: leaders[0].deal,
      points: best,
      seats: leaders.map((canto) => canto.seat),
    });
    addScore(match, team, best, "canto");
  }
}

function countCards(match) {
  const hand = match.hand;
  const detail = match.teams.map((seats, team) => {
    const cards = seats.reduce((sum, seat) => sum + hand.captured[seat].length, 0);
    const threshold = seats.reduce(
      (sum, seat) => sum + cardThreshold(match.players, seat, hand.dealer),
      0,
    );
    return { team, cards, threshold, points: Math.max(0, cards - threshold) };
  });

  for (const entry of detail) {
    pushLog(match, { type: "cartas", ...entry });
    addScore(match, entry.team, entry.points, "cartas");
  }
  return detail;
}

function closeHand(match) {
  const hand = match.hand;

  // Lo que quede suelto en la mesa se lo lleva quien hizo la ultima captura.
  if (hand.table.length > 0 && hand.lastCapturer !== null) {
    pushLog(match, {
      type: "ultimas",
      seat: hand.lastCapturer,
      cards: hand.table.map((card) => card.id),
    });
    hand.captured[hand.lastCapturer].push(...hand.table);
    hand.table = [];
  }
  // La mesa quedo vacia, asi que ya no hay carta recien lanzada. Importa
  // porque si la partida se gana justo aqui, este estado es el que se queda
  // en pantalla.
  hand.lastPlayed = null;

  resolveCantos(match);
  const cards = countCards(match);
  checkWinner(match);

  match.lastHand = {
    number: match.handNumber,
    dealer: hand.dealer,
    cards,
    cantos: hand.declaredCantos.map(cantoPublico),
    scores: [...match.scores],
  };
  pushLog(match, { type: "fin-mano", hand: match.handNumber });

  if (match.winner === null) {
    match.dealer = (match.dealer + 1) % match.players;
    match.phase = "reparto";
    match.hand = null;
  }
  return match;
}

// ---------------------------------------------------------------------------
// Jugar una carta
// ---------------------------------------------------------------------------

function playCard(match, seat, plan, declare) {
  const next = structuredClone(match);
  const hand = next.hand;

  const index = hand.hands[seat].findIndex((card) => card.id === plan.card);
  const [card] = hand.hands[seat].splice(index, 1);

  // El canto del turno anterior solo se puede matar AHORA. Se saca de la mesa
  // antes de nada para que no sobreviva a este turno pase lo que pase.
  const pending = hand.pendingCanto;
  hand.pendingCanto = null;

  const capture = resolveCapture(hand.table, card);
  let isCaida = false;
  let points = 0;

  if (capture) {
    isCaida = hand.lastPlayed !== null && hand.lastPlayed.value === card.value;
    const mesaLimpia = capture.remaining.length === 0;

    hand.table = capture.remaining;
    hand.captured[seat].push(...capture.taken, card);
    hand.lastCapturer = seat;
    // Tras una captura no queda "carta recien lanzada": el siguiente no puede caer.
    hand.lastPlayed = null;

    if (isCaida) points += caidaPoints(card.value);
    if (mesaLimpia) points += MESA_POINTS;

    pushLog(next, {
      type: isCaida ? "caida" : "recoger",
      seat,
      card: card.id,
      taken: capture.taken.map((c) => c.id),
      mesaLimpia,
      points,
    });
  } else {
    hand.table.push(card);
    hand.lastPlayed = { seat, id: card.id, value: card.value };
    pushLog(next, { type: "lanzar", seat, card: card.id });
  }

  // Mata canto: solo el de la derecha del que canto, cayendole a esa misma
  // carta. Se resuelve AHORA, en este turno: o muere, o queda a salvo y se
  // cobra al momento.
  if (pending) {
    const cantado = hand.declaredCantos.find((canto) => canto.id === pending.id);
    if (isCaida && capture.taken.some((c) => c.id === pending.card)) {
      cantado.killed = true;
      cantado.killedBy = seat;
      pushLog(next, { type: "mata-canto", seat, victim: pending.seat, canto: cantado.type });
    } else {
      // Sobrevivio la ventana. Ya no se lo puede matar nadie.
      cantado.safe = true;
      if (next.mode === "tradicional") pagarCanto(next, cantado);
    }
  }

  if (declare) {
    const canto = hand.canto[seat];
    const entry = {
      id: `${next.handNumber}-${hand.deals}-${seat}`,
      seat,
      deal: hand.deals,
      type: canto.type,
      points: canto.points,
      rank: canto.rank,
      killed: false,
      safe: false,
      // La Ronda no cuenta hasta soltar las dos del par. Los demas cantos no
      // esperan a nada mas que a que se cierre la ventana del mata canto.
      esperaCartas: canto.type === CANTOS.RONDA ? [...canto.cards] : [],
    };
    hand.declaredCantos.push(entry);
    hand.declared[seat] = true;
    pushLog(next, { type: "canto", seat, canto: canto.type, points: canto.points });

    // Solo es matable si la carta cantada quedo en la mesa. Si cantaste
    // haciendo caida, la carta se fue a tu monton, nadie te la puede matar y
    // los puntos son tuyos ya mismo.
    if (capture) {
      entry.safe = true;
      if (next.mode === "tradicional") pagarCanto(next, entry);
    } else {
      hand.pendingCanto = { id: entry.id, seat, card: card.id, value: card.value };
    }
  }

  // Al soltar una carta puede completarse una Ronda que estaba a medias.
  if (next.mode === "tradicional") {
    for (const canto of hand.declaredCantos) {
      if (canto.seat === seat) pagarCanto(next, canto);
    }
  }

  const reason = isCaida ? "caida" : "mesa-limpia";
  addScore(next, teamOf(next, seat), points, reason, { seat });
  checkWinner(next);
  if (next.winner !== null) return next;

  hand.turn = (seat + 1) % next.players;

  if (hand.hands.every((cards) => cards.length === 0)) {
    if (hand.deck.length > 0) {
      dealThree(next);
      pushLog(next, { type: "reparto-parcial", hand: next.handNumber, deals: hand.deals });
    } else {
      return closeHand(next);
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// Punto de entrada de las acciones
// ---------------------------------------------------------------------------

export function applyMove(match, seat, move) {
  if (match.winner !== null) {
    throw new GameError("PARTIDA_TERMINADA", "La partida ya termino.");
  }

  const legal = legalMoves(match, seat);
  if (legal.length === 0) {
    throw new GameError("FUERA_DE_TURNO", "No es tu turno.");
  }

  if (move?.type === "repartir") {
    const chosen = legal.find(
      (option) => option.type === "repartir" && option.first === move.first,
    );
    if (!chosen) {
      throw new GameError("REPARTO_INVALIDO", 'Elige repartir primero "manos" o "mesa".');
    }
    return dealHand(match, chosen);
  }

  if (move?.type === "contar") {
    const chosen = legal.find(
      (option) => option.type === "contar" && option.numero === move.numero,
    );
    if (!chosen) {
      const toca = countableNumbers(match.hand).join(" o el ");
      throw new GameError("CONTEO_INVALIDO", `Ahora toca poner el ${toca}.`);
    }
    return countCard(match, chosen);
  }

  if (move?.type === "jugar") {
    const chosen = legal.find((option) => option.type === "jugar" && option.card === move.card);
    if (!chosen) {
      throw new GameError("CARTA_INVALIDA", "Esa carta no esta en tu mano.");
    }
    // El canto es obligatorio: si juegas una carta que forma tu canto, lo
    // cantas. No existe jugar callado, ni aqui ni en la mesa de verdad.
    return playCard(match, seat, chosen, chosen.canDeclare);
  }

  throw new GameError("JUGADA_DESCONOCIDA", "Jugada no reconocida.");
}

// ---------------------------------------------------------------------------
// Vista por jugador
// ---------------------------------------------------------------------------

/**
 * Lo que ve UN jugador. Nunca incluye las cartas de los demas ni el orden del
 * mazo: aunque alguien inspeccione el trafico del socket, no hay nada que
 * espiar. Esa es la razon de que exista esta funcion.
 */
export function publicStateFor(match, seat) {
  const view = {
    seat,
    players: match.players,
    target: match.target,
    mode: match.mode,
    teams: match.teams,
    team: teamOf(match, seat),
    scores: match.scores,
    dealer: match.dealer,
    phase: match.phase,
    handNumber: match.handNumber,
    winner: match.winner,
    lastHand: match.lastHand,
    legalMoves: legalMoves(match, seat),
    hand: null,
    // Lo ultimo que paso, para que la interfaz pueda animarlo y narrarlo.
    // SOLO de la mano en curso: ver el comentario de `pushLog`.
    events: match.log.filter((entry) => entry.hand === match.handNumber).slice(-EVENT_FEED),
    eventCount: match.log.length,
  };

  const hand = match.hand;
  if (hand) {
    view.hand = {
      dealer: hand.dealer,
      first: hand.first,
      direction: hand.direction,
      turn: hand.turn,
      // Mientras se cuenta la mesa solo se ven las cartas ya puestas: el
      // reveldo lo manda el servidor, asi que todos ven lo mismo a la vez.
      table: (match.phase === "contando" ? hand.table.slice(0, hand.contadas) : hand.table).map(
        (card) => ({ ...card }),
      ),
      contadas: hand.contadas ?? TABLE_SIZE,
      aciertos: (hand.aciertos ?? []).map((a) => ({ ...a })),
      myCards: (hand.hands[seat] ?? []).map((card) => ({ ...card })),
      myCanto: hand.canto[seat] ? { ...hand.canto[seat] } : null,
      myCantoDeclared: hand.declared[seat] ?? false,
      // `myCanto` sigue describiendo el canto de la tanda aunque ya hayas
      // jugado parte de sus cartas. Esto dice si TODAVIA queda alguna con la
      // que declararlo, que es lo que la interfaz necesita para resaltarlas.
      myCantoPlayable: Boolean(
        hand.canto[seat] &&
          !hand.declared[seat] &&
          (hand.hands[seat] ?? []).some((card) => hand.canto[seat].cards.includes(card.id)),
      ),
      cardsLeft: hand.hands.map((cards) => cards.length),
      capturedCount: hand.captured.map((cards) => cards.length),
      // Cartas capturadas por equipo y el umbral que tienen que pasar. Va
      // aqui y no en el cliente para no repetir la regla de los umbrales.
      teamCards: match.teams.map((seats) =>
        seats.reduce((sum, s) => sum + hand.captured[s].length, 0),
      ),
      teamThreshold: match.teams.map((seats) =>
        seats.reduce((sum, s) => sum + cardThreshold(match.players, s, hand.dealer), 0),
      ),
      deckLeft: hand.deck.length,
      lastPlayed: hand.lastPlayed ? { ...hand.lastPlayed } : null,
      lastCapturer: hand.lastCapturer,
      cantos: hand.declaredCantos.map(cantoPublico),
      pendingCanto: hand.pendingCanto
        ? { seat: hand.pendingCanto.seat, card: hand.pendingCanto.card }
        : null,
    };
  }

  return view;
}
