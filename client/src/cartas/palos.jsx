// Los cuatro palos de la baraja española, dibujados en SVG dentro de una caja
// de 100x100 para poder escalarlos a cualquier tamaño sin que se vean sucios.
// Cada palo tiene su color propio, como en el mazo de verdad.

export const PALOS = {
  oros: {
    nombre: 'Oros',
    color: '#c8871a',
    sombra: '#8a5a0d',
    // Oros no interrumpe el marco: es la pinta de "cero cortes".
    cortes: 0,
  },
  copas: {
    nombre: 'Copas',
    color: '#b8332c',
    sombra: '#7d1f1a',
    cortes: 1,
  },
  espadas: {
    nombre: 'Espadas',
    color: '#2f5d86',
    sombra: '#1c3a55',
    cortes: 2,
  },
  bastos: {
    nombre: 'Bastos',
    color: '#4f7a35',
    sombra: '#33501f',
    cortes: 3,
  },
}

export const ORDEN_PALOS = ['oros', 'copas', 'espadas', 'bastos']

function Oro({ color, sombra }) {
  return (
    <g>
      <circle cx="50" cy="50" r="44" fill={color} stroke={sombra} strokeWidth="3" />
      <circle cx="50" cy="50" r="34" fill="none" stroke={sombra} strokeWidth="2.5" opacity="0.75" />
      <circle cx="50" cy="50" r="27" fill="none" stroke={sombra} strokeWidth="1.5" opacity="0.5" />
      {/* La flor de ocho puntas del centro de la moneda. */}
      <g fill={sombra} opacity="0.9">
        {Array.from({ length: 8 }, (_, i) => (
          <ellipse
            key={i}
            cx="50"
            cy="32"
            rx="4.5"
            ry="12"
            transform={`rotate(${i * 45} 50 50)`}
          />
        ))}
      </g>
      <circle cx="50" cy="50" r="6" fill={color} stroke={sombra} strokeWidth="2" />
      {/* Brillo, para que la moneda no se vea plana. */}
      <ellipse cx="36" cy="30" rx="12" ry="8" fill="#fff" opacity="0.28" transform="rotate(-30 36 30)" />
    </g>
  )
}

function Copa({ color, sombra }) {
  return (
    <g stroke={sombra} strokeWidth="3" strokeLinejoin="round">
      {/* Boca y cuenco. */}
      <path d="M22 16 h56 l-5 26 a23 23 0 0 1 -46 0 z" fill={color} />
      <path d="M22 16 h56" fill="none" strokeWidth="5" strokeLinecap="round" />
      {/* Asas. */}
      <path d="M24 24 q-14 6 -10 20 q3 9 12 8" fill="none" strokeWidth="4" />
      <path d="M76 24 q14 6 10 20 q-3 9 -12 8" fill="none" strokeWidth="4" />
      {/* Pie. */}
      <path d="M46 66 h8 v12 h-8 z" fill={color} />
      <path d="M30 78 h40 l6 8 h-52 z" fill={color} />
      <ellipse cx="50" cy="88" rx="26" ry="5" fill={color} />
      <ellipse cx="50" cy="30" rx="14" ry="6" fill="#fff" opacity="0.25" stroke="none" />
    </g>
  )
}

function Espada({ color, sombra }) {
  return (
    <g stroke={sombra} strokeWidth="2.5" strokeLinejoin="round">
      {/* Hoja, apuntando hacia arriba. */}
      <path d="M50 6 l9 16 v40 h-18 v-40 z" fill="#dfe6ec" />
      <path d="M50 6 v56" stroke={sombra} strokeWidth="1.5" opacity="0.5" />
      {/* Guarda curva. */}
      <path d="M20 64 q30 -10 60 0 q-30 12 -60 0 z" fill={color} />
      {/* Puño y pomo. */}
      <rect x="44" y="70" width="12" height="18" rx="3" fill={color} />
      <circle cx="50" cy="92" r="7" fill={color} />
    </g>
  )
}

function Basto({ color, sombra }) {
  return (
    <g stroke={sombra} strokeWidth="2.5" strokeLinejoin="round">
      {/* Garrote nudoso, más grueso arriba. */}
      <path d="M40 8 q10 -4 20 2 l6 74 q-16 8 -32 0 z" fill={color} />
      {/* Nudos. */}
      <path d="M44 26 q8 5 16 0" fill="none" strokeWidth="3" opacity="0.65" />
      <path d="M45 46 q8 5 16 0" fill="none" strokeWidth="3" opacity="0.65" />
      <path d="M46 66 q8 5 16 0" fill="none" strokeWidth="3" opacity="0.65" />
      {/* Ramas cortadas a los lados. */}
      <path d="M40 22 l-14 -8 6 12 z" fill={color} />
      <path d="M62 40 l16 -6 -8 12 z" fill={color} />
      <path d="M42 60 l-16 -4 8 11 z" fill={color} />
    </g>
  )
}

// Los dibujos crudos, sin <svg> propio, para poder incrustarlos dentro de la
// carta con un transform. `Pinta` es la versión suelta, para la interfaz.
export const DIBUJOS = { oros: Oro, copas: Copa, espadas: Espada, bastos: Basto }

/** La pinta de un palo, escalable. `size` es el lado en píxeles. */
export function Pinta({ palo, size = 24, opacity = 1 }) {
  const Dibujo = DIBUJOS[palo]
  const { color, sombra } = PALOS[palo]
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ display: 'block', opacity }}
      aria-hidden="true"
    >
      <Dibujo color={color} sombra={sombra} />
    </svg>
  )
}
