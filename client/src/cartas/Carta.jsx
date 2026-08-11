import { DIBUJOS, PALOS } from './palos.jsx'
import { FIGURAS } from './figuras.jsx'
import './carta.css'

// Las cartas son la baraja "Naipes Libres" (Basquetteur y Germarquezm,
// CC BY-SA 3.0, Wikimedia Commons), en client/public/cartas/. Ver CREDITOS.md.
//
// Si una imagen falta, la carta se dibuja en SVG en vez de salir rota. El
// dibujo no es tan bonito, pero una carta ilegible arruina la partida y una
// carta rota no se puede ni leer.

const ANCHO = 100
const ALTO = 155
const MARGEN = 7

const rutaDe = (carta) => `/cartas/${carta.suit}-${carta.value}.png`

/** Los cortes del marco: así se reconoce el palo sin ver el centro. */
function segmentos(desde, hasta, cortes, hueco) {
  if (cortes === 0) return [[desde, hasta]]
  const largo = hasta - desde
  const trozo = (largo - cortes * hueco) / (cortes + 1)
  const partes = []
  let cursor = desde
  for (let i = 0; i <= cortes; i += 1) {
    partes.push([cursor, cursor + trozo])
    cursor += trozo + hueco
  }
  return partes
}

function Marco({ palo }) {
  const { color, cortes } = PALOS[palo]
  const x0 = MARGEN
  const x1 = ANCHO - MARGEN
  const y0 = MARGEN
  const y1 = ALTO - MARGEN
  const trazo = { stroke: color, strokeWidth: 2.4, strokeLinecap: 'round' }

  return (
    <g>
      {segmentos(x0, x1, cortes, 13).map(([a, b], i) => (
        <g key={`h${i}`}>
          <line x1={a} y1={y0} x2={b} y2={y0} {...trazo} />
          <line x1={a} y1={y1} x2={b} y2={y1} {...trazo} />
        </g>
      ))}
      {segmentos(y0, y1, cortes, 18).map(([a, b], i) => (
        <g key={`v${i}`}>
          <line x1={x0} y1={a} x2={x0} y2={b} {...trazo} />
          <line x1={x1} y1={a} x2={x1} y2={b} {...trazo} />
        </g>
      ))}
      {[
        [x0, y0, 1, 1],
        [x1, y0, -1, 1],
        [x0, y1, 1, -1],
        [x1, y1, -1, -1],
      ].map(([x, y, sx, sy], i) => (
        <path
          key={`e${i}`}
          d={`M${x + sx * 10} ${y} H${x} V${y + sy * 10}`}
          fill="none"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      ))}
    </g>
  )
}

const DISPOSICION = {
  2: [[50, 48], [50, 107]],
  3: [[50, 44], [50, 77], [50, 111]],
  4: [[34, 53], [66, 53], [34, 102], [66, 102]],
  5: [[34, 49], [66, 49], [50, 77], [34, 106], [66, 106]],
  6: [[34, 46], [66, 46], [34, 77], [66, 77], [34, 108], [66, 108]],
  7: [[34, 44], [66, 44], [34, 72], [66, 72], [34, 100], [66, 100], [50, 122]],
}

function Centro({ palo, valor }) {
  const { color, sombra } = PALOS[palo]
  const Dibujo = DIBUJOS[palo]

  if (valor >= 10) {
    const Figura = FIGURAS[valor]
    return (
      <g transform="translate(0 6)">
        <Figura color={color} sombra={sombra} />
      </g>
    )
  }

  if (valor === 1) {
    return (
      <g transform="translate(21 46) scale(0.58)">
        <Dibujo color={color} sombra={sombra} />
      </g>
    )
  }

  const escala = valor <= 3 ? 0.26 : 0.21
  const radio = 50 * escala
  return (
    <g>
      {DISPOSICION[valor].map(([x, y], i) => (
        <g key={i} transform={`translate(${x - radio} ${y - radio}) scale(${escala})`}>
          <Dibujo color={color} sombra={sombra} />
        </g>
      ))}
    </g>
  )
}

function Esquina({ palo, valor, invertida }) {
  const { color } = PALOS[palo]
  const Dibujo = DIBUJOS[palo]
  return (
    <g transform={invertida ? `rotate(180 ${ANCHO / 2} ${ALTO / 2})` : undefined}>
      <text x="15" y="27" className="carta-indice" fill={color} textAnchor="middle" dominantBaseline="middle">
        {valor}
      </text>
      <g transform="translate(9 31) scale(0.12)">
        <Dibujo color={color} sombra={PALOS[palo].sombra} />
      </g>
    </g>
  )
}

/** El dibujo de respaldo, por si falta la imagen. */
function CartaDibujada({ carta }) {
  const { suit: palo, value: valor } = carta
  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="carta-svg">
      <rect x="0" y="0" width={ANCHO} height={ALTO} rx="8" fill="#f7efdc" />
      <Marco palo={palo} />
      <Centro palo={palo} valor={valor} />
      <Esquina palo={palo} valor={valor} />
      <Esquina palo={palo} valor={valor} invertida />
    </svg>
  )
}

/** El reverso: es lo que se ve en las manos ajenas y en el mazo. */
export function Dorso({ className = '', style }) {
  return (
    <div className={`carta carta-dorso ${className}`} style={style}>
      <img src="/cartas/reverso.png" alt="" className="carta-img" draggable="false" />
    </div>
  )
}

/**
 * Una carta boca arriba.
 * `estado`: 'jugable' (puedes soltarla), 'capturable' (se la llevaría la carta
 * que estás mirando), 'apagada' (no toca), 'cayendo' (te la acaban de caer).
 */
export default function Carta({
  carta,
  estado = '',
  seleccionada = false,
  onClick,
  onPointerEnter,
  onPointerLeave,
  className = '',
  style,
  title,
}) {
  const { suit: palo, value: valor } = carta
  const interactiva = typeof onClick === 'function'
  const Etiqueta = interactiva ? 'button' : 'div'

  return (
    <Etiqueta
      type={interactiva ? 'button' : undefined}
      className={[
        'carta',
        `carta-${palo}`,
        estado && `carta-${estado}`,
        seleccionada && 'carta-seleccionada',
        interactiva && 'carta-interactiva',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      title={title}
      aria-label={`${valor} de ${PALOS[palo].nombre}`}
    >
      <img
        src={rutaDe(carta)}
        alt=""
        className="carta-img"
        draggable="false"
        onError={(e) => {
          // Falta la imagen: se cambia al dibujo y no se vuelve a intentar.
          e.currentTarget.closest('.carta')?.classList.add('carta-sin-imagen')
        }}
      />
      <span className="carta-respaldo" aria-hidden="true">
        <CartaDibujada carta={carta} />
      </span>
    </Etiqueta>
  )
}

export { ANCHO, ALTO }
