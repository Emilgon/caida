import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, describe, it } from "node:test";

import { Server } from "socket.io";
import { io as connect } from "socket.io-client";

import { registerRoomHandlers } from "./handlers.js";
import { createStore } from "./store.js";

// End to end de verdad: servidor Socket.IO real, clientes reales por TCP. Lo
// que no se pruebe aqui no esta probado — el motor puede estar perfecto y la
// capa de red seguir filtrando cartas o dejando jugar fuera de turno.

const TIMEOUT_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(condition, what) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (condition()) return;
    await sleep(3);
  }
  throw new Error(`se agoto la espera: ${what}`);
}

/** Levanta un servidor completo en un puerto libre. */
async function startServer({ seed = "semilla-de-prueba" } = {}) {
  const httpServer = createServer();
  const io = new Server(httpServer, { cors: { origin: true } });
  const store = createStore();
  registerRoomHandlers(io, { store, seedFor: () => seed });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address();

  const clients = [];
  return {
    store,
    url: `http://localhost:${port}`,
    /** Un cliente que guarda el ultimo estado y todo lo que ha recibido. */
    async client(name) {
      const socket = connect(`http://localhost:${port}`, { transports: ["websocket"] });
      const player = { name, socket, state: null, received: [], playerId: null, closed: false };
      socket.on("sala:estado", (payload) => {
        player.state = payload;
        player.received.push(JSON.stringify(payload));
      });
      socket.on("sala:cerrada", (payload) => {
        player.closed = payload;
      });
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      clients.push(player);
      return player;
    },
    async close() {
      for (const player of clients) player.socket.close();
      io.close();
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

/** Emite y espera el ack. Nunca rechaza: el error viaja dentro de la respuesta. */
function send(player, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`sin respuesta a ${event}`)), TIMEOUT_MS);
    player.socket.emit(event, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

async function ok(player, event, payload) {
  const response = await send(player, event, payload);
  assert.ok(response?.ok, `${event} fallo: ${JSON.stringify(response?.error)}`);
  return response;
}

/**
 * Espera a que el estado termine de llegar a todos y devuelve a quien le toca,
 * o `null` si la partida acabo. De paso comprueba la invariante que mas
 * importa: en cada momento hay EXACTAMENTE un jugador con jugadas legales.
 */
async function turnOf(players) {
  await until(() => {
    const able = players.filter((player) => player.state?.game?.legalMoves.length > 0);
    const done = players.every((player) => player.state?.room.phase === "terminada");
    return done || able.length === 1;
  }, "que le toque a alguien");
  return players.find((player) => player.state.game?.legalMoves.length > 0) ?? null;
}

/** Sala lista para jugar: lider + invitados sentados y partida empezada. */
async function tableOf(server, names, config = {}) {
  const [hostName, ...guests] = names;
  const host = await server.client(hostName);
  const created = await ok(host, "sala:crear", { name: hostName, players: names.length, ...config });
  host.playerId = created.playerId;

  const players = [host];
  for (const name of guests) {
    const guest = await server.client(name);
    const joined = await ok(guest, "sala:entrar", { code: created.code, name });
    guest.playerId = joined.playerId;
    players.push(guest);
  }

  await until(() => players.every((player) => player.state?.room.full), "que se llene la mesa");
  return { code: created.code, host, players };
}

describe("salas por socket", () => {
  const servers = [];
  async function server(options) {
    const instance = await startServer(options);
    servers.push(instance);
    return instance;
  }
  after(async () => {
    for (const instance of servers) await instance.close();
  });

  it("crear una mesa, entrar con el codigo y ver a todo el mundo sentado", async () => {
    const s = await server();
    const { code, host, players } = await tableOf(s, ["Emilio", "Ana", "Luis", "Carla"]);

    assert.match(code, /^[A-Z2-9]{6}$/);
    assert.equal(host.state.room.seats.map((seat) => seat.name).join(","), "Emilio,Ana,Luis,Carla");
    assert.ok(host.state.room.youAreHost);
    assert.ok(!players[1].state.room.youAreHost);
    assert.equal(players[1].state.room.yourSeat, 1);
    assert.deepEqual(host.state.room.teams, [[0, 2], [1, 3]]);
  });

  it("el codigo equivocado da un error con mensaje, no un crash", async () => {
    const s = await server();
    const player = await s.client("Perdido");
    const response = await send(player, "sala:entrar", { code: "ZZZZZZ", name: "Perdido" });
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "SALA_NO_EXISTE");
    assert.equal(response.error.message, "No existe una mesa con ese codigo.");
  });

  it("el lider arrastra a la gente para armar las parejas", async () => {
    const s = await server();
    const { host, players } = await tableOf(s, ["Emilio", "Ana", "Luis", "Carla"]);

    await ok(host, "sala:asiento", { from: 1, to: 2 });
    await until(
      () => players[1].state.room.yourSeat === 2,
      "que Ana se entere de que la movieron",
    );
    assert.equal(host.state.room.seats.map((seat) => seat.name).join(","), "Emilio,Luis,Ana,Carla");

    const negado = await send(players[1], "sala:asiento", { from: 0, to: 1 });
    assert.equal(negado.error.code, "NO_ERES_LIDER");
  });

  it("solo el lider empieza la partida", async () => {
    const s = await server();
    const { host, players } = await tableOf(s, ["Emilio", "Ana"]);

    const negado = await send(players[1], "sala:empezar");
    assert.equal(negado.error.code, "NO_ERES_LIDER");

    await ok(host, "sala:empezar");
    await until(() => players.every((player) => player.state.room.phase === "jugando"), "que arranque");
    assert.ok(host.state.game, "el lider deberia tener vista de partida");
  });

  it("una partida completa de 4, jugada por sockets, sin ver cartas ajenas", async () => {
    const s = await server();
    const { code, host, players } = await tableOf(s, ["Emilio", "Ana", "Luis", "Carla"]);
    await ok(host, "sala:empezar");
    await until(() => players.every((player) => player.state.room.phase === "jugando"), "arranque");

    let moves = 0;
    let actor;
    while ((actor = await turnOf(players)) !== null) {
      moves += 1;
      assert.ok(moves < 4000, "la partida no termina");

      const [move] = actor.state.game.legalMoves;
      await ok(actor, "juego:jugada", { move });
      await turnOf(players);

      // Contra la verdad del servidor: lo que le llego a cada quien no puede
      // contener una carta de la mano de otro.
      const truth = s.store.find(code);
      if (truth.match?.hand) {
        for (let seat = 0; seat < 4; seat += 1) {
          const payload = players[seat].received.at(-1);
          for (let other = 0; other < 4; other += 1) {
            if (other === seat) continue;
            for (const card of truth.match.hand.hands[other]) {
              assert.ok(!payload.includes(JSON.stringify(card.id)), `se filtro ${card.id} al asiento ${seat}`);
            }
          }
          for (const card of truth.match.hand.deck) {
            assert.ok(!payload.includes(JSON.stringify(card.id)), `se filtro ${card.id} del mazo`);
          }
        }
      }
    }

    const truth = s.store.find(code);
    assert.notEqual(truth.match.winner, null);
    assert.ok(truth.match.scores[truth.match.winner] >= 24);
    for (const player of players) {
      assert.equal(player.state.room.phase, "terminada");
      assert.equal(player.state.room.winner, truth.match.winner);
    }
  });

  it("jugar fuera de turno lo rechaza el servidor, no el cliente", async () => {
    const s = await server();
    const { code, host, players } = await tableOf(s, ["Emilio", "Ana"]);
    await ok(host, "sala:empezar");
    await until(() => players.every((player) => player.state.room.phase === "jugando"), "arranque");

    const truth = s.store.find(code);
    const esperando = players[(truth.match.dealer + 1) % 2];
    const response = await send(esperando, "juego:jugada", {
      move: { type: "repartir", first: "manos", direction: "ascendente" },
    });
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "FUERA_DE_TURNO");
    assert.equal(response.error.message, "No es tu turno.");
  });

  it("se cae uno, la mesa se pausa, y vuelve a su asiento con su token", async () => {
    const s = await server();
    const { code, host, players } = await tableOf(s, ["Emilio", "Ana", "Luis"]);
    await ok(host, "sala:empezar");
    await until(() => host.state.room.phase === "jugando", "arranque");

    // Reparte quien toque, para que la mano ya tenga cartas repartidas.
    const dealerSeat = s.store.find(code).match.dealer;
    await ok(players[dealerSeat], "juego:jugada", {
      move: { type: "repartir", first: "manos", direction: "ascendente" },
    });
    await until(() => players[1].state.game?.hand !== null, "reparto");

    const ana = players[1];
    const cartas = JSON.stringify(ana.state.game.hand.myCards);
    const token = ana.playerId;

    ana.socket.close();
    await until(() => host.state.room.paused, "que la mesa se pause");
    assert.deepEqual(host.state.room.waitingFor, ["Ana"]);

    // Con la mesa en pausa, el del turno tampoco puede jugar.
    const enTurno = players.find((player) => player !== ana && player.state.game?.legalMoves.length > 0);
    if (enTurno) {
      const response = await send(enTurno, "juego:jugada", { move: enTurno.state.game.legalMoves[0] });
      assert.equal(response.error.code, "MESA_EN_PAUSA");
    }

    // Vuelve con el mismo token: mismo asiento y mismas cartas.
    const devuelta = await s.client("Ana");
    await ok(devuelta, "sala:entrar", { code, name: "Ana", playerId: token });
    await until(() => devuelta.state?.game?.hand, "que recupere la partida");

    assert.equal(devuelta.state.room.yourSeat, 1);
    assert.equal(devuelta.state.room.paused, false);
    assert.equal(JSON.stringify(devuelta.state.game.hand.myCards), cartas);
  });

  it("entrar con un token ajeno no te da su asiento ni sus cartas", async () => {
    const s = await server();
    const { code, host, players } = await tableOf(s, ["Emilio", "Ana"]);
    await ok(host, "sala:empezar");
    await until(() => host.state.room.phase === "jugando", "arranque");

    // La mesa esta llena y en juego: un tercero no entra de ninguna forma.
    const intruso = await s.client("Intruso");
    const response = await send(intruso, "sala:entrar", { code, name: "Intruso" });
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "PARTIDA_EMPEZADA");

    // Y el token de Ana nunca viajo a Emilio, asi que no hay nada que robar.
    for (const payload of host.received) {
      assert.ok(!payload.includes(players[1].playerId), "se filtro el token de Ana");
    }
  });

  it("en la sala (sin empezar) irse libera el asiento para otro", async () => {
    const s = await server();
    const { code, host, players } = await tableOf(s, ["Emilio", "Ana", "Luis"]);

    players[2].socket.close();
    await until(() => host.state.room.seats[2].empty, "que se libere el asiento");
    assert.equal(host.state.room.full, false);

    const nuevo = await s.client("Carla");
    await ok(nuevo, "sala:entrar", { code, name: "Carla" });
    await until(() => host.state.room.full, "que entre Carla");
    assert.equal(host.state.room.seats[2].name, "Carla");
  });

  it("si el lider se va antes de empezar, el liderazgo pasa a otro", async () => {
    const s = await server();
    const { host, players } = await tableOf(s, ["Emilio", "Ana"]);

    host.socket.close();
    await until(() => players[1].state.room.youAreHost, "que Ana quede de lider");
    assert.equal(players[1].state.room.seats[1].host, true);
  });

  it("la revancha reinicia el marcador con la misma gente", async () => {
    const s = await server();
    const { code, host, players } = await tableOf(s, ["Emilio", "Ana"]);
    await ok(host, "sala:empezar");
    await until(() => host.state.room.phase === "jugando", "arranque");

    // Terminamos la partida jugando hasta el final.
    let actor;
    while ((actor = await turnOf(players)) !== null) {
      await ok(actor, "juego:jugada", { move: actor.state.game.legalMoves[0] });
    }

    const negada = await send(players[1], "sala:revancha");
    assert.equal(negada.error.code, "NO_ERES_LIDER");

    await ok(host, "sala:revancha");
    await until(() => host.state.room.phase === "jugando", "la revancha");
    assert.deepEqual(s.store.find(code).match.scores, [0, 0]);
  });
});
