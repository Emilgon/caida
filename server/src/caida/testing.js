// Utilidades SOLO para los tests: permiten sentar una posicion exacta
// (que hay en la mesa, que tiene cada quien) sin depender de la semilla.
// El estado del motor es data plana, asi que se puede construir a mano.

import { detectCanto } from "./cantos.js";
import { createDeck } from "./deck.js";

const DECK_BY_ID = new Map(createDeck().map((card) => [card.id, card]));

/** `card("oros-12")` -> la carta real del mazo. */
export function card(id) {
  const found = DECK_BY_ID.get(id);
  if (!found) throw new Error(`carta inexistente en el mazo: ${id}`);
  return { ...found };
}

export function cards(...ids) {
  return ids.map(card);
}

/**
 * Arma una partida en fase de juego con una posicion concreta.
 * Lo que no se pasa queda vacio, asi cada test dice solo lo que le importa.
 */
export function scenario({
  players = 2,
  mode = "tradicional",
  target = 24,
  dealer = 0,
  turn,
  hands = [],
  table = [],
  deck = [],
  captured,
  scores,
  lastPlayed = null,
  pendingCanto = null,
  declaredCantos = [],
  deals = 1,
  lastCapturer = null,
  handNumber = 1,
} = {}) {
  const teams = players === 4 ? [[0, 2], [1, 3]] : Array.from({ length: players }, (_, i) => [i]);
  const filledHands = Array.from({ length: players }, (_, seat) => hands[seat] ?? []);

  return {
    players,
    target,
    mode,
    seed: 1,
    rng: 1,
    teams,
    scores: scores ?? teams.map(() => 0),
    dealer,
    handNumber,
    phase: "juego",
    winner: null,
    lastHand: null,
    log: [],
    hand: {
      dealer,
      first: "manos",
      direction: "ascendente",
      deck: [...deck],
      hands: filledHands,
      table: [...table],
      captured: captured ?? Array.from({ length: players }, () => []),
      canto: filledHands.map((handCards) => detectCanto(handCards)),
      declared: filledHands.map(() => false),
      declaredCantos: declaredCantos.map((canto) => ({ rank: [], ...canto })),
      turn: turn ?? (dealer + 1) % players,
      lastPlayed,
      pendingCanto,
      lastCapturer,
      deals,
    },
  };
}

/** Cuenta todas las cartas vivas de una mano: deben ser siempre 40. */
export function countAllCards(match) {
  const hand = match.hand;
  if (!hand) return 0;
  return (
    hand.deck.length +
    hand.table.length +
    hand.hands.reduce((sum, cardsInHand) => sum + cardsInHand.length, 0) +
    hand.captured.reduce((sum, pile) => sum + pile.length, 0)
  );
}
