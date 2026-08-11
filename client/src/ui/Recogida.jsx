import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

import Carta from '../cartas/Carta.jsx'

// La carta jugada no desaparece con su botín: RECORRE la mesa. Va a la
// primera que se lleva, la recoge, sigue a la siguiente, la recoge, y cuando
// no queda ninguna se van todas juntas al montón de quien capturó.
//
// Esto no se puede hacer solo con CSS: hay que medir dónde está cada carta en
// pantalla y encadenar los saltos. Por eso se mide con getBoundingClientRect
// y se anima con fotogramas (`x: [a, b, c]`), que es lo que Motion permite.

/** Cuánto tarda cada salto de una carta a la siguiente. */
export const SALTO_MS = 420
/** La pausa encima de cada carta antes de llevársela. */
export const AGARRE_MS = 180

/**
 * @param origen  desde dónde sale la carta jugada, en coordenadas de pantalla
 * @param paradas una por cada carta que se lleva, en el orden del arrastre
 * @param destino el montón de quien capturó
 */
export default function Recogida({ carta, origen, paradas, destino, onFin }) {
  const [llevadas, setLlevadas] = useState(0)

  // Cada parada apaga su carta cuando la jugada llega encima.
  useEffect(() => {
    const relojes = paradas.map((_, i) =>
      setTimeout(() => setLlevadas(i + 1), (i + 1) * (SALTO_MS + AGARRE_MS)),
    )
    const fin = setTimeout(
      onFin,
      paradas.length * (SALTO_MS + AGARRE_MS) + SALTO_MS + 120,
    )
    return () => {
      relojes.forEach(clearTimeout)
      clearTimeout(fin)
    }
  }, [paradas, onFin])

  const puntos = [origen, ...paradas, destino]
  const total = puntos.length - 1

  return (
    <>
      {/* Las cartas de la mesa que se va llevando, aún en su sitio, y que se
          apagan una a una según llega la jugada. */}
      {paradas.map((parada, i) => (
        <motion.div
          key={parada.id}
          className="recogida-presa"
          style={{ left: parada.x, top: parada.y, width: parada.ancho, height: parada.alto }}
          animate={llevadas > i ? { opacity: 0, scale: 0.72 } : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.26 }}
        >
          <Carta carta={parada.carta} />
        </motion.div>
      ))}

      {/* La carta que va recogiendo. Pasa por debajo de cada una. */}
      <motion.div
        className="recogida-viajera"
        style={{ width: origen.ancho, height: origen.alto }}
        initial={{ x: origen.x, y: origen.y, scale: 1, rotate: 0, opacity: 1 }}
        animate={{
          x: puntos.map((p) => p.x),
          y: puntos.map((p) => p.y),
          rotate: puntos.map((_, i) => (i === 0 || i === total ? 0 : i % 2 ? -7 : 7)),
          scale: puntos.map((_, i) => (i === total ? 0.5 : 1)),
          opacity: puntos.map((_, i) => (i === total ? 0 : 1)),
        }}
        transition={{
          duration: (total * (SALTO_MS + AGARRE_MS)) / 1000,
          times: puntos.map((_, i) => i / total),
          ease: 'easeInOut',
        }}
      >
        <Carta carta={carta} />
      </motion.div>
    </>
  )
}
