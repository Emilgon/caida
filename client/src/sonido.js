// Sonido sintetizado con Web Audio: ni un archivo que descargar, y suena
// igual en cualquier navegador. Son toques cortos, no música.

let ctx = null
let silencio = leerPreferencia()

function leerPreferencia() {
  try {
    return localStorage.getItem('caida:silencio') === 'si'
  } catch {
    return false
  }
}

function contexto() {
  if (silencio) return null
  if (!ctx) {
    const Audio = window.AudioContext || window.webkitAudioContext
    if (!Audio) return null
    ctx = new Audio()
  }
  // Los navegadores arrancan el audio suspendido hasta que el usuario toca algo.
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function estaEnSilencio() {
  return silencio
}

export function alternarSilencio() {
  silencio = !silencio
  try {
    localStorage.setItem('caida:silencio', silencio ? 'si' : 'no')
  } catch {
    /* modo incógnito: nos da igual, solo no se recuerda */
  }
  if (!silencio) tono({ frecuencia: 660, duracion: 0.08, volumen: 0.12 })
  return silencio
}

/** Un tono simple con envolvente, que es lo que evita el "clic" al cortar. */
function tono({ frecuencia, duracion, tipo = 'sine', volumen = 0.15, desde = 0, barrido }) {
  const audio = contexto()
  if (!audio) return

  const t0 = audio.currentTime + desde
  const osc = audio.createOscillator()
  const gan = audio.createGain()

  osc.type = tipo
  osc.frequency.setValueAtTime(frecuencia, t0)
  if (barrido) osc.frequency.exponentialRampToValueAtTime(barrido, t0 + duracion)

  gan.gain.setValueAtTime(0.0001, t0)
  gan.gain.exponentialRampToValueAtTime(volumen, t0 + 0.012)
  gan.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion)

  osc.connect(gan).connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + duracion + 0.03)
}

/** Ruido corto y filtrado: es lo que suena a cartón, no a pitido. */
function roce({ duracion = 0.09, volumen = 0.1, corte = 2400, desde = 0 } = {}) {
  const audio = contexto()
  if (!audio) return

  const muestras = Math.max(1, Math.floor(audio.sampleRate * duracion))
  const buffer = audio.createBuffer(1, muestras, audio.sampleRate)
  const datos = buffer.getChannelData(0)
  for (let i = 0; i < muestras; i += 1) {
    // Se apaga hacia el final para que no corte en seco.
    datos[i] = (Math.random() * 2 - 1) * (1 - i / muestras) ** 2
  }

  const fuente = audio.createBufferSource()
  fuente.buffer = buffer
  const filtro = audio.createBiquadFilter()
  filtro.type = 'bandpass'
  filtro.frequency.value = corte
  const gan = audio.createGain()
  gan.gain.value = volumen

  fuente.connect(filtro).connect(gan).connect(audio.destination)
  fuente.start(audio.currentTime + desde)
}

export const sonido = {
  /** Carta que se posa en la mesa. */
  carta() {
    roce({ duracion: 0.07, volumen: 0.13, corte: 1900 })
  },

  /** Barajar: varios roces seguidos, irregulares. */
  barajar() {
    for (let i = 0; i < 14; i += 1) {
      roce({ duracion: 0.05, volumen: 0.07, corte: 1500 + Math.random() * 1600, desde: i * 0.035 })
    }
  },

  /** Reparto: una carta tras otra. */
  reparto(cuantas = 4) {
    for (let i = 0; i < cuantas; i += 1) {
      roce({ duracion: 0.06, volumen: 0.1, corte: 2100, desde: i * 0.09 })
    }
  },

  /** Recoger cartas sin caída. */
  recoger() {
    roce({ duracion: 0.14, volumen: 0.12, corte: 1300 })
  },

  /** Caída: seca y con cuerpo, tiene que sentirse. */
  caida() {
    roce({ duracion: 0.1, volumen: 0.16, corte: 1200 })
    tono({ frecuencia: 320, barrido: 180, duracion: 0.18, tipo: 'triangle', volumen: 0.18 })
  },

  /** Mesa limpia: la caída más un remate alegre. */
  mesa() {
    sonido.caida()
    tono({ frecuencia: 523, duracion: 0.12, tipo: 'triangle', volumen: 0.14, desde: 0.1 })
    tono({ frecuencia: 784, duracion: 0.2, tipo: 'triangle', volumen: 0.14, desde: 0.2 })
  },

  /** Canto: tres notas que suben, como quien lo canta en voz alta. */
  canto() {
    tono({ frecuencia: 440, duracion: 0.14, tipo: 'triangle', volumen: 0.15 })
    tono({ frecuencia: 554, duracion: 0.14, tipo: 'triangle', volumen: 0.15, desde: 0.12 })
    tono({ frecuencia: 659, duracion: 0.26, tipo: 'triangle', volumen: 0.16, desde: 0.24 })
  },

  /** Mata canto: las mismas notas pero cayendo. */
  mataCanto() {
    tono({ frecuencia: 659, duracion: 0.12, tipo: 'sawtooth', volumen: 0.12 })
    tono({ frecuencia: 415, duracion: 0.12, tipo: 'sawtooth', volumen: 0.12, desde: 0.1 })
    tono({ frecuencia: 262, duracion: 0.3, tipo: 'sawtooth', volumen: 0.13, desde: 0.2 })
  },

  /** Te toca. Discreto pero que se note si estabas mirando otra cosa. */
  turno() {
    tono({ frecuencia: 784, duracion: 0.1, tipo: 'sine', volumen: 0.13 })
    tono({ frecuencia: 1046, duracion: 0.14, tipo: 'sine', volumen: 0.11, desde: 0.1 })
  },

  /** Alguien entra o sale de la mesa. */
  puerta() {
    tono({ frecuencia: 392, duracion: 0.1, tipo: 'sine', volumen: 0.1 })
    tono({ frecuencia: 587, duracion: 0.14, tipo: 'sine', volumen: 0.1, desde: 0.08 })
  },

  /** Fin de mano. */
  mano() {
    tono({ frecuencia: 349, duracion: 0.16, tipo: 'triangle', volumen: 0.13 })
    tono({ frecuencia: 466, duracion: 0.22, tipo: 'triangle', volumen: 0.13, desde: 0.14 })
  },

  /** Ganaste. */
  victoria() {
    const notas = [523, 659, 784, 1046]
    notas.forEach((frecuencia, i) => {
      tono({ frecuencia, duracion: 0.3, tipo: 'triangle', volumen: 0.16, desde: i * 0.13 })
    })
  },

  /** Perdiste. */
  derrota() {
    const notas = [523, 440, 349, 262]
    notas.forEach((frecuencia, i) => {
      tono({ frecuencia, duracion: 0.32, tipo: 'sine', volumen: 0.13, desde: i * 0.15 })
    })
  },

  error() {
    tono({ frecuencia: 200, duracion: 0.16, tipo: 'square', volumen: 0.09 })
  },
}
