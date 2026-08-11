import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { legalMoves, publicStateFor } from "../caida/index.js";
import { cards, scenario } from "../caida/testing.js";
import { chooseMove } from "./policy.js";

// `random` fijo para que las decisiones sean reproducibles: el ruido que mete
// la politica es pequeno, asi que con 0 se ve la preferencia pura.
const quieto = () => 0;

function view(match, seat) {
  return publicStateFor(match, seat);
}

describe("el bot decide", () => {
  it("prefiere la caida antes que lanzar", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-11", "copas-2", "espadas-3")],
      table: cards("bastos-11", "oros-6"),
      lastPlayed: { seat: 0, id: "bastos-11", value: 11 },
    });
    assert.equal(chooseMove(view(match, 1), quieto).card, "oros-11");
  });

  it("prefiere la jugada que se lleva mas cartas", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-1", "copas-12", "espadas-7")],
      // El 1 arrastra 1,2,3,4; el 12 se lleva solo el 12.
      table: cards("bastos-1", "bastos-2", "bastos-3", "bastos-4", "copas-12"),
    });
    assert.equal(chooseMove(view(match, 1), quieto).card, "oros-1");
  });

  it("mata el canto cuando puede", () => {
    const match = scenario({
      players: 3,
      turn: 2,
      hands: [[], [], cards("espadas-5", "oros-10", "copas-4")],
      table: cards("bastos-12", "oros-5"),
      lastPlayed: { seat: 1, id: "oros-5", value: 5 },
      pendingCanto: { id: "x", seat: 1, card: "oros-5", value: 5 },
      declaredCantos: [{ id: "x", seat: 1, deal: 1, type: "ronda", points: 1, killed: false }],
    });
    const move = chooseMove(view(match, 2), quieto);
    assert.equal(move.card, "espadas-5");
    assert.equal(legalMoves(match, 2).find((m) => m.card === "espadas-5").killsCanto, true);
  });

  it("si no puede capturar, suelta la carta chica y guarda la grande", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-12", "copas-11", "espadas-2")],
      table: cards("bastos-7"),
    });
    // Tirar el 12 le regalaria 4 puntos a quien tenga otro 12.
    assert.equal(chooseMove(view(match, 1), quieto).card, "espadas-2");
  });

  it("prefiere cantar capturando, que es como no se lo pueden matar", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-5", "copas-5", "espadas-2")],
      table: cards("bastos-5"),
    });
    // Jugando un 5 captura el de la mesa Y canta la ronda, todo a salvo.
    const move = chooseMove(view(match, 1), quieto);
    assert.ok(["oros-5", "copas-5"].includes(move.card));
    assert.equal(legalMoves(match, 1).find((m) => m.card === move.card).canDeclare, true);
  });

  it("evita cantar lanzando si le queda otra carta del canto", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-12", "copas-12", "espadas-2")],
      table: cards("bastos-7"),
    });
    // Soltar un 12 cantaría Ronda de 12 al aire, con la otra todavía en mano:
    // el de la derecha se la mata. Mejor soltar el 2.
    assert.equal(chooseMove(view(match, 1), quieto).card, "espadas-2");
  });

  it("con la ultima carta del canto ya no evita nada: o se juega o se pierde", () => {
    const match = scenario({
      turn: 1,
      hands: [[], cards("oros-5", "espadas-2")],
      table: cards("bastos-12"),
    });
    // Canto de la tanda con una carta del par ya jugada.
    match.hand.canto[1] = { type: "ronda", points: 1, cards: ["oros-5", "copas-5"], rank: [4] };
    const move = chooseMove(view(match, 1), quieto);
    assert.ok(["oros-5", "espadas-2"].includes(move.card));
  });

  it("siempre devuelve una jugada legal", () => {
    const match = scenario({
      players: 3,
      turn: 1,
      hands: [[], cards("oros-1", "copas-12", "espadas-7"), []],
      table: cards("bastos-4", "copas-9".replace("9", "10")),
    });
    const move = chooseMove(view(match, 1), Math.random);
    assert.ok(legalMoves(match, 1).some((option) => option.card === move.card));
  });

  it("sin jugadas legales no inventa nada", () => {
    const match = scenario({ turn: 0, hands: [cards("oros-1"), []] });
    assert.equal(chooseMove(publicStateFor(match, 1), quieto), null);
  });

  it("reparte eligiendo una de las cuatro combinaciones", () => {
    const match = { ...scenario({ turn: 0 }), phase: "reparto", hand: null, dealer: 0 };
    const move = chooseMove(publicStateFor(match, 0), quieto);
    assert.equal(move.type, "repartir");
    assert.ok(["manos", "mesa"].includes(move.first));
    assert.ok(["ascendente", "descendente"].includes(move.direction));
  });
});
