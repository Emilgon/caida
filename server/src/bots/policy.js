import { caidaPoints } from "../caida/index.js";

// El bot decide con la MISMA vista que recibe un humano (`publicStateFor`):
// no ve las cartas de nadie ni el mazo. Es a proposito — si el bot pudiera
// espiar, jugaria de una forma que nunca podras reproducir tu, y sus errores
// no te servirian para probar el juego.

// Cuanto pesa cada cosa al comparar jugadas. Los puntos mandan; las cartas
// cuentan porque al cerrar la mano cada carta de mas es un punto.
const WEIGHTS = {
  points: 10,
  cards: 2,
  killsCanto: 8,
  // Lo que le regalas al siguiente si lanzas y te cae encima.
  exposure: 3,
};

/**
 * Cuanto arriesgas al dejar esta carta en la mesa. Un 12 tirado al aire le
 * regala 4 puntos a quien tenga otro 12; un 3 solo regala 1.
 */
function exposure(move, view) {
  if (move.captures.length > 0) return 0;
  const risk = caidaPoints(move.value);
  // Si la mesa queda vacia tras tu jugada no puede haber arrastre, pero la
  // carta sigue expuesta a la caida.
  const tableAfter = view.hand.table.length + 1;
  return risk + (tableAfter > 4 ? 1 : 0);
}

/**
 * Declarar el canto casi siempre conviene: si no lo declaras y te caen igual,
 * pierdes lo mismo. Lo que se puede elegir es CUANDO, y eso si importa:
 *  - cantando con una captura, la carta se va a tu monton y nadie la mata;
 *  - si es la ultima carta del canto que te queda, o cantas ahora o lo pierdes;
 *  - si no, conviene esperar un momento mas seguro.
 */
function shouldDeclare(move, view) {
  if (!move.canDeclare) return false;
  if (move.captures.length > 0) return true;

  const canto = view.hand.myCanto;
  const stillHolding = view.hand.myCards.filter((card) => canto.cards.includes(card.id));
  return stillHolding.length <= 1;
}

function scorePlay(move, view) {
  let score = move.points * WEIGHTS.points;
  score += move.captures.length * WEIGHTS.cards;
  if (move.killsCanto) score += WEIGHTS.killsCanto;
  score -= exposure(move, view) * WEIGHTS.exposure;

  // Entre dos jugadas parecidas, soltar la carta chica y guardar la grande:
  // las figuras valen mas cuando caes con ellas mas adelante.
  if (move.captures.length === 0) score -= caidaPoints(move.value) * 0.5;

  return score;
}

/**
 * Elige una jugada entre las legales de la vista. `random` se inyecta para
 * que los tests sean reproducibles.
 */
export function chooseMove(view, random = Math.random) {
  const options = view.legalMoves;
  if (!options || options.length === 0) return null;

  // Repartir: sin ver el mazo no hay forma de elegir mejor que al azar.
  if (options[0].type === "repartir") {
    return options[Math.floor(random() * options.length)];
  }

  let best = null;
  let bestScore = -Infinity;
  for (const move of options) {
    // Un pelo de ruido para que dos bots iguales no jueguen siempre calcado.
    const score = scorePlay(move, view) + random() * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return { type: "jugar", card: best.card, cantar: shouldDeclare(best, view) };
}
