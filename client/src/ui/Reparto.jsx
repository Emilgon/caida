import Carta from '../cartas/Carta.jsx'

// El conteo de la mesa, hecho a mano como en la mesa de verdad: el repartidor
// va poniendo las cartas y cantando el número. Empieza por el 1 o por el 4, y
// de ahí sigue la secuencia; no puede saltar al 2 ni al 3.

export const SECUENCIA = {
  ascendente: [1, 2, 3, 4],
  descendente: [4, 3, 2, 1],
}

/** Qué posición del reparto le toca a la silueta numerada `n`. */
export function posicionDeNumero(n, direction) {
  return direction === 'ascendente' ? n - 1 : 4 - n
}

/**
 * Las cuatro siluetas del centro de la mesa. `revelados` dice cuántas cartas
 * ya se pusieron; `direction` es null mientras el repartidor no haya elegido
 * por dónde empezar.
 */
export default function Reparto({ mesa, direction, revelados, puedoContar, onContar }) {
  return (
    <div className="conteo">
      {[1, 2, 3, 4].map((n) => {
        const pos = direction ? posicionDeNumero(n, direction) : null
        const puesta = pos !== null && pos < revelados
        const carta = puesta ? mesa[pos] : null

        // Al principio solo valen el 1 y el 4; después, el siguiente de la fila.
        const siguiente = direction
          ? SECUENCIA[direction][revelados] === n
          : n === 1 || n === 4
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
              <Carta carta={carta} className="carta-repartida" />
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
