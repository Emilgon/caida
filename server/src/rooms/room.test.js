import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GRACE_MS,
  applyGameMove,
  createRoom,
  disconnectPlayer,
  gameViewFor,
  isPaused,
  joinRoom,
  moveSeat,
  publicRoom,
  rematch,
  startMatch,
  updateConfig,
  voteCancel,
} from "./room.js";

const HOST = "id-host";

function room(options = {}) {
  return createRoom({ code: "ABC123", hostId: HOST, hostName: "Emilio", now: 0, ...options });
}

/** Sala de `players` puestos con todo el mundo sentado. */
function full({ players = 4, ...rest } = {}) {
  let current = room({ players, ...rest });
  for (let seat = 1; seat < players; seat += 1) {
    current = joinRoom(current, { playerId: `id-${seat}`, name: `Jugador ${seat}`, now: seat });
  }
  return current;
}

function started(options) {
  return startMatch(full(options), { hostId: HOST, seed: "sala-de-prueba", now: 10 });
}

describe("crear la sala", () => {
  it("sienta al lider en el asiento 0 y deja el resto vacio", () => {
    const sala = room({ players: 4 });
    assert.equal(sala.seats.length, 4);
    assert.equal(sala.seats[0].name, "Emilio");
    assert.deepEqual(sala.seats.slice(1), [null, null, null]);
    assert.equal(sala.hostId, HOST);
    assert.equal(sala.phase, "sala");
  });

  it("valida la configuracion", () => {
    assert.throws(() => room({ players: 5 }), { code: "JUGADORES_INVALIDOS" });
    assert.throws(() => room({ target: 30 }), { code: "META_INVALIDA" });
    assert.throws(() => room({ mode: "loco" }), { code: "MODO_INVALIDO" });
  });

  it("exige un nombre razonable", () => {
    assert.throws(() => room({ hostName: "   " }), { code: "NOMBRE_VACIO" });
    assert.throws(() => room({ hostName: "x".repeat(21) }), { code: "NOMBRE_LARGO" });
    assert.equal(room({ hostName: "  Ana   Maria " }).seats[0].name, "Ana Maria");
  });
});

describe("entrar a la sala", () => {
  it("va llenando los asientos por orden de llegada", () => {
    const sala = full({ players: 4 });
    assert.deepEqual(sala.seats.map((seat) => seat.name), [
      "Emilio",
      "Jugador 1",
      "Jugador 2",
      "Jugador 3",
    ]);
  });

  it("no deja entrar a nadie mas cuando esta llena", () => {
    const sala = full({ players: 2 });
    assert.throws(() => joinRoom(sala, { playerId: "colado", name: "Colado" }), {
      code: "SALA_LLENA",
    });
  });

  it("no deja entrar con la partida empezada", () => {
    const sala = started({ players: 2 });
    assert.throws(() => joinRoom(sala, { playerId: "tarde", name: "Tarde" }), {
      code: "PARTIDA_EMPEZADA",
    });
  });
});

describe("armar las parejas", () => {
  it("el lider mueve a la gente de asiento", () => {
    const sala = moveSeat(full(), { hostId: HOST, from: 1, to: 2 });
    assert.deepEqual(sala.seats.map((seat) => seat.name), [
      "Emilio",
      "Jugador 2",
      "Jugador 1",
      "Jugador 3",
    ]);
  });

  it("mover a un asiento vacio tambien vale: es arrastrar y soltar", () => {
    let sala = room({ players: 4 });
    sala = joinRoom(sala, { playerId: "id-1", name: "Ana" });
    sala = moveSeat(sala, { hostId: HOST, from: 1, to: 3 });
    assert.equal(sala.seats[1], null);
    assert.equal(sala.seats[3].name, "Ana");
  });

  it("solo el lider puede moverlos", () => {
    assert.throws(() => moveSeat(full(), { hostId: "id-1", from: 1, to: 2 }), {
      code: "NO_ERES_LIDER",
    });
  });

  it("no se puede mover con la partida empezada", () => {
    assert.throws(() => moveSeat(started(), { hostId: HOST, from: 1, to: 2 }), {
      code: "PARTIDA_EMPEZADA",
    });
  });

  it("rechaza asientos que no existen o vacios", () => {
    assert.throws(() => moveSeat(full(), { hostId: HOST, from: 0, to: 9 }), {
      code: "ASIENTO_INVALIDO",
    });
    assert.throws(() => moveSeat(room({ players: 4 }), { hostId: HOST, from: 2, to: 0 }), {
      code: "ASIENTO_VACIO",
    });
  });

  it("la vista de la sala dice quien es pareja de quien", () => {
    assert.deepEqual(publicRoom(full(), HOST).teams, [[0, 2], [1, 3]]);
    assert.equal(publicRoom(full({ players: 3 }), HOST).teams, null);
  });
});

describe("configurar la mesa", () => {
  it("el lider cambia meta y modo antes de empezar", () => {
    const sala = updateConfig(full(), { hostId: HOST, target: 48, mode: "mayor-canto" });
    assert.equal(sala.config.target, 48);
    assert.equal(sala.config.mode, "mayor-canto");
  });

  it("cambiar el numero de jugadores reacomoda los asientos", () => {
    let sala = room({ players: 4 });
    sala = joinRoom(sala, { playerId: "id-1", name: "Ana" });
    sala = moveSeat(sala, { hostId: HOST, from: 1, to: 3 });
    sala = updateConfig(sala, { hostId: HOST, players: 2 });
    assert.equal(sala.seats.length, 2);
    assert.deepEqual(sala.seats.map((seat) => seat.name), ["Emilio", "Ana"]);
  });

  it("no deja encoger la mesa si no cabe la gente sentada", () => {
    assert.throws(() => updateConfig(full({ players: 4 }), { hostId: HOST, players: 2 }), {
      code: "DEMASIADA_GENTE",
    });
  });

  it("solo el lider configura", () => {
    assert.throws(() => updateConfig(full(), { hostId: "id-1", target: 48 }), {
      code: "NO_ERES_LIDER",
    });
  });
});

describe("empezar la partida", () => {
  it("no empieza con asientos vacios", () => {
    assert.throws(() => startMatch(room({ players: 4 }), { hostId: HOST }), {
      code: "FALTA_GENTE",
    });
  });

  it("no empieza si alguien esta sin conexion", () => {
    const sala = disconnectPlayer(startMatch(full({ players: 2 }), { hostId: HOST }), "id-1");
    // Volvemos a la sala a mano para probar el guardia de startMatch.
    assert.throws(() => startMatch({ ...sala, phase: "sala" }, { hostId: HOST }), {
      code: "ALGUIEN_SIN_CONEXION",
    });
  });

  it("solo el lider empieza", () => {
    assert.throws(() => startMatch(full(), { hostId: "id-1" }), { code: "NO_ERES_LIDER" });
  });

  it("crea la partida con la configuracion de la sala", () => {
    const sala = started({ players: 3, target: 48, mode: "mayor-canto" });
    assert.equal(sala.phase, "jugando");
    assert.equal(sala.match.players, 3);
    assert.equal(sala.match.target, 48);
    assert.equal(sala.match.mode, "mayor-canto");
  });
});

describe("jugar desde la sala", () => {
  it("cada quien juega en su asiento, no en el de otro", () => {
    const sala = started({ players: 2 });
    const dealer = sala.match.dealer;
    const dealerId = sala.seats[dealer].id;
    const otherId = sala.seats[(dealer + 1) % 2].id;

    const move = { type: "repartir", first: "manos", direction: "ascendente" };
    assert.throws(() => applyGameMove(sala, { playerId: otherId, move }), {
      code: "FUERA_DE_TURNO",
    });

    const next = applyGameMove(sala, { playerId: dealerId, move });
    assert.equal(next.match.phase, "juego");
  });

  it("quien no esta en la mesa no puede jugar", () => {
    const sala = started({ players: 2 });
    assert.throws(() => applyGameMove(sala, { playerId: "intruso", move: {} }), {
      code: "NO_ESTAS_EN_LA_MESA",
    });
  });

  it("nadie ve las cartas de los demas por la vista de la sala", () => {
    let sala = started({ players: 4 });
    sala = applyGameMove(sala, {
      playerId: sala.seats[sala.match.dealer].id,
      move: { type: "repartir", first: "manos", direction: "ascendente" },
    });

    for (let seat = 0; seat < 4; seat += 1) {
      const viewerId = sala.seats[seat].id;
      const payload = JSON.stringify({
        room: publicRoom(sala, viewerId),
        game: gameViewFor(sala, viewerId),
      });
      for (let other = 0; other < 4; other += 1) {
        if (other === seat) continue;
        for (const card of sala.match.hand.hands[other]) {
          assert.ok(!payload.includes(JSON.stringify(card.id)), `se filtro ${card.id}`);
        }
      }
    }
  });

  it("la vista de la sala nunca lleva el token de nadie", () => {
    const sala = started({ players: 4 });
    const payload = JSON.stringify(publicRoom(sala, HOST));
    for (const seat of sala.seats) {
      assert.ok(!payload.includes(seat.id), `se filtro el token de ${seat.name}`);
    }
  });
});

describe("se cae la conexion", () => {
  it("en la sala libera el asiento", () => {
    const sala = disconnectPlayer(full({ players: 2 }), "id-1");
    assert.equal(sala.seats[1], null);
  });

  it("si se va el lider, el liderazgo pasa a otro", () => {
    const sala = disconnectPlayer(full({ players: 3 }), HOST);
    assert.equal(sala.seats[0], null);
    assert.equal(sala.hostId, "id-1");
  });

  it("en partida congela la mesa en vez de soltar el asiento", () => {
    const sala = disconnectPlayer(started({ players: 3 }), "id-1", { now: 100 });
    assert.equal(sala.seats[1].name, "Jugador 1");
    assert.equal(sala.seats[1].connected, false);
    assert.ok(isPaused(sala));
    assert.equal(sala.pausedAt, 100);
  });

  it("con la mesa en pausa no se puede jugar", () => {
    const sala = disconnectPlayer(started({ players: 2 }), "id-1", { now: 100 });
    const dealerId = sala.seats[sala.match.dealer].id;
    assert.throws(
      () => applyGameMove(sala, { playerId: dealerId, move: { type: "repartir", first: "manos", direction: "ascendente" } }),
      { code: "MESA_EN_PAUSA" },
    );
  });

  it("vuelve a su MISMO asiento con su token", () => {
    let sala = started({ players: 4 });
    sala = disconnectPlayer(sala, "id-2", { now: 100 });
    sala = joinRoom(sala, { playerId: "id-2", name: "Jugador 2", now: 200 });

    assert.equal(sala.seats[2].id, "id-2");
    assert.equal(sala.seats[2].connected, true);
    assert.ok(!isPaused(sala));
    assert.equal(sala.pausedAt, null);
  });

  it("la partida sigue exactamente donde estaba", () => {
    let sala = started({ players: 2 });
    sala = applyGameMove(sala, {
      playerId: sala.seats[sala.match.dealer].id,
      move: { type: "repartir", first: "manos", direction: "ascendente" },
    });
    const before = JSON.stringify(sala.match);

    sala = disconnectPlayer(sala, "id-1", { now: 100 });
    sala = joinRoom(sala, { playerId: "id-1", name: "Jugador 1", now: 200 });
    assert.equal(JSON.stringify(sala.match), before);
  });

  it("con dos caidos, volver uno no reanuda la mesa", () => {
    let sala = started({ players: 3 });
    sala = disconnectPlayer(sala, "id-1", { now: 100 });
    sala = disconnectPlayer(sala, "id-2", { now: 110 });
    sala = joinRoom(sala, { playerId: "id-1", name: "Jugador 1", now: 200 });
    assert.ok(isPaused(sala));
    assert.deepEqual(publicRoom(sala, HOST).waitingFor, ["Jugador 2"]);
  });
});

describe("cancelar una mesa colgada", () => {
  it("hay que esperar el margen de gracia antes de proponerlo", () => {
    const sala = disconnectPlayer(started({ players: 3 }), "id-1", { now: 1000 });
    assert.throws(() => voteCancel(sala, { playerId: HOST, now: 1000 + GRACE_MS - 1 }), {
      code: "ESPERA_UN_POCO",
    });
    assert.equal(publicRoom(sala, HOST, { now: 1000 }).canVoteCancel, false);
  });

  it("si el jugador se fue a proposito, no hay que esperar", () => {
    const sala = disconnectPlayer(started({ players: 3 }), "id-1", { now: 1000, left: true });
    assert.ok(publicRoom(sala, HOST, { now: 1000 }).canVoteCancel);
    assert.doesNotThrow(() => voteCancel(sala, { playerId: HOST, now: 1001 }));
  });

  it("hacen falta TODOS los conectados para cancelar", () => {
    let sala = disconnectPlayer(started({ players: 3 }), "id-1", { now: 0 });
    sala = voteCancel(sala, { playerId: HOST, now: GRACE_MS });
    assert.equal(sala.phase, "jugando", "falta el voto del otro");
    assert.equal(sala.cancelVotes.length, 1);

    sala = voteCancel(sala, { playerId: "id-2", now: GRACE_MS });
    assert.equal(sala.phase, "cancelada");
    assert.equal(sala.match, null);
  });

  it("votar dos veces no cuenta doble", () => {
    let sala = disconnectPlayer(started({ players: 3 }), "id-1", { now: 0 });
    sala = voteCancel(sala, { playerId: HOST, now: GRACE_MS });
    sala = voteCancel(sala, { playerId: HOST, now: GRACE_MS });
    assert.equal(sala.cancelVotes.length, 1);
    assert.equal(sala.phase, "jugando");
  });

  it("no se puede cancelar una mesa que esta completa", () => {
    assert.throws(() => voteCancel(started(), { playerId: HOST }), { code: "MESA_ACTIVA" });
  });
});

describe("revancha", () => {
  it("solo despues de que termine, y con la misma gente sentada igual", () => {
    const sala = started({ players: 2 });
    assert.throws(() => rematch(sala, { hostId: HOST }), { code: "PARTIDA_EN_CURSO" });

    const terminada = { ...structuredClone(sala), phase: "terminada" };
    const otra = rematch(terminada, { hostId: HOST, seed: "otra" });
    assert.equal(otra.phase, "jugando");
    assert.deepEqual(otra.match.scores, [0, 0]);
    assert.deepEqual(otra.seats.map((seat) => seat.name), sala.seats.map((seat) => seat.name));
  });
});

describe("inmutabilidad", () => {
  it("ninguna funcion de sala toca la sala que recibe", () => {
    const sala = full({ players: 4 });
    const snapshot = JSON.stringify(sala);

    joinRoom(sala, { playerId: "id-1", name: "Jugador 1" });
    moveSeat(sala, { hostId: HOST, from: 1, to: 2 });
    updateConfig(sala, { hostId: HOST, target: 48 });
    disconnectPlayer(sala, "id-1");
    startMatch(sala, { hostId: HOST, seed: 1 });
    publicRoom(sala, HOST);

    assert.equal(JSON.stringify(sala), snapshot);
  });
});
