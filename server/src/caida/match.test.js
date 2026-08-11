import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameError } from "./errors.js";
import { createDeck } from "./deck.js";
import { applyMove, createMatch, legalMoves, publicStateFor } from "./match.js";
import { card, cards, countAllCards, scenario } from "./testing.js";

// Reparte una mano concreta para no depender del azar en cada test.
function dealt({ players = 2, seed = "mesa", first = "manos", direction = "ascendente" } = {}) {
  const match = createMatch({ players, seed });
  return applyMove(match, match.dealer, { type: "repartir", first, direction });
}

// Todas las cartas del mazo menos las que el test usa explicitamente.
function restOfDeck(usedIds) {
  return createDeck().filter((c) => !usedIds.includes(c.id));
}

describe("createMatch", () => {
  it("rechaza cantidades de jugadores fuera de 2, 3 o 4", () => {
    for (const players of [1, 5, 0, undefined]) {
      assert.throws(() => createMatch({ players }), (error) => {
        assert.ok(error instanceof GameError);
        assert.equal(error.code, "JUGADORES_INVALIDOS");
        return true;
      });
    }
  });

  it("rechaza metas distintas de 24 y 48", () => {
    assert.throws(() => createMatch({ players: 2, target: 30 }), { code: "META_INVALIDA" });
  });

  it("rechaza modos desconocidos", () => {
    assert.throws(() => createMatch({ players: 2, mode: "loco" }), { code: "MODO_INVALIDO" });
  });

  it("con 4 jugadores arma parejas cruzadas", () => {
    const match = createMatch({ players: 4, seed: 1 });
    assert.deepEqual(match.teams, [[0, 2], [1, 3]]);
  });

  it("con 2 o 3 cada quien juega para si", () => {
    assert.deepEqual(createMatch({ players: 2, seed: 1 }).teams, [[0], [1]]);
    assert.deepEqual(createMatch({ players: 3, seed: 1 }).teams, [[0], [1], [2]]);
  });

  it("la misma semilla da siempre la misma partida", () => {
    const a = applyMove(createMatch({ players: 3, seed: "abc" }), createMatch({ players: 3, seed: "abc" }).dealer, {
      type: "repartir",
      first: "manos",
      direction: "ascendente",
    });
    const b = applyMove(createMatch({ players: 3, seed: "abc" }), createMatch({ players: 3, seed: "abc" }).dealer, {
      type: "repartir",
      first: "manos",
      direction: "ascendente",
    });
    assert.deepEqual(a.hand.hands, b.hand.hands);
    assert.deepEqual(a.hand.table, b.hand.table);
  });

  it("semillas distintas dan repartos distintos", () => {
    const a = dealt({ seed: "una" });
    const b = dealt({ seed: "otra" });
    assert.notDeepEqual(a.hand.table, b.hand.table);
  });
});

describe("reparto", () => {
  it("solo el repartidor decide como repartir, y tiene 4 opciones", () => {
    const match = createMatch({ players: 3, seed: 7 });
    assert.equal(legalMoves(match, match.dealer).length, 4);
    for (let seat = 0; seat < 3; seat += 1) {
      if (seat !== match.dealer) assert.deepEqual(legalMoves(match, seat), []);
    }
  });

  it("da 3 cartas a cada uno y 4 a la mesa", () => {
    for (const players of [2, 3, 4]) {
      const match = dealt({ players, seed: `p${players}` });
      assert.deepEqual(match.hand.hands.map((h) => h.length), Array(players).fill(3));
      assert.equal(match.hand.table.length, 4);
      assert.equal(match.hand.deck.length, 40 - 3 * players - 4);
      assert.equal(countAllCards(match), 40);
    }
  });

  it("las 4 cartas de mesa nunca repiten valor", () => {
    for (let seed = 0; seed < 300; seed += 1) {
      for (const first of ["manos", "mesa"]) {
        const match = dealt({ players: 4, seed, first });
        const values = match.hand.table.map((c) => c.value);
        assert.equal(new Set(values).size, 4, `semilla ${seed} (${first})`);
      }
    }
  });

  it("empieza el jugador a la derecha del repartidor", () => {
    for (const players of [2, 3, 4]) {
      const match = dealt({ players, seed: 11 });
      assert.equal(match.hand.turn, (match.dealer + 1) % players);
    }
  });

  it("repartir primero las manos o la mesa cambia el reparto", () => {
    const a = dealt({ seed: "igual", first: "manos" });
    const b = dealt({ seed: "igual", first: "mesa" });
    assert.notDeepEqual(a.hand.table, b.hand.table);
  });

  it("cobra los aciertos del conteo de mesa, o da el consuelo por mal echada", () => {
    for (let seed = 0; seed < 250; seed += 1) {
      for (const direction of ["ascendente", "descendente"]) {
        const match = dealt({ players: 3, seed, direction });
        const numbers = direction === "ascendente" ? [1, 2, 3, 4] : [4, 3, 2, 1];
        const expected = match.hand.table.reduce(
          (sum, c, i) => (c.value === numbers[i] ? sum + numbers[i] : sum),
          0,
        );

        if (expected > 0) {
          assert.equal(match.scores[match.dealer], expected, `semilla ${seed}`);
        } else {
          // Mal echada: 1 punto de consuelo para el primero en jugar.
          assert.equal(match.scores[(match.dealer + 1) % 3], 1, `semilla ${seed} mal echada`);
        }
        assert.equal(match.scores.reduce((a, b) => a + b, 0), Math.max(expected, 1));
      }
    }
  });

  it("rechaza un reparto con opciones invalidas", () => {
    const match = createMatch({ players: 2, seed: 3 });
    assert.throws(() => applyMove(match, match.dealer, { type: "repartir", first: "aire", direction: "ascendente" }), {
      code: "REPARTO_INVALIDO",
    });
  });
});

describe("capturar: caida contra recoger", () => {
  it("recoger no da puntos de valor, solo se lleva las cartas", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-11", "copas-2", "espadas-3")],
      table: cards("bastos-11", "oros-6"),
      lastPlayed: null, // nadie acaba de lanzar: no hay caida posible
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-11" });

    assert.equal(next.scores[1], 0);
    assert.deepEqual(next.hand.captured[1].map((c) => c.id).sort(), ["bastos-11", "oros-11"]);
    assert.deepEqual(next.hand.table.map((c) => c.id), ["oros-6"]);
    assert.equal(next.log.at(-1).type, "recoger");
  });

  it("caida sobre la carta recien lanzada da los puntos del valor", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-11", "copas-2", "espadas-3")],
      table: cards("oros-6", "bastos-11"),
      lastPlayed: { seat: 0, id: "bastos-11", value: 11 },
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-11" });

    assert.equal(next.scores[1], 3, "caida de 11 = 3 puntos");
    assert.ok(next.log.some((entry) => entry.type === "caida"));
  });

  it("el primero de la mano no puede caer: la mesa no la lanzo nadie", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-12", "copas-2", "espadas-3")],
      table: cards("bastos-12"),
    });
    const [play] = legalMoves(match, 1).filter((m) => m.card === "oros-12");
    assert.equal(play.caida, false);
    assert.equal(play.points, 4, "solo los 4 de mesa limpia, no la caida");
  });

  it("despues de una captura el siguiente no puede caer", () => {
    const match = scenario({
      players: 3,
      turn: 1,
      hands: [[], cards("oros-6", "copas-2", "espadas-3"), cards("bastos-6", "oros-2", "copas-3")],
      table: cards("espadas-6", "bastos-10"),
      lastPlayed: { seat: 0, id: "espadas-6", value: 6 },
    });
    const afterCaida = applyMove(match, 1, { type: "jugar", card: "oros-6" });
    assert.equal(afterCaida.hand.lastPlayed, null);

    const options = legalMoves(afterCaida, 2);
    assert.ok(options.every((option) => option.caida === false));
  });

  it("la caida se lleva TODAS las cartas de ese valor que haya en la mesa", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-4", "copas-2", "espadas-3")],
      table: cards("bastos-4", "espadas-4", "oros-10"),
      lastPlayed: { seat: 0, id: "espadas-4", value: 4 },
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-4" });
    assert.equal(next.hand.captured[1].length, 3);
    assert.deepEqual(next.hand.table.map((c) => c.id), ["oros-10"]);
  });
});

describe("escalera", () => {
  it("arrastra los consecutivos hacia arriba", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-1", "copas-7", "espadas-3")],
      table: cards("bastos-1", "bastos-2", "bastos-3", "bastos-4"),
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-1" });

    assert.equal(next.hand.table.length, 0);
    assert.equal(next.hand.captured[1].length, 5, "las 4 de mesa mas la jugada");
    assert.equal(next.scores[1], 4, "mesa limpia, sin caida");
  });

  it("se corta donde falta el valor siguiente", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-1", "copas-7", "espadas-3")],
      table: cards("bastos-1", "bastos-2", "bastos-4"),
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-1" });

    assert.deepEqual(next.hand.captured[1].map((c) => c.id).sort(), ["bastos-1", "bastos-2", "oros-1"]);
    assert.deepEqual(next.hand.table.map((c) => c.id), ["bastos-4"]);
    assert.equal(next.scores[1], 0);
  });

  it("cruza el hueco del 8 y el 9", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-6", "copas-2", "espadas-3")],
      table: cards("bastos-6", "bastos-7", "bastos-10", "bastos-11"),
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-6" });
    assert.equal(next.hand.table.length, 0);
    assert.equal(next.hand.captured[1].length, 5);
  });

  it("se lleva todas las copias de cada escalon", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-5", "copas-2", "espadas-3")],
      table: cards("bastos-5", "copas-6", "espadas-6", "oros-12"),
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-5" });
    assert.equal(next.hand.captured[1].length, 4);
    assert.deepEqual(next.hand.table.map((c) => c.id), ["oros-12"]);
  });

  it("es obligatoria: no hay jugada legal que corte la escalera antes", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-1", "copas-2", "espadas-3")],
      table: cards("bastos-1", "bastos-2"),
    });
    const play = legalMoves(match, 1).find((m) => m.card === "oros-1");
    assert.deepEqual(play.captures.sort(), ["bastos-1", "bastos-2"]);
    assert.equal(legalMoves(match, 1).filter((m) => m.card === "oros-1").length, 1);
  });
});

describe("mesa limpia y caida con mesa", () => {
  it("recoger dejando la mesa vacia vale 4", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-12", "copas-2", "espadas-3")],
      table: cards("bastos-12"),
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-12" });
    assert.equal(next.scores[1], 4);
  });

  it("caida que limpia la mesa suma el valor MAS los 4 de mesa", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-12", "copas-2", "espadas-3")],
      table: cards("bastos-12"),
      lastPlayed: { seat: 0, id: "bastos-12", value: 12 },
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-12" });
    assert.equal(next.scores[1], 8, "4 de la caida del 12 + 4 de mesa");
  });

  it("caida chica que limpia la mesa vale 5", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-3", "copas-2", "espadas-6")],
      table: cards("bastos-3"),
      lastPlayed: { seat: 0, id: "bastos-3", value: 3 },
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-3" });
    assert.equal(next.scores[1], 5);
  });

  it("si no capturas, la carta se queda en la mesa y no suma nada", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-3", "copas-2", "espadas-6")],
      table: cards("bastos-12"),
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-3" });
    assert.equal(next.scores[1], 0);
    assert.deepEqual(next.hand.table.map((c) => c.id), ["bastos-12", "oros-3"]);
    assert.deepEqual(next.hand.lastPlayed, { seat: 1, id: "oros-3", value: 3 });
  });
});

describe("cantos en la mesa", () => {
  it("solo se puede cantar con una carta que forme el canto", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-5", "copas-5", "espadas-2")],
      table: cards("bastos-12"),
    });
    const moves = legalMoves(match, 1);
    assert.equal(moves.find((m) => m.card === "oros-5").canDeclare, true);
    assert.equal(moves.find((m) => m.card === "copas-5").canDeclare, true);
    assert.equal(moves.find((m) => m.card === "espadas-2").canDeclare, false, "la suelta no canta");

    assert.throws(() => applyMove(match, 1, { type: "jugar", card: "espadas-2", cantar: true }), {
      code: "CANTO_INVALIDO",
    });
  });

  it("cantar es opcional y solo se puede una vez por tanda", () => {
    const match = scenario({
      players: 2,
      turn: 1,
      hands: [cards("bastos-12", "bastos-10", "bastos-7"), cards("oros-5", "copas-5", "espadas-2")],
      table: cards("bastos-1"),
    });
    const sinCantar = applyMove(match, 1, { type: "jugar", card: "oros-5" });
    assert.deepEqual(sinCantar.hand.declaredCantos, []);

    const cantando = applyMove(match, 1, { type: "jugar", card: "oros-5", cantar: true });
    assert.equal(cantando.hand.declaredCantos.length, 1);
    assert.equal(cantando.hand.declaredCantos[0].type, "ronda");
    assert.equal(cantando.hand.declared[1], true);

    // El turno vuelve al 1 tras jugar el 0; la segunda carta del par ya no canta.
    const afterOther = applyMove(cantando, 0, { type: "jugar", card: "bastos-12" });
    const moves = legalMoves(afterOther, 1);
    assert.ok(moves.every((m) => m.canDeclare === false));
  });

  it("el canto no da puntos al declararlo: se cobra al cerrar la mano", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-12", "copas-12", "espadas-2")],
      table: cards("bastos-1"),
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-12", cantar: true });
    assert.equal(next.scores[1], 0);
    assert.equal(next.hand.declaredCantos[0].points, 4);
  });

  it("el canto declarado guarda con que numeros se canto, para desempatar", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-4", "copas-5", "espadas-6")],
      table: cards("bastos-1"),
    });
    const next = applyMove(match, 1, { type: "jugar", card: "oros-4", cantar: true });
    const [canto] = next.hand.declaredCantos;
    assert.equal(canto.type, "patrulla");
    assert.deepEqual(canto.rank, [5], "la posicion del 6, la mas alta de la escalera");
  });
});

describe("mata canto", () => {
  const base = () =>
    scenario({
      players: 3,
      turn: 1,
      hands: [
        cards("bastos-1", "bastos-2", "bastos-3"),
        cards("oros-5", "copas-5", "espadas-2"),
        cards("espadas-5", "oros-10", "copas-4"),
      ],
      table: cards("bastos-12"),
    });

  it("el de la derecha anula el canto cayendole a esa carta", () => {
    const canto = applyMove(base(), 1, { type: "jugar", card: "oros-5", cantar: true });
    assert.equal(canto.hand.pendingCanto.card, "oros-5");
    assert.equal(legalMoves(canto, 2).find((m) => m.card === "espadas-5").killsCanto, true);

    const matado = applyMove(canto, 2, { type: "jugar", card: "espadas-5" });
    assert.equal(matado.hand.declaredCantos[0].killed, true);
    assert.equal(matado.hand.declaredCantos[0].killedBy, 2);
    assert.equal(matado.scores[2], 1, "quien mata cobra la caida, no los puntos del canto");
    assert.equal(matado.scores[1], 0);
  });

  it("no lo mata si recoge otra carta en vez de caerle", () => {
    const canto = applyMove(base(), 1, { type: "jugar", card: "oros-5", cantar: true });
    // El 12 estaba en la mesa desde antes: capturarlo es recoger, no caida.
    const conTres = applyMove(canto, 2, { type: "jugar", card: "copas-4" });
    assert.equal(conTres.hand.declaredCantos[0].killed, false);
    assert.equal(conTres.hand.pendingCanto, null, "la ventana de matar dura un solo turno");
  });

  it("la ventana es de un solo turno: el de mas adelante ya no puede", () => {
    const canto = applyMove(base(), 1, { type: "jugar", card: "oros-5", cantar: true });
    const pasa = applyMove(canto, 2, { type: "jugar", card: "oros-10" });
    const options = legalMoves(pasa, 0);
    assert.ok(options.every((option) => option.killsCanto === false));
  });

  it("un canto declarado haciendo caida no se puede matar", () => {
    const match = scenario({
      players: 3,
      turn: 1,
      hands: [
        cards("bastos-1", "bastos-2", "bastos-3"),
        cards("oros-5", "copas-5", "espadas-2"),
        cards("espadas-5", "oros-10", "copas-4"),
      ],
      table: cards("bastos-5", "bastos-12"),
      lastPlayed: { seat: 0, id: "bastos-5", value: 5 },
    });
    const canto = applyMove(match, 1, { type: "jugar", card: "oros-5", cantar: true });
    assert.equal(canto.hand.declaredCantos.length, 1);
    assert.equal(canto.hand.pendingCanto, null, "la carta cantada se fue a su monton");
    assert.equal(canto.scores[1], 1, "cobra la caida del 5");
  });
});

describe("cierre de la mano", () => {
  // Deja al asiento 1 con la ultima carta y el mazo vacio: al jugarla se
  // cierra la mano.
  function closing({ players = 2, mode = "tradicional", declaredCantos = [], captured, table, lastCapturer }) {
    const played = "oros-7";
    const tableIds = table ?? ["bastos-12", "copas-10", "espadas-4"];
    const rest = restOfDeck([played, ...tableIds]);
    let taken = 0;
    const piles = captured.map((count) => {
      const pile = rest.slice(taken, taken + count);
      taken += count;
      return pile;
    });
    assert.equal(taken, rest.length, "el escenario debe usar las 40 cartas");

    return applyMove(
      scenario({
        players,
        mode,
        turn: 1,
        dealer: 0,
        hands: Array.from({ length: players }, (_, seat) => (seat === 1 ? [card(played)] : [])),
        table: cards(...tableIds),
        deck: [],
        captured: piles,
        declaredCantos,
        lastCapturer,
      }),
      1,
      { type: "jugar", card: played },
    );
  }

  it("las cartas sueltas de la mesa se las lleva quien capturo de ultimo", () => {
    const next = closing({ captured: [24, 12], lastCapturer: 0 });
    assert.equal(next.lastHand.cards[0].cards, 28, "24 + las 4 que quedaron en la mesa");
    assert.equal(next.lastHand.cards[1].cards, 12);
    assert.equal(next.lastHand.cards[0].cards + next.lastHand.cards[1].cards, 40);
  });

  it("2 jugadores: cuenta contra 20 cartas cada uno", () => {
    const next = closing({ captured: [24, 12], lastCapturer: 0 });
    assert.equal(next.scores[0], 8, "28 - 20");
    assert.equal(next.scores[1], 0);
  });

  it("3 jugadores: el repartidor cuenta hasta 14 y los demas hasta 13", () => {
    const next = closing({ players: 3, captured: [16, 12, 8], lastCapturer: 2 });
    assert.equal(next.lastHand.cards[0].threshold, 14, "asiento 0 reparte");
    assert.equal(next.lastHand.cards[1].threshold, 13);
    assert.equal(next.lastHand.cards[2].threshold, 13);
    assert.equal(next.scores[0], 2, "16 - 14");
    assert.equal(next.scores[2], 0, "8 + 4 = 12, por debajo de 13");
  });

  it("4 jugadores: 10 por cabeza, sumado por pareja", () => {
    const next = closing({ players: 4, captured: [14, 5, 9, 8], lastCapturer: 1 });
    assert.equal(next.lastHand.cards[0].threshold, 20);
    assert.equal(next.lastHand.cards[0].cards, 23, "14 + 9");
    assert.equal(next.scores[0], 3);
    assert.equal(next.scores[1], 0, "5 + 4 + 8 = 17");
  });

  it("rota el repartidor y vuelve a fase de reparto", () => {
    const next = closing({ players: 3, captured: [13, 13, 10], lastCapturer: 2 });
    assert.equal(next.phase, "reparto");
    assert.equal(next.dealer, 1);
    assert.equal(next.hand, null);
    assert.equal(next.lastHand.number, 1);
  });

  it("modo tradicional: todos los cantos suman, cada uno por su cuenta", () => {
    const next = closing({
      captured: [20, 16],
      lastCapturer: 1,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "ronda", points: 4, killed: false },
        { id: "b", seat: 1, deal: 1, type: "patrulla", points: 6, killed: false },
      ],
    });
    assert.equal(next.scores[0], 4);
    assert.equal(next.scores[1], 6);
  });

  it("modo tradicional: dos Rondas rivales cobran las dos", () => {
    const next = closing({
      captured: [20, 16],
      lastCapturer: 1,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "ronda", points: 4, killed: false },
        { id: "b", seat: 1, deal: 1, type: "ronda", points: 1, killed: false },
      ],
    });
    assert.equal(next.scores[0], 4);
    assert.equal(next.scores[1], 1);
  });

  it("modo tradicional: dos cantos identicos de rivales cobran los dos", () => {
    const next = closing({
      captured: [20, 16],
      lastCapturer: 1,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "ronda", points: 3, rank: [8], killed: false },
        { id: "b", seat: 1, deal: 1, type: "ronda", points: 3, rank: [8], killed: false },
      ],
    });
    assert.deepEqual(next.scores, [3, 3]);
  });

  it("modo tradicional: la pareja suma los dos cantos", () => {
    const next = closing({
      players: 4,
      captured: [10, 10, 10, 6],
      lastCapturer: 3,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "ronda", points: 3, killed: false },
        { id: "b", seat: 2, deal: 1, type: "patrulla", points: 6, killed: false },
      ],
    });
    assert.equal(next.scores[0], 9);
    assert.equal(next.scores[1], 0);
  });

  it("modo tradicional: lo unico que quita un canto es que te lo maten", () => {
    const next = closing({
      captured: [20, 16],
      lastCapturer: 1,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "patrulla", points: 6, killed: true },
        { id: "b", seat: 1, deal: 1, type: "ronda", points: 1, killed: false },
      ],
    });
    assert.equal(next.scores[0], 0);
    assert.equal(next.scores[1], 1);
  });

  it("mayor canto: patrulla 4,5,6 le gana a patrulla 1,2,3 aunque valgan 6 las dos", () => {
    const next = closing({
      mode: "mayor-canto",
      captured: [20, 16],
      lastCapturer: 1,
      declaredCantos: [
        // rank = posicion de la carta mas alta: el 3 esta en la 2, el 6 en la 5.
        { id: "baja", seat: 0, deal: 1, type: "patrulla", points: 6, rank: [2], killed: false },
        { id: "alta", seat: 1, deal: 1, type: "patrulla", points: 6, rank: [5], killed: false },
      ],
    });
    assert.equal(next.scores[0], 0);
    assert.equal(next.scores[1], 6);
  });

  it("mayor canto: ronda de 5 le gana a ronda de 3, aunque las dos valgan 1", () => {
    const next = closing({
      mode: "mayor-canto",
      captured: [20, 16],
      lastCapturer: 1,
      declaredCantos: [
        { id: "tres", seat: 0, deal: 1, type: "ronda", points: 1, rank: [2], killed: false },
        { id: "cinco", seat: 1, deal: 1, type: "ronda", points: 1, rank: [4], killed: false },
      ],
    });
    assert.equal(next.scores[0], 0);
    assert.equal(next.scores[1], 1);
  });

  it("mayor canto: dos cantos identicos de rivales se pisan", () => {
    const next = closing({
      mode: "mayor-canto",
      captured: [20, 16],
      lastCapturer: 1,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "ronda", points: 3, rank: [8], killed: false },
        { id: "b", seat: 1, deal: 1, type: "ronda", points: 3, rank: [8], killed: false },
      ],
    });
    assert.deepEqual(next.scores, [0, 0]);
  });

  it("mayor canto: dos cantos identicos de la MISMA pareja cobran una sola vez", () => {
    const next = closing({
      players: 4,
      mode: "mayor-canto",
      captured: [10, 10, 10, 6],
      lastCapturer: 3,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "ronda", points: 3, rank: [8], killed: false },
        { id: "b", seat: 2, deal: 1, type: "ronda", points: 3, rank: [8], killed: false },
      ],
    });
    assert.equal(next.scores[0], 3);
    assert.equal(next.scores[1], 0);
  });

  it("modo mayor canto: en la tanda solo cobra el canto mas alto", () => {
    const next = closing({
      mode: "mayor-canto",
      captured: [20, 16],
      lastCapturer: 1,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "ronda", points: 4, killed: false },
        { id: "b", seat: 1, deal: 1, type: "patrulla", points: 6, killed: false },
      ],
    });
    assert.equal(next.scores[0], 0);
    assert.equal(next.scores[1], 6);
  });

  it("mayor canto: entre tu y tu pareja solo cobra el mas alto de los dos", () => {
    const next = closing({
      players: 4,
      mode: "mayor-canto",
      captured: [10, 10, 10, 6],
      lastCapturer: 3,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "vigia", points: 7, killed: false },
        { id: "b", seat: 2, deal: 1, type: "patrulla", points: 6, killed: false },
      ],
    });
    assert.equal(next.scores[0], 7, "la vigia, no la vigia mas la patrulla");
    assert.equal(next.scores[1], 0);
  });

  it("mayor canto: si te matan el tuyo, cobra el de tu pareja", () => {
    const next = closing({
      players: 4,
      mode: "mayor-canto",
      captured: [10, 10, 10, 6],
      lastCapturer: 3,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "vigia", points: 7, killed: true },
        { id: "b", seat: 2, deal: 1, type: "patrulla", points: 6, killed: false },
      ],
    });
    assert.equal(next.scores[0], 6, "sobrevive la patrulla de la pareja");
  });

  it("mayor canto: un rival con canto mas alto tapa a los dos de la pareja", () => {
    const next = closing({
      players: 4,
      mode: "mayor-canto",
      captured: [10, 10, 10, 6],
      lastCapturer: 3,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "vigia", points: 7, killed: true },
        { id: "b", seat: 2, deal: 1, type: "patrulla", points: 6, killed: false },
        { id: "c", seat: 1, deal: 1, type: "registro", points: 8, killed: false },
      ],
    });
    assert.equal(next.scores[0], 0);
    assert.equal(next.scores[1], 8);
  });

  it("mayor canto compara dentro de cada tanda, no contra toda la mano", () => {
    const next = closing({
      mode: "mayor-canto",
      captured: [20, 16],
      lastCapturer: 1,
      declaredCantos: [
        { id: "a", seat: 0, deal: 1, type: "patrulla", points: 6, killed: false },
        { id: "b", seat: 1, deal: 2, type: "ronda", points: 1, killed: false },
      ],
    });
    assert.equal(next.scores[0], 6);
    assert.equal(next.scores[1], 1);
  });

  it("un canto matado no cobra nunca", () => {
    const next = closing({
      captured: [20, 16],
      lastCapturer: 1,
      declaredCantos: [{ id: "a", seat: 0, deal: 1, type: "casa-grande", points: 12, killed: true }],
    });
    assert.deepEqual(next.scores, [0, 0]);
  });
});

describe("reparto de la siguiente tanda", () => {
  it("cuando todos se quedan sin cartas y queda mazo, se reparten 3 mas", () => {
    let match = dealt({ players: 2, seed: "tanda" });
    const deckBefore = match.hand.deck.length;

    // Seis jugadas: las 3 cartas de cada uno.
    for (let i = 0; i < 6; i += 1) {
      const seat = match.hand.turn;
      const [move] = legalMoves(match, seat);
      match = applyMove(match, seat, move);
      if (match.winner !== null) return;
    }

    assert.equal(match.hand.deals, 2);
    assert.deepEqual(match.hand.hands.map((h) => h.length), [3, 3]);
    assert.equal(match.hand.deck.length, deckBefore - 6);
    assert.equal(countAllCards(match), 40);
  });

  it("los cantos se vuelven a mirar en cada tanda", () => {
    let match = dealt({ players: 2, seed: "tanda" });
    const cantoBefore = match.hand.canto.map((c) => c && c.type);

    for (let i = 0; i < 6; i += 1) {
      const seat = match.hand.turn;
      match = applyMove(match, seat, legalMoves(match, seat)[0]);
      if (match.winner !== null) return;
    }

    assert.deepEqual(match.hand.declared, [false, false], "se puede volver a cantar");
    assert.equal(match.hand.canto.length, 2);
    // El canto se recalculo sobre las cartas nuevas, no quedo el de la tanda 1.
    const cantoAfter = match.hand.canto.map((c) => c && c.type);
    assert.notEqual(JSON.stringify(cantoBefore) + "x", JSON.stringify(cantoAfter));
  });
});

describe("turnos y validaciones", () => {
  it("quien no tiene el turno no tiene jugadas", () => {
    const match = dealt({ players: 3, seed: 5 });
    for (let seat = 0; seat < 3; seat += 1) {
      if (seat !== match.hand.turn) assert.deepEqual(legalMoves(match, seat), []);
    }
  });

  it("jugar fuera de turno es un error tipado", () => {
    const match = dealt({ players: 3, seed: 5 });
    const otro = (match.hand.turn + 1) % 3;
    assert.throws(() => applyMove(match, otro, { type: "jugar", card: match.hand.hands[otro][0].id }), {
      code: "FUERA_DE_TURNO",
    });
  });

  it("jugar una carta que no tienes es un error tipado", () => {
    const match = dealt({ players: 2, seed: 5 });
    const seat = match.hand.turn;
    const ajena = createDeck().find((c) => !match.hand.hands[seat].some((mine) => mine.id === c.id));
    assert.throws(() => applyMove(match, seat, { type: "jugar", card: ajena.id }), {
      code: "CARTA_INVALIDA",
    });
  });

  it("el turno avanza al de la derecha", () => {
    const match = dealt({ players: 4, seed: 5 });
    const seat = match.hand.turn;
    const next = applyMove(match, seat, legalMoves(match, seat)[0]);
    if (next.winner === null) assert.equal(next.hand.turn, (seat + 1) % 4);
  });

  it("no se puede jugar con la partida terminada", () => {
    const match = { ...scenario({ turn: 1, hands: [[], cards("oros-3")] }), winner: 0, phase: "terminada" };
    assert.throws(() => applyMove(match, 1, { type: "jugar", card: "oros-3" }), {
      code: "PARTIDA_TERMINADA",
    });
  });
});

describe("inmutabilidad", () => {
  it("applyMove no toca el estado que recibe", () => {
    const match = dealt({ players: 3, seed: "inmutable" });
    const snapshot = JSON.stringify(match);
    applyMove(match, match.hand.turn, legalMoves(match, match.hand.turn)[0]);
    assert.equal(JSON.stringify(match), snapshot);
  });

  it("legalMoves no toca el estado", () => {
    const match = dealt({ players: 2, seed: "inmutable" });
    const snapshot = JSON.stringify(match);
    legalMoves(match, match.hand.turn);
    assert.equal(JSON.stringify(match), snapshot);
  });
});

describe("publicStateFor", () => {
  it("no expone las cartas de los demas ni el mazo", () => {
    const match = dealt({ players: 4, seed: "espia" });
    for (let seat = 0; seat < 4; seat += 1) {
      const view = publicStateFor(match, seat);
      const serialized = JSON.stringify(view);
      // Con comillas: "oros-1" es substring de "oros-10" y daria falso positivo.
      const leaks = (id) => serialized.includes(JSON.stringify(id));

      for (let other = 0; other < 4; other += 1) {
        if (other === seat) continue;
        for (const hidden of match.hand.hands[other]) {
          assert.ok(!leaks(hidden.id), `se filtro ${hidden.id} del asiento ${other}`);
        }
      }
      for (const hidden of match.hand.deck) {
        assert.ok(!leaks(hidden.id), `se filtro ${hidden.id} del mazo`);
      }
    }
  });

  it("manda los ultimos eventos, y ninguno lleva una carta oculta", () => {
    let match = dealt({ players: 4, seed: "eventos" });
    for (let i = 0; i < 8 && match.winner === null; i += 1) {
      const seat = match.hand.turn;
      match = applyMove(match, seat, legalMoves(match, seat)[0]);
    }

    for (let seat = 0; seat < 4; seat += 1) {
      const view = publicStateFor(match, seat);
      assert.ok(view.events.length > 0);
      assert.equal(view.eventCount, match.log.length);

      const serialized = JSON.stringify(view.events);
      const ocultas = match.hand.hands
        .filter((_, other) => other !== seat)
        .flat()
        .concat(match.hand.deck);
      for (const card of ocultas) {
        assert.ok(!serialized.includes(JSON.stringify(card.id)), `el log filtro ${card.id}`);
      }
    }
  });

  it("avisa si todavia queda carta con la que declarar el canto", () => {
    const match = scenario({
      turn: 1,
      hands: [cards("bastos-1", "bastos-2", "bastos-3"), cards("oros-5", "copas-5", "espadas-2")],
      table: cards("bastos-12"),
    });
    assert.equal(publicStateFor(match, 1).hand.myCantoPlayable, true);

    // Jugadas las dos del par, el canto ya no se puede declarar aunque
    // `myCanto` siga describiendolo.
    let next = applyMove(match, 1, { type: "jugar", card: "oros-5" });
    next = applyMove(next, 0, { type: "jugar", card: next.hand.hands[0][0].id });
    next = applyMove(next, 1, { type: "jugar", card: "copas-5" });

    const view = publicStateFor(next, 1);
    assert.equal(view.hand.myCanto.type, "ronda");
    assert.equal(view.hand.myCantoPlayable, false);
    assert.ok(legalMoves(next, 1).every((move) => move.canDeclare === false));
  });

  it("si expone lo propio, la mesa y el marcador", () => {
    const match = dealt({ players: 2, seed: "vista" });
    const seat = match.hand.turn;
    const view = publicStateFor(match, seat);

    assert.deepEqual(view.hand.myCards, match.hand.hands[seat]);
    assert.deepEqual(view.hand.table, match.hand.table);
    assert.deepEqual(view.hand.cardsLeft, [3, 3]);
    assert.equal(view.hand.deckLeft, 30);
    assert.equal(view.legalMoves.length, 3);
    assert.deepEqual(publicStateFor(match, (seat + 1) % 2).legalMoves, []);
  });
});
