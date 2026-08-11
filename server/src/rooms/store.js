import { GameError } from "../caida/index.js";
import { generateCode, normalizeCode } from "./codes.js";
import { createRoom } from "./room.js";

// Las salas viven en memoria. Si el servidor se reinicia (en Render free se
// duerme por inactividad) se pierden las partidas en curso: asumido para el
// v1, persistirlas es meter una base de datos.

export const MAX_ROOMS = 500;
// Una sala sin nadie conectado se borra al pasar este tiempo, para que el
// proceso no se llene de mesas muertas.
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 5 * 60 * 1000;

export function createStore({ now = () => Date.now() } = {}) {
  const rooms = new Map();

  function freshCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = generateCode();
      if (!rooms.has(code)) return code;
    }
    throw new GameError("SIN_CODIGOS", "No se pudo crear la mesa, intenta de nuevo.");
  }

  return {
    get size() {
      return rooms.size;
    },

    open(options) {
      if (rooms.size >= MAX_ROOMS) {
        throw new GameError("SERVIDOR_LLENO", "Hay demasiadas mesas abiertas, intenta en un rato.");
      }
      const code = freshCode();
      const room = createRoom({ ...options, code, now: now() });
      rooms.set(code, room);
      return room;
    },

    find(code) {
      return rooms.get(normalizeCode(code)) ?? null;
    },

    require(code) {
      const room = this.find(code);
      if (!room) throw new GameError("SALA_NO_EXISTE", "No existe una mesa con ese codigo.");
      return room;
    },

    save(room) {
      rooms.set(room.code, room);
      return room;
    },

    close(code) {
      return rooms.delete(normalizeCode(code));
    },

    /** Borra salas canceladas y las que llevan mucho sin nadie conectado. */
    sweep({ ttl = ROOM_TTL_MS } = {}) {
      const cutoff = now() - ttl;
      const removed = [];
      for (const [code, room] of rooms) {
        // Los bots no cuentan como vida: una mesa donde solo quedan bots esta
        // tan muerta como una vacia.
        const alive = room.seats.some((seat) => seat && seat.connected && !seat.bot);
        if (room.phase === "cancelada" || (!alive && room.updatedAt < cutoff)) {
          rooms.delete(code);
          removed.push(code);
        }
      }
      return removed;
    },

    /** Arranca la limpieza periodica. Devuelve como pararla (para los tests). */
    startSweeper({ every = SWEEP_EVERY_MS } = {}) {
      const timer = setInterval(() => this.sweep(), every);
      // Que un temporizador de limpieza no mantenga vivo el proceso.
      timer.unref?.();
      return () => clearInterval(timer);
    },
  };
}
