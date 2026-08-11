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
 * El canto es obligatorio: si juegas una carta del canto, lo cantas. Lo que el
 * bot SI puede elegir es con cual de esas cartas jugar, y eso importa:
 * cantando con una captura la carta se va a su monton y nadie se lo mata;
 * cantando al lanzar, el de su derecha puede caerle encima y anularselo.
 */
function riesgoDeCanto(move, view) {
  if (!move.canDeclare) return 0;
  if (move.captures.length > 0) return -6; // cantar a salvo, premio

  const canto = view.hand.myCanto;
  const enMano = view.hand.myCards.filter((card) => canto.cards.includes(card.id)).length;
  // Con otra carta del canto todavia en mano, mejor esperar un momento mejor.
  // Con la ultima, no hay nada que elegir: o se juega o se pierde el canto.
  return enMano > 1 ? canto.points * 0.8 : 0;
}

function scorePlay(move, view) {
  let score = move.points * WEIGHTS.points;
  score += move.captures.length * WEIGHTS.cards;
  if (move.killsCanto) score += WEIGHTS.killsCanto;
  score -= exposure(move, view) * WEIGHTS.exposure;
  score -= riesgoDeCanto(move, view);

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

  // Repartir y contar la mesa: sin ver el mazo no hay forma de elegir mejor
  // que al azar, igual que una persona.
  if (options[0].type === "repartir" || options[0].type === "contar") {
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

  // `cantar` ya no se decide aqui: el motor canta solo cuando toca.
  return { type: "jugar", card: best.card };
}
