// Toda regla del juego que se rompe sale por aqui, nunca por un throw
// generico. El `message` esta escrito para mostrarselo al jugador tal cual,
// y el `code` es lo que el cliente usa para decidir (nunca comparar textos).
export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GameError";
    this.code = code;
  }
}
