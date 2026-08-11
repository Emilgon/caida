import { applyGameMove, currentSeat, gameViewFor, isBotSeat } from "../rooms/room.js";
import { chooseMove } from "./policy.js";

// Hace jugar a los bots cuando les toca. Vive fuera de `handlers.js` porque
// no tiene nada que ver con los sockets: solo mira la sala, y si el turno es
// de un bot, espera un momento y juega.

// Sin la pausa el bot juega instantaneo y la mano se va sin que te enteres de
// nada. Dos segundos y medio dan tiempo a leer que jugo, si canto y si te cayo.
export const BOT_DELAY_MS = 2500;

export function createBotDriver({ store, broadcast, delay = BOT_DELAY_MS, random = Math.random }) {
  // Un temporizador por sala como maximo: si no, dos avisos seguidos harian
  // que el bot juegue dos veces el mismo turno.
  const pending = new Map();

  function cancel(code) {
    const timer = pending.get(code);
    if (timer) {
      clearTimeout(timer);
      pending.delete(code);
    }
  }

  async function play(code) {
    pending.delete(code);
    const room = store.find(code);
    if (!room) return;

    const seat = currentSeat(room);
    if (seat === null || !isBotSeat(room, seat)) return;

    const view = gameViewFor(room, room.seats[seat].id);
    const move = chooseMove(view, random);
    if (!move) return;

    let next;
    try {
      next = applyGameMove(room, { playerId: room.seats[seat].id, move });
    } catch (error) {
      // Un bot no deberia intentar una jugada ilegal nunca. Si pasa, es un bug
      // del motor o de la politica y hay que verlo, no tragarselo en silencio.
      console.error(`el bot del asiento ${seat} intento una jugada ilegal en ${code}:`, error);
      return;
    }

    store.save(next);
    await broadcast(next);
    schedule(code);
  }

  /** Si el turno es de un bot, programa su jugada. Si no, no hace nada. */
  function schedule(code) {
    cancel(code);
    const room = store.find(code);
    if (!room) return;

    const seat = currentSeat(room);
    if (seat === null || !isBotSeat(room, seat)) return;

    const timer = setTimeout(() => {
      play(code).catch((error) => console.error("fallo el turno de un bot:", error));
    }, delay);
    timer.unref?.();
    pending.set(code, timer);
  }

  return {
    schedule,
    cancel,
    stopAll() {
      for (const code of [...pending.keys()]) cancel(code);
    },
    get pendingCount() {
      return pending.size;
    },
  };
}
