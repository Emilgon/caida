import { GameError } from "../caida/index.js";
import { createBotDriver } from "../bots/driver.js";
import { generatePlayerId, normalizeCode } from "./codes.js";
import {
  addBot,
  applyGameMove,
  disconnectPlayer,
  endCount,
  gameViewFor,
  joinRoom,
  moveSeat,
  publicRoom,
  rematch,
  removeBot,
  startMatch,
  updateConfig,
  voteCancel,
} from "./room.js";

// Unica capa que sabe que existen los sockets. Traduce eventos a llamadas de
// `room.js` y reparte el estado. Ninguna regla del juego vive aqui.

function reply(ack, payload) {
  if (typeof ack === "function") ack(payload);
}

function fail(ack, error) {
  if (error instanceof GameError) {
    reply(ack, { ok: false, error: { code: error.code, message: error.message } });
    return;
  }
  console.error("error inesperado en un handler de sala:", error);
  reply(ack, { ok: false, error: { code: "ERROR_INTERNO", message: "Algo se rompio en el servidor." } });
}

export function registerRoomHandlers(io, { store, seedFor, botDelay } = {}) {
  if (!store) throw new Error("registerRoomHandlers necesita un store de salas");

  // A cada socket le toca SU propia vista: las cartas de uno no pueden salir
  // en el mensaje de otro (ver publicStateFor y publicRoom).
  async function broadcast(room) {
    const sockets = await io.in(room.code).fetchSockets();
    for (const socket of sockets) {
      const playerId = socket.data.playerId;
      socket.emit("sala:estado", {
        room: publicRoom(room, playerId),
        game: gameViewFor(room, playerId),
      });
    }
  }

  const bots = createBotDriver({ store, broadcast, ...(botDelay === undefined ? {} : { delay: botDelay }) });

  // Cada vez que la sala cambia hay que mirar si ahora le toca a un bot.
  async function publish(room) {
    store.save(room);
    await broadcast(room);
    bots.schedule(room.code);
    return room;
  }

  // Si la persona tiene dos pestanas abiertas, cerrar una no la deja "caida".
  async function hasOtherSocket(code, playerId, exceptId) {
    const sockets = await io.in(code).fetchSockets();
    return sockets.some((socket) => socket.id !== exceptId && socket.data.playerId === playerId);
  }

  function roomOf(socket) {
    if (!socket.data.code) {
      throw new GameError("SIN_SALA", "No estas en ninguna mesa.");
    }
    return store.require(socket.data.code);
  }

  io.on("connection", (socket) => {
    socket.data.playerId = null;
    socket.data.code = null;

    async function enter(room, playerId) {
      socket.data.playerId = playerId;
      socket.data.code = room.code;
      await socket.join(room.code);
      await publish(room);
    }

    socket.on("sala:crear", async (payload = {}, ack) => {
      try {
        const playerId = payload.playerId || generatePlayerId();
        const room = store.open({
          hostId: playerId,
          hostName: payload.name,
          players: payload.players ?? 4,
          target: payload.target ?? 24,
          mode: payload.mode ?? "tradicional",
        });
        await enter(room, playerId);
        reply(ack, { ok: true, playerId, code: room.code });
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on("sala:entrar", async (payload = {}, ack) => {
      try {
        const code = normalizeCode(payload.code);
        const existing = store.require(code);
        const playerId = payload.playerId || generatePlayerId();
        const room = joinRoom(existing, { playerId, name: payload.name });
        await enter(room, playerId);
        reply(ack, { ok: true, playerId, code: room.code });
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on("sala:asiento", async (payload = {}, ack) => {
      try {
        const room = moveSeat(roomOf(socket), {
          hostId: socket.data.playerId,
          from: payload.from,
          to: payload.to,
        });
        await publish(room);
        reply(ack, { ok: true });
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on("sala:bot-agregar", async (payload = {}, ack) => {
      try {
        const room = addBot(roomOf(socket), { hostId: socket.data.playerId, seat: payload.seat });
        await publish(room);
        reply(ack, { ok: true });
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on("sala:bot-quitar", async (payload = {}, ack) => {
      try {
        const room = removeBot(roomOf(socket), { hostId: socket.data.playerId, seat: payload.seat });
        await publish(room);
        reply(ack, { ok: true });
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on("sala:config", async (payload = {}, ack) => {
      try {
        const room = updateConfig(roomOf(socket), {
          hostId: socket.data.playerId,
          players: payload.players,
          target: payload.target,
          mode: payload.mode,
        });
        await publish(room);
        reply(ack, { ok: true });
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on("sala:empezar", async (_payload = {}, ack) => {
      try {
        const current = roomOf(socket);
        // La semilla la pone el servidor. Si la eligiera el cliente sabria de
        // antemano como queda la baraja.
        const room = startMatch(current, {
          hostId: socket.data.playerId,
          seed: seedFor ? seedFor(current) : undefined,
        });
        await publish(room);
        reply(ack, { ok: true });
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on("sala:revancha", async (_payload = {}, ack) => {
      try {
        const current = roomOf(socket);
        const room = rematch(current, {
          hostId: socket.data.playerId,
          seed: seedFor ? seedFor(current) : undefined,
        });
        await publish(room);
        reply(ack, { ok: true });
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on("juego:jugada", async (payload = {}, ack) => {
      try {
        const room = applyGameMove(roomOf(socket), {
          playerId: socket.data.playerId,
          move: payload.move,
        });
        await publish(room);
        reply(ack, { ok: true });
      } catch (error) {
        fail(ack, error);
      }
    });

    // El repartidor ya puso las cuatro cartas: se suelta el juego.
    socket.on("juego:contado", async (_payload = {}, ack) => {
      try {
        const room = endCount(roomOf(socket), { playerId: socket.data.playerId });
        await publish(room);
        reply(ack, { ok: true });
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on("sala:cancelar", async (_payload = {}, ack) => {
      try {
        const room = voteCancel(roomOf(socket), { playerId: socket.data.playerId });
        await publish(room);
        if (room.phase === "cancelada") {
          io.in(room.code).emit("sala:cerrada", { code: room.code, reason: "cancelada" });
          store.close(room.code);
        }
        reply(ack, { ok: true, cancelada: room.phase === "cancelada" });
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on("sala:salir", async (_payload = {}, ack) => {
      try {
        const current = roomOf(socket);
        const room = disconnectPlayer(current, socket.data.playerId, { left: true });
        await socket.leave(room.code);
        socket.data.code = null;
        await publish(room);
        reply(ack, { ok: true });
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on("disconnect", async () => {
      const { code, playerId } = socket.data;
      if (!code || !playerId) return;
      const room = store.find(code);
      if (!room) return;
      // Otra pestana del mismo jugador sigue abierta: no esta caido.
      if (await hasOtherSocket(code, playerId, socket.id)) return;

      const next = disconnectPlayer(room, playerId);
      // La mesa queda en pausa, asi que los bots tambien esperan.
      bots.cancel(code);
      await publish(next);
    });
  });
}
