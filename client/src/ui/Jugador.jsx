import { Dorso } from '../cartas/Carta.jsx'

/**
 * El banner de un jugador: quién es, cuántas cartas le quedan en la mano,
 * cuántas lleva capturadas y si le toca. También muestra su canto declarado,
 * que es información pública: se canta en voz alta.
 */
export default function Jugador({ puesto, game, posicion, esTurno, esRepartidor, cantos }) {
  if (!puesto || puesto.empty) return null
  const { seat, name, bot, connected, you } = puesto
  const enMano = game?.hand?.cardsLeft?.[seat] ?? 0
  const capturadas = game?.hand?.capturedCount?.[seat] ?? 0
  const mios = cantos.filter((canto) => canto.seat === seat)

  return (
    <div
      className={[
        'jugador',
        `jugador-${posicion}`,
        esTurno && 'jugador-turno',
        !connected && 'jugador-caido',
        you && 'jugador-tuyo',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="jugador-ficha">
        <span className="jugador-inicial" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        {esRepartidor && (
          <span className="jugador-reparte" title="Reparte esta mano">
            R
          </span>
        )}
      </div>

      <div className="jugador-datos">
        <span className="jugador-nombre">
          {name}
          {bot && <span className="etiqueta etiqueta-bot">Bot</span>}
        </span>
        <span className="jugador-cuentas">
          <span title="Cartas en la mano">✋ {enMano}</span>
          <span title="Cartas capturadas">🂠 {capturadas}</span>
        </span>
        {!connected && <span className="jugador-aviso">Sin conexión…</span>}
        {mios.length > 0 && (
          <span className="jugador-cantos">
            {mios.map((canto) => (
              <span key={canto.id} className={`canto-chip ${canto.killed ? 'canto-muerto' : ''}`}>
                {canto.type} {canto.points}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* El abanico de dorsos: se ve cuántas cartas tiene, nunca cuáles. */}
      {posicion !== 'yo' && enMano > 0 && (
        <div className="jugador-mano" aria-hidden="true">
          {Array.from({ length: enMano }, (_, i) => (
            <Dorso key={i} className="jugador-dorso" style={{ '--i': i }} />
          ))}
        </div>
      )}
    </div>
  )
}
