import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CANTOS, detectCanto } from "./cantos.js";
import { cards } from "./testing.js";

function canto(...ids) {
  return detectCanto(cards(...ids));
}

describe("deteccion de cantos", () => {
  it("Ronda: par + una suelta, puntos segun el valor del par", () => {
    const bajo = canto("oros-5", "copas-5", "espadas-2");
    assert.equal(bajo.type, CANTOS.RONDA);
    assert.equal(bajo.points, 1);

    assert.equal(canto("oros-10", "copas-10", "espadas-2").points, 2);
    assert.equal(canto("oros-11", "copas-11", "espadas-5").points, 3);
    assert.equal(canto("oros-12", "copas-12", "espadas-5").points, 4);
  });

  it("Ronda: solo las dos cartas del par sirven para cantarla", () => {
    const ronda = canto("oros-5", "copas-5", "espadas-2");
    assert.deepEqual(ronda.cards.sort(), ["copas-5", "oros-5"]);
  });

  it("Trivilin: trio, 5 puntos", () => {
    const trio = canto("oros-4", "copas-4", "espadas-4");
    assert.equal(trio.type, CANTOS.TRIVILIN);
    assert.equal(trio.points, 5);
    assert.equal(trio.cards.length, 3);
  });

  it("Patrulla: tres consecutivas, 6 puntos", () => {
    const patrulla = canto("oros-3", "copas-4", "espadas-5");
    assert.equal(patrulla.type, CANTOS.PATRULLA);
    assert.equal(patrulla.points, 6);
  });

  it("Patrulla: cruza el hueco del 8 y el 9 (6,7,10)", () => {
    assert.equal(canto("oros-6", "copas-7", "espadas-10").type, CANTOS.PATRULLA);
    assert.equal(canto("oros-7", "copas-10", "espadas-11").type, CANTOS.PATRULLA);
  });

  it("Vigia: par + una consecutiva al par, 7 puntos", () => {
    const vigia = canto("oros-7", "copas-7", "espadas-10");
    assert.equal(vigia.type, CANTOS.VIGIA);
    assert.equal(vigia.points, 7);
  });

  it("Vigia gana a Ronda cuando la suelta pega con el par", () => {
    // 5,5,6 podria leerse como Ronda de 5 (1 punto); vale como Vigia (7).
    assert.equal(canto("oros-5", "copas-5", "espadas-6").type, CANTOS.VIGIA);
    // 5,5,7 no es Vigia: el 7 no pega con el 5.
    assert.equal(canto("oros-5", "copas-5", "espadas-7").type, CANTOS.RONDA);
  });

  it("Registro: 1, 11, 12, 8 puntos", () => {
    const registro = canto("oros-1", "copas-11", "espadas-12");
    assert.equal(registro.type, CANTOS.REGISTRO);
    assert.equal(registro.points, 8);
  });

  it("Registrico: 1, 10, 11, 10 puntos", () => {
    const registrico = canto("oros-1", "copas-10", "espadas-11");
    assert.equal(registrico.type, CANTOS.REGISTRICO);
    assert.equal(registrico.points, 10);
  });

  it("Casa Chica: 1, 11, 11, 11 puntos (gana a la Ronda de 11)", () => {
    const casa = canto("oros-1", "copas-11", "espadas-11");
    assert.equal(casa.type, CANTOS.CASA_CHICA);
    assert.equal(casa.points, 11);
  });

  it("Casa Grande: 1, 12, 12, 12 puntos (gana a la Ronda de 12)", () => {
    const casa = canto("oros-1", "copas-12", "espadas-12");
    assert.equal(casa.type, CANTOS.CASA_GRANDE);
    assert.equal(casa.points, 12);
  });

  it("una mano sin par ni escalera no canta nada", () => {
    assert.equal(canto("oros-2", "copas-5", "espadas-12"), null);
    assert.equal(canto("oros-1", "copas-4", "espadas-10"), null);
  });

  it("el orden en que llegan las cartas no cambia el canto", () => {
    const a = canto("espadas-12", "oros-1", "copas-12");
    const b = canto("oros-1", "copas-12", "espadas-12");
    assert.equal(a.type, b.type);
    assert.equal(a.points, b.points);
  });

  it("no canta con una mano incompleta", () => {
    assert.equal(detectCanto(cards("oros-5", "copas-5")), null);
    assert.equal(detectCanto([]), null);
  });
});
