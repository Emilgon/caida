import Carta, { VUELO } from '../cartas/Carta.jsx'

// El conteo de la mesa, hecho a mano como en la mesa de verdad: el repartidor
// va poniendo las cartas y cantando el número. Empieza por el 1 o por el 4, y
// de ahí sigue la secuencia; no puede saltar al 2 ni al 3.
//
// Quien manda aquí es el servidor: cada carta puesta es una jugada suya, así
// que todos ven la mesa llenarse a la vez y nadie puede jugar hasta el final.

export const SECUENCIA = {
  ascendente: [1, 2, 3, 4],
  descendente: [4, 3, 2, 1],
}

/** Qué posición del reparto le toca a la silueta numerada `n`. */
export function posicionDeNumero(n, direction) {
  return direction === 'ascendente' ? n - 1 : 4 - n
}

export default function Reparto({ mesa, direction, contadas, puedoContar, onContar }) {
  return (
    <div className="conteo">
      {[1, 2, 3, 4].map((n) => {
        const pos = direction ? posicionDeNumero(n, direction) : null
        const puesta = pos !== null && pos < contadas
        const carta = puesta ? mesa[pos] : null

        // Al principio solo valen el 1 y el 4; después, el siguiente de la fila.
        const siguiente = direction ? SECUENCIA[direction][contadas] === n : n === 1 || n === 4
        const activa = puedoContar && !puesta && siguiente

        return (
          <button
            key={n}
            type="button"
            className={[
              'conteo-hueco',
              puesta && 'conteo-puesta',
              activa && 'conteo-activa',
              !activa && !puesta && 'conteo-quieta',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={!activa}
            onClick={() => onContar(n)}
            aria-label={activa ? `Poner la carta número ${n}` : `Número ${n}`}
          >
            {carta ? (
              // Sale del mazo, que está a la izquierda, y se posa en su hueco.
              <Carta
                carta={carta}
                vuela
                initial={{ x: -280 - n * 70, y: -40, rotate: -20, scale: 0.8, opacity: 0 }}
                animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
                transition={VUELO}
              />
            ) : (
              <span className="conteo-numero">{n}</span>
            )}
            {puesta && <span className="conteo-cantado">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}
