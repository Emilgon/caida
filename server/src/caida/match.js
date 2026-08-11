import { GameError } from "./errors.js";
import { caidaPoints, createDeck, nextValue } from "./deck.js";
import { detectCanto } from "./cantos.js";
import { createRng, normalizeSeed, shuffle } from "./rng.js";

export const MODES = ["tradicional", "mayor-canto"];
export const TARGETS = [24, 48];
export const DEAL_FIRST = ["manos", "mesa"];
export const DIRECTIONS = ["ascendente", "descendente"];

export const MESA_POINTS = 4; // dejar la mesa vacia al capturar
export const MAL_ECHADA_POINTS = 1; // consuelo si el repartidor no acerto ninguna
export const HAND_SIZE = 3;
export const TABLE_SIZE = 4;

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

function addScore(match, team, points, reason, extra = {}) {
  if (points <= 0 || match.winner !== null) return;
  match.scores[team] += points;
  match.log.push({ type: "puntos", team, points, reason, ...extra });
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
  match.log.push({ type: "fin-partida", team: match.winner, score: best });
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
    log: [{ type: "partida-creada", players, target, mode, dealer, seed: resolvedSeed }],
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
    const moves = [];
    for (const first of DEAL_FIRST) {
      for (const direction of DIRECTIONS) {
        moves.push({ type: "repartir", first, direction });
      }
    }
    return moves;
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

function dealHand(match, { first, direction }) {
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
  next.phase = "juego";
  next.hand = {
    dealer,
    first,
    direction,
    deck,
    hands,
    table,
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
  next.log.push({ type: "reparto", hand: next.handNumber, dealer, first, direction });

  // Conteo de la mesa: se van cantando los numeros segun el sentido elegido y
  // cada carta que coincida con su numero le da esos puntos al repartidor.
  const numbers = direction === "ascendente" ? [1, 2, 3, 4] : [4, 3, 2, 1];
  const hits = [];
  let mesaPoints = 0;
  table.forEach((card, index) => {
    if (card.value === numbers[index]) {
      hits.push({ position: index + 1, number: numbers[index], card: card.id });
      mesaPoints += numbers[index];
    }
  });

  if (mesaPoints > 0) {
    next.log.push({ type: "mesa-cantada", seat: dealer, hits, points: mesaPoints });
    addScore(next, teamOf(next, dealer), mesaPoints, "mesa-cantada", { seat: dealer });
  } else {
    const consoled = (dealer + 1) % players;
    next.log.push({ type: "mal-echada", seat: consoled });
    addScore(next, teamOf(next, consoled), MAL_ECHADA_POINTS, "mal-echada", { seat: consoled });
  }

  checkWinner(next);
  return next;
}

// ---------------------------------------------------------------------------
// Cierre de la mano
// ---------------------------------------------------------------------------

function resolveCantos(match) {
  const hand = match.hand;
  const alive = hand.declaredCantos.filter((canto) => !canto.killed);
  if (alive.length === 0) return;

  // Los cantos compiten entre si dentro de la MISMA tanda de 3 cartas, que es
  // cuando todos tienen mano comparable. Una mano dura todo el mazo (varias
  // tandas), y no tiene sentido enfrentar una Ronda de la tanda 1 contra otra
  // de la tanda 5.
  //   Tradicional: dentro de la tanda, cada TIPO se resuelve por separado.
  //   Mayor Canto: dentro de la tanda solo cuenta el mas alto, del tipo que sea.
  const key =
    match.mode === "mayor-canto"
      ? (canto) => `${canto.deal}`
      : (canto) => `${canto.deal}:${canto.type}`;

  const buckets = new Map();
  for (const canto of alive) {
    const bucket = buckets.get(key(canto));
    if (bucket) bucket.push(canto);
    else buckets.set(key(canto), [canto]);
  }
  const groups = [...buckets.values()];

  for (const group of groups) {
    const best = Math.max(...group.map((canto) => canto.points));
    const leaders = group.filter((canto) => canto.points === best);
    const teams = new Set(leaders.map((canto) => teamOf(match, canto.seat)));

    if (teams.size > 1) {
      // Dos rivales con el mismo canto y del mismo valor se pisan: no suma nadie.
      match.log.push({
        type: "canto-anulado",
        canto: leaders[0].type,
        deal: leaders[0].deal,
        points: best,
        seats: leaders.map((canto) => canto.seat),
      });
      continue;
    }

    const team = [...teams][0];
    match.log.push({
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
    match.log.push({ type: "cartas", ...entry });
    addScore(match, entry.team, entry.points, "cartas");
  }
  return detail;
}

function closeHand(match) {
  const hand = match.hand;

  // Lo que quede suelto en la mesa se lo lleva quien hizo la ultima captura.
  if (hand.table.length > 0 && hand.lastCapturer !== null) {
    match.log.push({
      type: "ultimas",
      seat: hand.lastCapturer,
      cards: hand.table.map((card) => card.id),
    });
    hand.captured[hand.lastCapturer].push(...hand.table);
    hand.table = [];
  }

  resolveCantos(match);
  const cards = countCards(match);
  checkWinner(match);

  match.lastHand = {
    number: match.handNumber,
    dealer: hand.dealer,
    cards,
    cantos: hand.declaredCantos.map((canto) => ({ ...canto })),
    scores: [...match.scores],
  };
  match.log.push({ type: "fin-mano", hand: match.handNumber });

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

    next.log.push({
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
    next.log.push({ type: "lanzar", seat, card: card.id });
  }

  // Mata canto: solo el de la derecha del que canto, cayendole a esa misma carta.
  if (pending && isCaida && capture.taken.some((c) => c.id === pending.card)) {
    const victim = hand.declaredCantos.find((canto) => canto.id === pending.id);
    victim.killed = true;
    victim.killedBy = seat;
    next.log.push({ type: "mata-canto", seat, victim: pending.seat, canto: victim.type });
  }

  if (declare) {
    const canto = hand.canto[seat];
    const entry = {
      id: `${next.handNumber}-${hand.deals}-${seat}`,
      seat,
      deal: hand.deals,
      type: canto.type,
      points: canto.points,
      killed: false,
    };
    hand.declaredCantos.push(entry);
    hand.declared[seat] = true;
    next.log.push({ type: "canto", seat, canto: canto.type, points: canto.points });

    // Solo es matable si la carta cantada quedo en la mesa. Si cantaste
    // haciendo caida, la carta se fue a tu monton y nadie te la puede matar.
    if (!capture) {
      hand.pendingCanto = { id: entry.id, seat, card: card.id, value: card.value };
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
      next.log.push({ type: "reparto-parcial", hand: next.handNumber, deals: hand.deals });
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
      (option) =>
        option.type === "repartir" &&
        option.first === move.first &&
        option.direction === move.direction,
    );
    if (!chosen) {
      throw new GameError(
        "REPARTO_INVALIDO",
        'Elige repartir primero "manos" o "mesa", y contar "ascendente" o "descendente".',
      );
    }
    return dealHand(match, chosen);
  }

  if (move?.type === "jugar") {
    const chosen = legal.find((option) => option.type === "jugar" && option.card === move.card);
    if (!chosen) {
      throw new GameError("CARTA_INVALIDA", "Esa carta no esta en tu mano.");
    }
    const declare = Boolean(move.cantar);
    if (declare && !chosen.canDeclare) {
      throw new GameError("CANTO_INVALIDO", "Esa carta no te sirve para cantar.");
    }
    return playCard(match, seat, chosen, declare);
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
  };

  const hand = match.hand;
  if (hand) {
    view.hand = {
      dealer: hand.dealer,
      first: hand.first,
      direction: hand.direction,
      turn: hand.turn,
      table: hand.table.map((card) => ({ ...card })),
      myCards: (hand.hands[seat] ?? []).map((card) => ({ ...card })),
      myCanto: hand.canto[seat] ? { ...hand.canto[seat] } : null,
      myCantoDeclared: hand.declared[seat] ?? false,
      cardsLeft: hand.hands.map((cards) => cards.length),
      capturedCount: hand.captured.map((cards) => cards.length),
      deckLeft: hand.deck.length,
      lastPlayed: hand.lastPlayed ? { ...hand.lastPlayed } : null,
      lastCapturer: hand.lastCapturer,
      cantos: hand.declaredCantos.map((canto) => ({ ...canto })),
      pendingCanto: hand.pendingCanto
        ? { seat: hand.pendingCanto.seat, card: hand.pendingCanto.card }
        : null,
    };
  }

  return view;
}
