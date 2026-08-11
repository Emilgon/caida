import { randomBytes, randomUUID } from "node:crypto";

// Sin 0/O ni 1/I/L: el codigo se dicta por WhatsApp o en voz alta y no queremos
// que nadie se quede afuera por confundir un cero con una O.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function generateCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/**
 * El token con el que un jugador vuelve a su asiento tras recargar la pagina
 * o perder la senal. Es un secreto: quien lo tenga puede jugar como esa
 * persona y ver sus cartas, asi que NUNCA viaja a los demas jugadores (ver
 * `publicRoom`) y por eso es aleatorio de verdad, no un contador.
 */
export function generatePlayerId() {
  return randomUUID();
}

// Los codigos se comparan siempre en mayusculas y sin espacios: el usuario los
// escribe a mano.
export function normalizeCode(code) {
  return typeof code === "string" ? code.trim().toUpperCase() : "";
}
