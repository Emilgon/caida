import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ROOM_TTL_MS, createStore } from "./store.js";
import { disconnectPlayer, joinRoom, startMatch } from "./room.js";

function storeAt(clock) {
  return createStore({ now: () => clock.value });
}

describe("store de salas", () => {
  it("abre mesas con codigos distintos", () => {
    const store = createStore();
    const codes = new Set();
    for (let i = 0; i < 50; i += 1) {
      codes.add(store.open({ hostId: `h${i}`, hostName: "Emilio", players: 2 }).code);
    }
    assert.equal(codes.size, 50);
    assert.equal(store.size, 50);
  });

  it("busca sin importar mayusculas ni espacios", () => {
    const store = createStore();
    const room = store.open({ hostId: "h", hostName: "Emilio", players: 2 });
    assert.equal(store.find(` ${room.code.toLowerCase()} `).code, room.code);
    assert.equal(store.find("NOEXISTE"), null);
  });

  it("un codigo inexistente da un error con mensaje", () => {
    const store = createStore();
    assert.throws(() => store.require("ZZZZZZ"), { code: "SALA_NO_EXISTE" });
  });

  it("barre las salas canceladas", () => {
    const store = createStore();
    const room = store.open({ hostId: "h", hostName: "Emilio", players: 2 });
    store.save({ ...room, phase: "cancelada" });
    assert.deepEqual(store.sweep(), [room.code]);
    assert.equal(store.size, 0);
  });

  it("barre las salas que llevan mucho sin nadie conectado", () => {
    const clock = { value: 0 };
    const store = storeAt(clock);
    const room = store.open({ hostId: "h", hostName: "Emilio", players: 2 });

    // Sigue viva mientras alguien este conectado, por vieja que sea.
    clock.value = ROOM_TTL_MS * 10;
    assert.deepEqual(store.sweep(), []);

    // Se queda sin nadie: aguanta el TTL y despues se borra.
    let vacia = disconnectPlayer(room, "h", { now: clock.value });
    vacia = { ...vacia, seats: vacia.seats.map(() => null), updatedAt: clock.value };
    store.save(vacia);
    assert.deepEqual(store.sweep(), [], "todavia dentro del TTL");

    clock.value += ROOM_TTL_MS + 1;
    assert.deepEqual(store.sweep(), [room.code]);
  });

  it("una partida en curso con todos conectados nunca se barre", () => {
    const clock = { value: 0 };
    const store = storeAt(clock);
    let room = store.open({ hostId: "h", hostName: "Emilio", players: 2 });
    room = joinRoom(room, { playerId: "otro", name: "Ana" });
    store.save(startMatch(room, { hostId: "h", seed: 1 }));

    clock.value = ROOM_TTL_MS * 100;
    assert.deepEqual(store.sweep(), []);
  });

  it("el barredor periodico se puede parar", () => {
    const store = createStore();
    const stop = store.startSweeper({ every: 10 });
    assert.equal(typeof stop, "function");
    stop();
  });
});
