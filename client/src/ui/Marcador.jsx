/**
 * Marcador de la partida. Con 4 jugadores va por pareja, no por persona, y
 * las cartas capturadas también: es un solo montón por pareja, así que los
 * dos tienen que poder ver cuántas llevan reunidas.
 */
export default function Marcador({ room, game }) {
  if (!game) return null
  const mano = game.hand

  const equipos = game.teams.map((asientos, i) => ({
    i,
    puntos: game.scores[i],
    nombres: asientos.map((seat) => room.seats[seat]?.name ?? '—'),
    tuyo: i === game.team,
    cartas: mano?.teamCards?.[i] ?? null,
    umbral: mano?.teamThreshold?.[i] ?? null,
  }))

  return (
    <div className="marcador">
      <span className="marcador-meta">a {game.target}</span>
      {equipos.map((equipo) => (
        <div
          key={equipo.i}
          className={`marcador-equipo ${equipo.tuyo ? 'marcador-tuyo' : ''}`}
          style={{ '--barra': `${Math.min(100, (equipo.puntos / game.target) * 100)}%` }}
        >
          <span className="marcador-nombres">{equipo.nombres.join(' y ')}</span>
          <span className="marcador-puntos">{equipo.puntos}</span>
          {equipo.cartas !== null && (
            <span
              className={`marcador-cartas ${equipo.cartas > equipo.umbral ? 'marcador-cartas-arriba' : ''}`}
              title={`Cartas capturadas por la pareja. Lo que pase de ${equipo.umbral} son puntos.`}
            >
              🂠 {equipo.cartas}
              <small>/{equipo.umbral}</small>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
