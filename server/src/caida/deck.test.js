import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { VALUES, areConsecutive, caidaPoints, createDeck, nextValue } from "./deck.js";

describe("baraja", () => {
  it("tiene 40 cartas sin repetir", () => {
    const deck = createDeck();
    assert.equal(deck.length, 40);
    assert.equal(new Set(deck.map((card) => card.id)).size, 40);
  });

  it("no tiene 8 ni 9", () => {
    assert.ok(!VALUES.includes(8));
    assert.ok(!VALUES.includes(9));
    assert.equal(createDeck().filter((card) => card.value === 8 || card.value === 9).length, 0);
  });

  it("tiene 4 cartas de cada valor", () => {
    const deck = createDeck();
    for (const value of VALUES) {
      assert.equal(deck.filter((card) => card.value === value).length, 4, `valor ${value}`);
    }
  });
});

describe("orden de valores", () => {
  it("el 7 conecta con el 10 (no hay 8 ni 9)", () => {
    assert.equal(nextValue(7), 10);
    assert.ok(areConsecutive(7, 10));
    assert.ok(areConsecutive(10, 7));
  });

  it("el 12 es el tope de la escalera", () => {
    assert.equal(nextValue(12), null);
  });

  it("sigue la cadena completa 1..12", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].map(nextValue),
      [2, 3, 4, 5, 6, 7, 10, 11, 12, null],
    );
  });

  it("no considera consecutivos a los que estan a distancia 2", () => {
    assert.ok(!areConsecutive(7, 11));
    assert.ok(!areConsecutive(1, 3));
    assert.ok(!areConsecutive(12, 1));
  });
});

describe("puntos por valor", () => {
  it("del 1 al 7 valen 1", () => {
    for (const value of [1, 2, 3, 4, 5, 6, 7]) assert.equal(caidaPoints(value), 1);
  });

  it("las figuras valen 2, 3 y 4", () => {
    assert.equal(caidaPoints(10), 2);
    assert.equal(caidaPoints(11), 3);
    assert.equal(caidaPoints(12), 4);
  });
});
