/** Marcador de la partida. Con 4 jugadores marca por pareja, no por persona. */
export default function Marcador({ room, game }) {
  if (!game) return null
  const equipos = game.teams.map((asientos, i) => ({
    i,
    puntos: game.scores[i],
    nombres: asientos.map((seat) => room.seats[seat]?.name ?? '—'),
    tuyo: i === game.team,
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
        </div>
      ))}
    </div>
  )
}
