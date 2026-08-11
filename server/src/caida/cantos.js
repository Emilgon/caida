import { areConsecutive, caidaPoints, orderIndex } from "./deck.js";

// Una mano de 3 cartas forma como maximo UN canto: si encaja en varios
// (1,12,12 es a la vez Casa Grande y Ronda de 12), vale el de mas puntos.
// Por eso se chequean de mayor a menor y se devuelve el primero que pegue.
export const CANTOS = {
  CASA_GRANDE: "casa-grande",
  CASA_CHICA: "casa-chica",
  REGISTRICO: "registrico",
  REGISTRO: "registro",
  VIGIA: "vigia",
  PATRULLA: "patrulla",
  TRIVILIN: "trivilin",
  RONDA: "ronda",
};

export const CANTO_LABELS = {
  [CANTOS.CASA_GRANDE]: "Casa Grande",
  [CANTOS.CASA_CHICA]: "Casa Chica",
  [CANTOS.REGISTRICO]: "Registrico",
  [CANTOS.REGISTRO]: "Registro",
  [CANTOS.VIGIA]: "Vigia",
  [CANTOS.PATRULLA]: "Patrulla",
  [CANTOS.TRIVILIN]: "Trivilin",
  [CANTOS.RONDA]: "Ronda",
};

function sortedValues(cards) {
  return cards.map((card) => card.value).sort((a, b) => orderIndex(a) - orderIndex(b));
}

function isExactly(values, target) {
  return values.length === target.length && values.every((value, i) => value === target[i]);
}

// Devuelve el valor que esta repetido exactamente dos veces, o null.
function pairValue(values) {
  for (const value of values) {
    if (values.filter((other) => other === value).length === 2) return value;
  }
  return null;
}

function canto(type, points, cards) {
  return { type, points, cards: cards.map((card) => card.id) };
}

/**
 * Detecta el canto de una mano de 3 cartas.
 * Devuelve `null` si no hay canto, o `{ type, points, cards }` donde `cards`
 * son los ids de las cartas que FORMAN el canto: al declararlo hay que jugar
 * una de ellas. En la Ronda solo son las dos del par, la suelta no cuenta.
 */
export function detectCanto(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) return null;

  const values = sortedValues(cards);
  const [a, b, c] = values;
  const pair = pairValue(values);

  if (isExactly(values, [1, 12, 12])) return canto(CANTOS.CASA_GRANDE, 12, cards);
  if (isExactly(values, [1, 11, 11])) return canto(CANTOS.CASA_CHICA, 11, cards);
  if (isExactly(values, [1, 10, 11])) return canto(CANTOS.REGISTRICO, 10, cards);
  if (isExactly(values, [1, 11, 12])) return canto(CANTOS.REGISTRO, 8, cards);

  // Vigia: par + una carta consecutiva a ese par (7,7,10 vale, 7,7,12 no).
  if (pair !== null) {
    const loose = values.find((value) => value !== pair);
    if (areConsecutive(pair, loose)) return canto(CANTOS.VIGIA, 7, cards);
  }

  if (areConsecutive(a, b) && areConsecutive(b, c)) return canto(CANTOS.PATRULLA, 6, cards);
  if (a === b && b === c) return canto(CANTOS.TRIVILIN, 5, cards);

  if (pair !== null) {
    const pairCards = cards.filter((card) => card.value === pair);
    return canto(CANTOS.RONDA, caidaPoints(pair), pairCards);
  }

  return null;
}
