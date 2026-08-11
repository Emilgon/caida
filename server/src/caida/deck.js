// Baraja espanola de 40 cartas. No hay 8 ni 9: despues del 7 viene la sota
// (10), el caballo (11) y el rey (12). Para todo lo que es "consecutivo"
// (escaleras y patrullas) el 7 y el 10 SI son vecinos, porque en la baraja
// fisica lo son.

export const SUITS = ["oros", "copas", "espadas", "bastos"];
export const VALUES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

const ORDER = new Map(VALUES.map((value, index) => [value, index]));

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ id: `${suit}-${value}`, suit, value });
    }
  }
  return deck;
}

export function orderIndex(value) {
  const index = ORDER.get(value);
  return index === undefined ? -1 : index;
}

// El valor que sigue en la escalera, o null si es el tope (12).
export function nextValue(value) {
  const index = orderIndex(value);
  if (index === -1) return null;
  return VALUES[index + 1] ?? null;
}

export function areConsecutive(a, b) {
  const ia = orderIndex(a);
  const ib = orderIndex(b);
  if (ia === -1 || ib === -1) return false;
  return Math.abs(ia - ib) === 1;
}

// Puntos de una caida segun el valor. La misma tabla vale para la Ronda.
export function caidaPoints(value) {
  switch (value) {
    case 10:
      return 2;
    case 11:
      return 3;
    case 12:
      return 4;
    default:
      return 1;
  }
}
