import { sonido } from '../sonido.js'

// Traduce los eventos del motor a frases y sonidos. Vive aparte del tablero
// porque es lo que más va a cambiar cuando probemos jugando.

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

const RAZON = {
  'mesa-cantada': 'mesa cantada',
  'mal-echada': 'mal echada',
  caida: 'caída',
  'mesa-limpia': 'mesa',
  canto: 'canto',
  cartas: 'cartas',
}

export function nombreCanto(tipo) {
  return NOMBRE_CANTO[tipo] ?? tipo
}

/**
 * Convierte un evento en un aviso para la pantalla, o `null` si no merece uno.
 * `quien(seat)` devuelve el nombre del jugador de ese asiento.
 */
export function describir(evento, quien) {
  switch (evento.type) {
    case 'reparto':
      return {
        tono: 'neutro',
        texto: `${quien(evento.seat ?? evento.dealer)} reparte: primero ${evento.first}, contando ${evento.direction}`,
      }
    case 'mesa-cantada':
      return { tono: 'bueno', texto: `¡Mesa cantada! ${quien(evento.seat)} acierta ${evento.points}` }
    case 'mal-echada':
      return { tono: 'neutro', texto: `Mal echada: 1 de consuelo para ${quien(evento.seat)}` }
    case 'caida':
      return {
        tono: 'fuerte',
        texto: evento.mesaLimpia
          ? `¡CAÍDA CON MESA! ${quien(evento.seat)} se lleva todo (+${evento.points})`
          : `¡Caída! ${quien(evento.seat)} (+${evento.points})`,
      }
    case 'recoger':
      return evento.mesaLimpia
        ? { tono: 'bueno', texto: `¡Mesa limpia! ${quien(evento.seat)} (+${evento.points})` }
        : null
    case 'canto':
      return {
        tono: 'canto',
        texto: `${quien(evento.seat)} canta ${nombreCanto(evento.canto)} (${evento.points})`,
      }
    case 'mata-canto':
      return {
        tono: 'malo',
        texto: `${quien(evento.seat)} le MATA el ${nombreCanto(evento.canto)} a ${quien(evento.victim)}`,
      }
    case 'reparto-parcial':
      return { tono: 'neutro', texto: 'Tres cartas más para cada uno' }
    case 'ultimas':
      return { tono: 'neutro', texto: `${quien(evento.seat)} se lleva las últimas` }
    case 'canto-anulado':
      return {
        tono: 'malo',
        texto: `${nombreCanto(evento.canto)} repetido: se pisan y no cobra nadie`,
      }
    case 'fin-partida':
      return null // lo anuncia el cartel de fin, no un aviso pasajero
    default:
      return null
  }
}

/** El sonido que le toca a cada evento. */
export function sonar(evento, miAsiento, miEquipo) {
  switch (evento.type) {
    case 'reparto':
      sonido.barajar()
      setTimeout(() => sonido.reparto(4), 450)
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

export const ETIQUETA_RAZON = RAZON
