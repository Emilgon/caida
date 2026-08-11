import { sonido } from '../sonido.js'

// Traduce los eventos del motor a lo que se ve y se oye. Vive aparte del
// tablero porque es lo que más va a cambiar según se vaya jugando.

const NOMBRE_CANTO = {
  ronda: 'Ronda',
  trivilin: 'Trivilín',
  patrulla: 'Patrulla',
  vigia: 'Vigía',
  registro: 'Registro',
  registrico: 'Registrico',
  'casa-chica': 'Casa Chica',
  'casa-grande': 'Casa Grande',
}

export function nombreCanto(tipo) {
  return NOMBRE_CANTO[tipo] ?? tipo
}

/** `oros-12` -> la carta, para poder dibujar una que ya salió de la mesa. */
export function cartaDeId(id) {
  const corte = id.lastIndexOf('-')
  return { id, suit: id.slice(0, corte), value: Number(id.slice(corte + 1)) }
}

/**
 * Lo que se le pone encima al jugador que acaba de hacer algo. Corto y
 * grande: tiene que leerse de reojo mientras miras la mesa.
 * Devuelve `null` si el evento no merece burbuja.
 */
export function burbujaDe(evento) {
  switch (evento.type) {
    case 'caida':
      return {
        seat: evento.seat,
        tono: 'caida',
        texto: evento.mesaLimpia ? `¡CAÍDA CON MESA! +${evento.points}` : `¡CAÍDA! +${evento.points}`,
      }
    case 'recoger':
      return evento.mesaLimpia
        ? { seat: evento.seat, tono: 'mesa', texto: `¡MESA LIMPIA! +${evento.points}` }
        : { seat: evento.seat, tono: 'suave', texto: `recoge ${evento.taken.length + 1}` }
    case 'canto':
      return {
        seat: evento.seat,
        tono: 'canto',
        texto: `¡${nombreCanto(evento.canto).toUpperCase()}! ${evento.points}`,
      }
    case 'mata-canto':
      return { seat: evento.seat, tono: 'mata', texto: '¡TE LO MATO!' }
    case 'mesa-cantada':
      return { seat: evento.seat, tono: 'mesa', texto: `¡ACERTÓ EL ${evento.number}! +${evento.points}` }
    case 'mal-echada':
      return { seat: evento.seat, tono: 'suave', texto: 'mal echada, +1' }
    // Nadie te lo mató: el canto se te ve y los puntos entran ya.
    case 'canto-cobrado':
      return {
        seat: evento.seats[0],
        tono: 'visto',
        texto: `¡${nombreCanto(evento.canto).toUpperCase()} VISTA! +${evento.points}`,
      }
    default:
      return null
  }
}

/** Al que le mataron el canto también se entera, en su propia burbuja. */
export function burbujaVictima(evento) {
  if (evento.type !== 'mata-canto') return null
  return { seat: evento.victim, tono: 'perdido', texto: `${nombreCanto(evento.canto)} anulado` }
}

/** El cartelón que se planta en medio de la mesa. Para lo que corta el ritmo. */
export function cartelDe(evento) {
  switch (evento.type) {
    case 'reparto-parcial':
      return { tono: 'ronda', texto: `Ronda ${evento.deals}` }
    case 'fin-mano':
      return { tono: 'ronda', texto: `Fin de la mano ${evento.hand}` }
    default:
      return null
  }
}

/** Lo que no es de nadie en particular: una línea discreta bajo la mesa. */
export function lineaDe(evento) {
  switch (evento.type) {
    case 'ultimas':
      return 'Las últimas cartas de la mesa se las lleva quien capturó de último'
    case 'canto-anulado':
      return `${nombreCanto(evento.canto)} repetido: se pisan y no cobra nadie`
    default:
      return null
  }
}

/** El sonido que le toca a cada evento. */
export function sonar(evento, miEquipo) {
  switch (evento.type) {
    case 'reparto':
      sonido.barajar()
      return
    case 'reparto-parcial':
      sonido.reparto(3)
      return
    case 'lanzar':
      sonido.carta()
      return
    case 'recoger':
      if (evento.mesaLimpia) sonido.mesa()
      else sonido.recoger()
      return
    case 'caida':
      if (evento.mesaLimpia) sonido.mesa()
      else sonido.caida()
      return
    case 'canto':
      sonido.canto()
      return
    case 'mata-canto':
      sonido.mataCanto()
      return
    case 'fin-mano':
      sonido.mano()
      return
    case 'fin-partida':
      if (evento.team === miEquipo) sonido.victoria()
      else sonido.derrota()
      return
    default:
  }
}
