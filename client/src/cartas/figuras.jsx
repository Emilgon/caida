// Sota (10), caballo (11) y rey (12). Dibujadas a línea, estilo heráldico:
// no intentan imitar la litografía del mazo Fournier, que a este tamaño se
// vería sucia. Buscan leerse de un vistazo en una carta de 90px de alto.

const TINTA = '#2b2018'

/** Marco interior donde va la figura, para que respire igual en las tres. */
function Panel({ children, color }) {
  return (
    <g>
      <rect x="6" y="6" width="88" height="128" rx="6" fill="#fbf4e2" />
      <rect
        x="6"
        y="6"
        width="88"
        height="128"
        rx="6"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        opacity="0.45"
      />
      {children}
    </g>
  )
}

export function Sota({ color, sombra }) {
  return (
    <Panel color={color}>
      <g stroke={TINTA} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        {/* Gorro con pluma. */}
        <path d="M34 40 q16 -13 32 -2 l-2 8 q-14 -6 -28 1 z" fill={color} />
        <path d="M64 38 q12 -12 18 -6 q-6 8 -16 12" fill={sombra} />
        {/* Cara de perfil, mirando a la derecha. */}
        <path d="M38 46 q-3 14 4 20 q7 6 16 3 q7 -3 8 -12 l1 -11 z" fill="#f0d9be" />
        <circle cx="56" cy="54" r="1.9" fill={TINTA} stroke="none" />
        <path d="M64 58 q4 2 1 5" fill="none" strokeWidth="1.8" />
        {/* Melena. */}
        <path d="M38 52 q-6 12 -1 22 q6 -4 8 -14" fill={sombra} />
        {/* Cuerpo y jubón. */}
        <path d="M32 96 q0 -22 18 -26 q18 4 18 26 z" fill={color} />
        <path d="M50 70 l-8 26 h16 z" fill="#fbf4e2" strokeWidth="1.8" />
        {/* Brazo sosteniendo la pinta. */}
        <path d="M32 82 q-8 6 -6 16" fill="none" />
        <path d="M28 118 q22 8 44 0 l-3 12 h-38 z" fill={sombra} />
      </g>
    </Panel>
  )
}

export function Caballo({ color, sombra }) {
  return (
    <Panel color={color}>
      <g stroke={TINTA} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        {/* Cabeza del caballo, de perfil. */}
        <path
          d="M30 108 q-4 -30 10 -46 q8 -9 12 -20 l6 4 l3 -8 q10 8 12 22 q2 14 -4 22 q-6 8 -6 26 z"
          fill="#e8ddc9"
        />
        {/* Orejas. */}
        <path d="M52 42 l-4 -14 l10 8 z" fill="#e8ddc9" />
        <path d="M62 44 l4 -13 l4 12 z" fill="#e8ddc9" />
        {/* Ojo y ollar. */}
        <circle cx="56" cy="58" r="2.2" fill={TINTA} stroke="none" />
        <path d="M36 70 q-3 3 0 5" fill="none" strokeWidth="1.8" />
        {/* Crin. */}
        <path d="M64 46 q12 12 8 34 q-4 12 -10 16" fill={sombra} />
        {/* Brida. */}
        <path d="M33 74 q14 6 26 -2" fill="none" strokeWidth="2.8" stroke={color} />
        <path d="M40 62 q10 5 18 -2" fill="none" strokeWidth="2.2" stroke={color} />
        {/* Pecho y montura. */}
        <path d="M26 122 q24 -12 48 0 l0 8 h-48 z" fill={color} />
      </g>
    </Panel>
  )
}

export function Rey({ color, sombra }) {
  return (
    <Panel color={color}>
      <g stroke={TINTA} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        {/* Corona de tres puntas. */}
        <path d="M28 40 l4 -18 l10 10 l8 -14 l8 14 l10 -10 l4 18 z" fill={color} />
        <path d="M28 40 h44 v6 h-44 z" fill={sombra} />
        <circle cx="32" cy="22" r="2.6" fill={sombra} stroke="none" />
        <circle cx="50" cy="18" r="3" fill={sombra} stroke="none" />
        <circle cx="68" cy="22" r="2.6" fill={sombra} stroke="none" />
        {/* Rostro de frente. */}
        <path d="M36 48 q0 22 14 24 q14 -2 14 -24 z" fill="#f0d9be" />
        <circle cx="44" cy="58" r="2" fill={TINTA} stroke="none" />
        <circle cx="56" cy="58" r="2" fill={TINTA} stroke="none" />
        <path d="M46 66 q4 3 8 0" fill="none" strokeWidth="1.8" />
        {/* Barba. */}
        <path d="M36 60 q-2 22 14 30 q16 -8 14 -30 q-6 16 -14 16 q-8 0 -14 -16 z" fill="#e6e0d4" />
        {/* Manto y cuello. */}
        <path d="M26 120 q4 -26 24 -28 q20 2 24 28 z" fill={color} />
        <path d="M50 92 l-9 28 h18 z" fill={sombra} />
        <path d="M24 120 q26 9 52 0 l0 10 h-52 z" fill={sombra} />
      </g>
    </Panel>
  )
}

export const FIGURAS = { 10: Sota, 11: Caballo, 12: Rey }
export const NOMBRES_FIGURA = { 10: 'Sota', 11: 'Caballo', 12: 'Rey' }
