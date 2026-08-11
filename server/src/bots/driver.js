import {
  applyGameMove,
  contandoMesa,
  currentSeat,
  endCount,
  gameViewFor,
  isBotSeat,
} from "../rooms/room.js";
import { chooseMove } from "./policy.js";

// Hace jugar a los bots cuando les toca. Vive fuera de `handlers.js` porque
// no tiene nada que ver con los sockets: solo mira la sala, y si el turno es
// de un bot, espera un momento y juega.

// Sin la pausa el bot juega instantaneo y la mano se va sin que te enteres de
// nada. Dos segundos y medio dan tiempo a leer que jugo, si canto y si te cayo.
export const BOT_DELAY_MS = 2500
// Lo que tarda un bot en "cantar" las cuatro cartas de la mesa, para que se
// vean salir una a una igual que cuando cuenta una persona.
export const CONTEO_BOT_MS = 3200;

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

  /** Un bot acaba de repartir: "canta" la mesa y despues suelta el juego. */
  async function terminarConteo(code) {
    pending.delete(code);
    const room = store.find(code);
    if (!room || !room.contando) return;
    const next = endCount(room, { playerId: room.seats[room.contando.seat].id });
    store.save(next);
    await broadcast(next);
    schedule(code);
  }

  /** Si el turno es de un bot, programa su jugada. Si no, no hace nada. */
  function schedule(code) {
    cancel(code);
    const room = store.find(code);
    if (!room) return;

    // Mientras se cuenta la mesa no juega nadie. Si quien cuenta es un bot le
    // damos su tiempo y soltamos la mesa nosotros; si es una persona, se
    // espera a que avise (o a que venza el plazo de seguridad).
    if (contandoMesa(room)) {
      if (!isBotSeat(room, room.contando.seat)) return;
      const espera = setTimeout(() => {
        terminarConteo(code).catch((error) => console.error("fallo el conteo de un bot:", error));
      }, Math.max(delay, CONTEO_BOT_MS));
      espera.unref?.();
      pending.set(code, espera);
      return;
    }

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
