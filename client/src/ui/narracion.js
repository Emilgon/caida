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
    case 'mata-canto':
      return { seat: evento.seat, tono: 'mata', texto: '¡TE LO MATO!' }
    case 'mal-echada':
      return { seat: evento.seat, tono: 'suave', texto: 'mal echada, +1' }
    default:
      // Los cantos y los aciertos salen en grande en el centro (ver
      // `cartelDe`), no en una burbujita al lado del jugador.
      return null
  }
}

/** Al que le mataron el canto también se entera, en su propia burbuja. */
export function burbujaVictima(evento) {
  if (evento.type !== 'mata-canto') return null
  return { seat: evento.victim, tono: 'perdido', texto: `${nombreCanto(evento.canto)} anulado` }
}

const ORDINALES = ['', '1ra', '2da', '3ra', '4ta', '5ta', '6ta', '7ma', '8va']

/**
 * El cartelón que se planta en medio de la mesa.
 *
 * `equipo` colorea el aviso con el color de la pareja que lo hizo, para saber
 * de un vistazo quién fue sin leer el nombre. Los de nadie van en dorado.
 */
export function cartelDe(evento, quien, equipoDe) {
  switch (evento.type) {
    // Se reparten tres cartas más: empieza otra repartición. Se cuentan por
    // mano, así que vuelven al 1 cuando el reparto pasa a otro jugador.
    case 'reparto-parcial':
      return { tono: 'neutro', texto: `${ORDINALES[evento.deals] ?? evento.deals}ª repartición` }
    case 'mesa-puesta':
      return { tono: 'neutro', texto: '1ra repartición' }
    case 'fin-mano':
      return { tono: 'neutro', texto: `Fin de la mano ${evento.hand}` }

    // Acertó el número al poner una carta de la mesa.
    case 'mesa-cantada':
      return {
        tono: 'equipo',
        equipo: equipoDe(evento.seat),
        texto: `¡Acertó el ${evento.number}!`,
        pie: quien(evento.seat),
      }

    // El canto, en cuanto se declara: todo el mundo tiene que enterarse.
    case 'canto':
      return {
        tono: 'equipo',
        equipo: equipoDe(evento.seat),
        texto: `${nombreCanto(evento.canto)} de ${quien(evento.seat)}`,
        pie: `${evento.points} puntos`,
      }

    // La Ronda es la única que se "ve": no cuenta hasta soltar las dos del par.
    case 'canto-cobrado':
      if (evento.canto !== 'ronda') return null
      return {
        tono: 'equipo',
        equipo: evento.team,
        texto: '¡Ronda vista!',
        pie: `${quien(evento.seats[0])} · +${evento.points}`,
      }

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
