// Superficie publica del motor. La capa de sockets (Fase 2) solo debe
// importar de aqui, nunca de los archivos internos.
export { GameError } from "./errors.js";
export { CANTOS, CANTO_LABELS, detectCanto } from "./cantos.js";
export { SUITS, VALUES, caidaPoints, createDeck, nextValue } from "./deck.js";
export {
  DEAL_FIRST,
  DIRECTIONS,
  HAND_SIZE,
  MAL_ECHADA_POINTS,
  MESA_POINTS,
  MODES,
  TABLE_SIZE,
  TARGETS,
  applyMove,
  createMatch,
  legalMoves,
  publicStateFor,
  resolveCapture,
} from "./match.js";
