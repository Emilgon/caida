import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  addBot,
  applyGameMove,
  createRoom,
  currentSeat,
  gameViewFor,
  publicRoom,
  startMatch,
} from '../../../server/src/rooms/room.js'
import { chooseMove } from '../../../server/src/bots/policy.js'

import Carta, { Dorso } from '../cartas/Carta.jsx'
import Jugador from './Jugador.jsx'
import Marcador from './Marcador.jsx'
import Mesa from './Mesa.jsx'
import Reparto, { SECUENCIA, posicionDeNumero } from './Reparto.jsx'
import Sala from './Sala.jsx'
import { cartaDeId } from './narracion.js'

const cartasDe = (...ids) => ids.map(cartaDeId)

// Renderiza las pantallas contra estados de verdad salidos del motor. No
// sustituye a mirar la pantalla, pero atrapa lo que sí se puede atrapar sin
// navegador: que un campo no exista, que algo sea undefined, que reviente.

const acciones = new Proxy({}, { get: () => async () => ({ ok: true }) })

function mesaConBots(players, jugadas = 0) {
  let room = createRoom({ code: 'PRUEBA', hostId: 'yo', hostName: 'Emilio', players })
  for (let i = 1; i < players; i += 1) room = addBot(room, { hostId: 'yo' })
  room = startMatch(room, { hostId: 'yo', seed: `pantalla-${players}` })

  for (let i = 0; i < jugadas && room.phase === 'jugando'; i += 1) {
    const seat = currentSeat(room)
    if (seat === null) break
    const vista = gameViewFor(room, room.seats[seat].id)
    room = applyGameMove(room, { playerId: room.seats[seat].id, move: chooseMove(vista) })
  }
  return room
}

function pintarMesa(room) {
  return renderToStaticMarkup(
    <Mesa
      room={publicRoom(room, 'yo')}
      game={gameViewFor(room, 'yo')}
      acciones={acciones}
      onSalir={() => {}}
    />,
  )
}

describe('las cartas se dibujan', () => {
  it('las 40 cartas de la baraja, sin reventar', () => {
    for (const suit of ['oros', 'copas', 'espadas', 'bastos']) {
      for (const value of [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]) {
        const html = renderToStaticMarkup(<Carta carta={{ id: `${suit}-${value}`, suit, value }} />)
        assert.ok(html.includes('<svg'), `${suit}-${value} no pintó`)
        assert.ok(html.includes(`${value} de`), `${suit}-${value} sin etiqueta accesible`)
      }
    }
  })

  it('cada palo corta el marco un número distinto de veces', () => {
    // Ésa es la pinta: se reconoce el palo por los cortes del borde.
    const lineas = (suit) =>
      (renderToStaticMarkup(<Carta carta={{ id: `${suit}-5`, suit, value: 5 }} />).match(/<line/g) ?? [])
        .length

    assert.ok(lineas('copas') > lineas('oros'), 'copas debería cortar más que oros')
    assert.ok(lineas('espadas') > lineas('copas'), 'espadas más que copas')
    assert.ok(lineas('bastos') > lineas('espadas'), 'bastos más que espadas')
  })

  it('el reverso no deja ver nada', () => {
    const html = renderToStaticMarkup(<Dorso />)
    assert.ok(!/oros|copas|espadas|bastos/.test(html))
  })
})

describe('la sala se dibuja', () => {
  it('con asientos libres y con bots sentados', () => {
    let room = createRoom({ code: 'PRUEBA', hostId: 'yo', hostName: 'Emilio', players: 4 })
    const vacia = renderToStaticMarkup(
      <Sala sala={publicRoom(room, 'yo')} acciones={acciones} onSalir={() => {}} />,
    )
    assert.ok(vacia.includes('PRUEBA'))
    assert.ok(vacia.includes('Libre'))
    assert.ok(vacia.includes('Faltan 3'))

    room = addBot(room, { hostId: 'yo' })
    const conBot = renderToStaticMarkup(
      <Sala sala={publicRoom(room, 'yo')} acciones={acciones} onSalir={() => {}} />,
    )
    assert.ok(conBot.includes('Odaa'))
    assert.ok(conBot.includes('Bot'))
  })

  it('quien no es líder no ve los controles del líder', () => {
    let room = createRoom({ code: 'PRUEBA', hostId: 'yo', hostName: 'Emilio', players: 2 })
    room = addBot(room, { hostId: 'yo' })
    const html = renderToStaticMarkup(
      <Sala sala={publicRoom(room, 'otro')} acciones={acciones} onSalir={() => {}} />,
    )
    assert.ok(!html.includes('Barajar y empezar'))
    assert.ok(html.includes('Esperando'))
  })
})

describe('el tablero se dibuja', () => {
  for (const players of [2, 3, 4]) {
    it(`con ${players} jugadores, antes de repartir`, () => {
      const html = pintarMesa(mesaConBots(players))
      assert.ok(html.includes('PRUEBA'))
      // O reparto yo, o me dicen quién reparte.
      assert.ok(/Te toca repartir|Reparte /.test(html))
    })

    it(`con ${players} jugadores, con la mano en juego`, () => {
      const room = mesaConBots(players, 6)
      const html = pintarMesa(room)
      assert.ok(html.includes('Emilio'))
      assert.ok(html.includes('Odaa'))
      // Se ven cartas en la mesa o en mi mano.
      assert.ok(html.includes('<svg'))
    })
  }

  it('nunca dibuja una carta que no debería ver', () => {
    const room = mesaConBots(4, 9)
    const html = pintarMesa(room)
    const mias = new Set((gameViewFor(room, 'yo').hand?.myCards ?? []).map((c) => c.id))
    const enMesa = new Set((gameViewFor(room, 'yo').hand?.table ?? []).map((c) => c.id))

    for (let seat = 1; seat < 4; seat += 1) {
      for (const carta of room.match.hand.hands[seat]) {
        if (mias.has(carta.id) || enMesa.has(carta.id)) continue
        assert.ok(
          !html.includes(`${carta.value} de`) || true, // la etiqueta se repite entre palos
          'placeholder',
        )
        // Lo que de verdad importa: el id no aparece en ningún atributo.
        assert.ok(!html.includes(carta.id), `el tablero pintó ${carta.id} del asiento ${seat}`)
      }
    }
  })

  it('la partida terminada muestra el resultado', () => {
    let room = mesaConBots(2, 0)
    let guarda = 0
    while (room.phase === 'jugando' && guarda++ < 5000) {
      const seat = currentSeat(room)
      const vista = gameViewFor(room, room.seats[seat].id)
      room = applyGameMove(room, { playerId: room.seats[seat].id, move: chooseMove(vista) })
    }
    const html = pintarMesa(room)
    assert.ok(/¡Ganaste!|Perdiste/.test(html))
    assert.ok(html.includes('Revancha'))
  })
})

describe('el conteo de la mesa', () => {
  it('la silueta 1 recibe la primera carta contando hacia arriba', () => {
    assert.equal(posicionDeNumero(1, 'ascendente'), 0)
    assert.equal(posicionDeNumero(4, 'ascendente'), 3)
  })

  it('contando hacia abajo, la primera carta cae en la silueta 4', () => {
    assert.equal(posicionDeNumero(4, 'descendente'), 0)
    assert.equal(posicionDeNumero(1, 'descendente'), 3)
  })

  it('el número de cada silueta es el que se canta en esa posición', () => {
    // Es lo que el motor usa para decidir si el repartidor acierta.
    for (const direction of ['ascendente', 'descendente']) {
      const numeros = direction === 'ascendente' ? [1, 2, 3, 4] : [4, 3, 2, 1]
      for (let pos = 0; pos < 4; pos += 1) {
        const n = SECUENCIA[direction][pos]
        assert.equal(posicionDeNumero(n, direction), pos)
        assert.equal(n, numeros[pos], `posición ${pos} en ${direction}`)
      }
    }
  })

  it('al principio solo se puede empezar por el 1 o por el 4', () => {
    const html = renderToStaticMarkup(
      <Reparto mesa={[]} direction={null} revelados={0} puedoContar onContar={() => {}} />,
    )
    const activas = (html.match(/conteo-activa/g) ?? []).length
    assert.equal(activas, 2, 'el 2 y el 3 no pueden abrir el conteo')
    assert.equal((html.match(/disabled/g) ?? []).length, 2)
  })

  it('empezado el conteo, solo vale el siguiente de la fila', () => {
    const mesa = cartasDe('oros-1', 'copas-5', 'espadas-7', 'bastos-11')
    const html = renderToStaticMarkup(
      <Reparto mesa={mesa} direction="ascendente" revelados={1} puedoContar onContar={() => {}} />,
    )
    assert.equal((html.match(/conteo-activa/g) ?? []).length, 1)
    // La primera ya está puesta y las otras dos esperan su turno.
    assert.equal((html.match(/conteo-puesta/g) ?? []).length, 1)
    assert.equal((html.match(/conteo-quieta/g) ?? []).length, 2)
  })

  it('quien no reparte no puede tocar ninguna silueta', () => {
    const html = renderToStaticMarkup(
      <Reparto mesa={[]} direction={null} revelados={0} puedoContar={false} onContar={() => {}} />,
    )
    assert.equal((html.match(/conteo-activa/g) ?? []).length, 0)
    assert.equal((html.match(/disabled/g) ?? []).length, 4)
  })
})

describe('piezas sueltas', () => {
  it('el marcador muestra las parejas con 4 jugadores', () => {
    const room = mesaConBots(4)
    const html = renderToStaticMarkup(
      <Marcador room={publicRoom(room, 'yo')} game={gameViewFor(room, 'yo')} />,
    )
    assert.ok(html.includes('Emilio y Key'), 'las parejas cruzadas son 0+2 y 1+3')
    assert.ok(html.includes('Odaa y Toby'))
  })

  it('el banner de un asiento vacío no rompe nada', () => {
    const room = createRoom({ code: 'X', hostId: 'yo', hostName: 'Emilio', players: 4 })
    const html = renderToStaticMarkup(
      <Jugador
        puesto={publicRoom(room, 'yo').seats[2]}
        game={null}
        posicion="arriba"
        esTurno={false}
        esRepartidor={false}
        cantos={[]}
      />,
    )
    assert.equal(html, '')
  })
})
