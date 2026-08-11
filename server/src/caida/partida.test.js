import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyMove, createMatch, legalMoves, publicStateFor } from "./match.js";
import { createRng } from "./rng.js";
import { countAllCards } from "./testing.js";

const MAX_MOVES = 20000;

/** A quien le toca: repartir, contar la mesa, o jugar su carta. */
function currentSeatOf(match) {
  if (match.phase === "reparto") return match.dealer;
  if (match.phase === "contando") return match.hand.dealer;
  return match.hand.turn;
}

/**
 * Juega una partida entera con un bot que elige al azar entre las jugadas
 * legales. No busca jugar bien: busca que el motor nunca se trabe ni pierda
 * cartas, pase lo que pase. Verifica las invariantes en cada jugada.
 */
function playFullMatch({ players, mode = "tradicional", target = 24, seed, botSeed = 99 }) {
  let match = createMatch({ players, mode, target, seed });
  const rng = createRng(botSeed);

  let moves = 0;
  let previousScores = [...match.scores];
  const seen = { caida: 0, recoger: 0, canto: 0, mataCanto: 0, mesaLimpia: 0, hands: 0 };

  while (match.winner === null) {
    moves += 1;
    assert.ok(moves < MAX_MOVES, "la partida no termina nunca");

    const seat = currentSeatOf(match);
    const options = legalMoves(match, seat);
    assert.ok(options.length > 0, `el asiento ${seat} se quedo sin jugadas legales`);

    // Nadie mas puede jugar en este momento.
    for (let other = 0; other < players; other += 1) {
      if (other !== seat) assert.deepEqual(legalMoves(match, other), [], `asiento ${other}`);
    }

    const choice = options[rng.int(options.length)];
    const move = choice.type === "jugar" ? { type: "jugar", card: choice.card } : choice;

    match = applyMove(match, seat, move);

    for (const entry of match.log.slice(-6)) {
      if (entry.type === "caida") seen.caida += 1;
      if (entry.type === "recoger") seen.recoger += 1;
      if (entry.type === "canto") seen.canto += 1;
      if (entry.type === "mata-canto") seen.mataCanto += 1;
      if (entry.type === "fin-mano") seen.hands += 1;
    }

    // Ninguna carta se pierde ni se duplica mientras la mano esta viva.
    if (match.hand) {
      assert.equal(countAllCards(match), 40, `mano ${match.handNumber}, jugada ${moves}`);
      const ids = [
        ...match.hand.deck,
        ...match.hand.table,
        ...match.hand.hands.flat(),
        ...match.hand.captured.flat(),
      ].map((card) => card.id);
      assert.equal(new Set(ids).size, 40, "hay cartas duplicadas");
    }

    // La "carta recien lanzada" siempre esta de verdad en la mesa: es lo que
    // decide si el siguiente puede hacer caida.
    if (match.hand?.lastPlayed) {
      const onTable = match.hand.table.some((card) => card.id === match.hand.lastPlayed.id);
      assert.ok(onTable, `lastPlayed ${match.hand.lastPlayed.id} no esta en la mesa`);
    }

    // El marcador nunca baja.
    match.scores.forEach((score, team) => {
      assert.ok(score >= previousScores[team], `el equipo ${team} perdio puntos`);
    });
    previousScores = [...match.scores];
  }

  assert.equal(match.phase, "terminada");
  assert.ok(match.scores[match.winner] >= target);
  // Solo gana quien va estrictamente adelante.
  match.scores.forEach((score, team) => {
    if (team !== match.winner) assert.ok(score < match.scores[match.winner] || score < target);
  });

  return { match, moves, seen };
}

describe("partidas completas", () => {
  for (const players of [2, 3, 4]) {
    it(`${players} jugadores, tradicional a 24, 15 semillas`, () => {
      for (let seed = 0; seed < 15; seed += 1) {
        playFullMatch({ players, seed: `t${players}-${seed}`, botSeed: seed + 1 });
      }
    });

    it(`${players} jugadores, mayor canto a 48, 10 semillas`, () => {
      for (let seed = 0; seed < 10; seed += 1) {
        playFullMatch({
          players,
          mode: "mayor-canto",
          target: 48,
          seed: `m${players}-${seed}`,
          botSeed: seed + 50,
        });
      }
    });
  }

  it("en el camino aparecen caidas, recogidas, cantos y mata cantos", () => {
    const totals = { caida: 0, recoger: 0, canto: 0, mataCanto: 0, hands: 0 };
    for (let seed = 0; seed < 12; seed += 1) {
      const { seen } = playFullMatch({ players: 4, seed: `variedad-${seed}`, botSeed: seed + 7 });
      for (const key of Object.keys(totals)) totals[key] += seen[key];
    }
    assert.ok(totals.caida > 0, "nunca hubo una caida");
    assert.ok(totals.recoger > 0, "nunca se recogio");
    assert.ok(totals.canto > 0, "nunca se canto");
    assert.ok(totals.mataCanto > 0, "nunca se mato un canto");
    assert.ok(totals.hands > 0, "nunca se cerro una mano");
  });

  it("una mano completa reparte el mazo entero y las cartas cuadran con los umbrales", () => {
    for (const players of [2, 3, 4]) {
      let match = createMatch({ players, seed: `mazo-${players}`, target: 48 });
      const rng = createRng(3);
      // Juega hasta cerrar la primera mano.
      while (match.lastHand === null && match.winner === null) {
        const seat = currentSeatOf(match);
        const options = legalMoves(match, seat);
        match = applyMove(match, seat, options[rng.int(options.length)]);
      }
      if (match.lastHand === null) continue;

      const total = match.lastHand.cards.reduce((sum, entry) => sum + entry.cards, 0);
      assert.equal(total, 40, `${players} jugadores: se repartieron ${total} cartas`);
      const thresholds = match.lastHand.cards.reduce((sum, entry) => sum + entry.threshold, 0);
      assert.equal(thresholds, 40, `${players} jugadores: los umbrales no suman 40`);
    }
  });

  it("la misma semilla y las mismas decisiones dan la misma partida", () => {
    const a = playFullMatch({ players: 3, seed: "repetible", botSeed: 4 });
    const b = playFullMatch({ players: 3, seed: "repetible", botSeed: 4 });
    assert.deepEqual(a.match.scores, b.match.scores);
    assert.equal(a.match.winner, b.match.winner);
    assert.equal(a.moves, b.moves);
    assert.deepEqual(a.match.log, b.match.log);
  });

  it("durante toda la partida ningun jugador ve las cartas ajenas", () => {
    let match = createMatch({ players: 4, seed: "espia-largo" });
    const rng = createRng(21);
    for (let i = 0; i < 400 && match.winner === null; i += 1) {
      if (match.hand) {
        for (let seat = 0; seat < 4; seat += 1) {
          const serialized = JSON.stringify(publicStateFor(match, seat));
          const hidden = match.hand.hands
            .filter((_, other) => other !== seat)
            .flat()
            .concat(match.hand.deck);
          for (const card of hidden) {
            // Con comillas: "oros-1" es substring de "oros-10".
            const leaked = serialized.includes(JSON.stringify(card.id));
            assert.ok(!leaked, `se filtro ${card.id} al asiento ${seat}`);
          }
        }
      }
      const seat = currentSeatOf(match);
      const options = legalMoves(match, seat);
      match = applyMove(match, seat, options[rng.int(options.length)]);
    }
  });
});
