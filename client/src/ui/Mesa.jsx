import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Carta, { Dorso } from '../cartas/Carta.jsx'
import Jugador from './Jugador.jsx'
import Marcador from './Marcador.jsx'
import { alternarSilencio, estaEnSilencio, sonido } from '../sonido.js'
import { describir, nombreCanto, sonar } from './narracion.js'
import './mesa.css'

// Dónde se sienta cada quien en pantalla, según cuántos sean y a qué
// distancia estén de ti. El turno corre hacia la derecha, así que el que
// juega después de ti va a tu derecha.
const POSICIONES = {
  2: ['yo', 'arriba'],
  3: ['yo', 'derecha', 'izquierda'],
  4: ['yo', 'derecha', 'arriba', 'izquierda'],
}

function ModalReparto({ game, onRepartir }) {
  const [primero, setPrimero] = useState('manos')
  const [sentido, setSentido] = useState('ascendente')

  return (
    <div className="panel panel-reparto">
      <h3>Te toca repartir</h3>
      <label className="campo">
        ¿Qué repartes primero?
        <div className="opciones">
          {[
            ['manos', 'Las manos'],
            ['mesa', 'La mesa'],
          ].map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              className="opcion"
              aria-pressed={primero === valor}
              onClick={() => setPrimero(valor)}
            >
              {texto}
            </button>
          ))}
        </div>
      </label>
      <label className="campo">
        ¿Cómo cuentas la mesa?
        <div className="opciones">
          {[
            ['ascendente', '1 · 2 · 3 · 4'],
            ['descendente', '4 · 3 · 2 · 1'],
          ].map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              className="opcion"
              aria-pressed={sentido === valor}
              onClick={() => setSentido(valor)}
            >
              {texto}
            </button>
          ))}
        </div>
      </label>
      <p className="panel-pista">
        Si una carta de la mesa coincide con el número que cantas, esos puntos son tuyos.
      </p>
      <button
        type="button"
        className="boton"
        onClick={() =>
          onRepartir(
            game.legalMoves.find(
              (move) => move.first === primero && move.direction === sentido,
            ),
          )
        }
      >
        Barajar y repartir
      </button>
    </div>
  )
}

function ResumenMano({ resumen, room, game }) {
  return (
    <div className="panel panel-resumen">
      <h3>Mano {resumen.number}</h3>
      <ul className="resumen-lista">
        {resumen.cards.map((linea) => (
          <li key={linea.team}>
            <span>{game.teams[linea.team].map((s) => room.seats[s]?.name).join(' y ')}</span>
            <span className="resumen-detalle">
              {linea.cards} cartas contra {linea.threshold}
              {linea.points > 0 && <strong> +{linea.points}</strong>}
            </span>
          </li>
        ))}
      </ul>
      {resumen.cantos.length > 0 && (
        <div className="resumen-cantos">
          {resumen.cantos.map((canto) => (
            <span key={canto.id} className={`canto-chip ${canto.killed ? 'canto-muerto' : ''}`}>
              {room.seats[canto.seat]?.name}: {nombreCanto(canto.type)} {canto.points}
              {canto.killed && ' (matado)'}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Mesa({ room, game, acciones, onSalir }) {
  const [resaltadas, setResaltadas] = useState([])
  const [pendiente, setPendiente] = useState(null) // carta elegida que puede cantar
  const [avisos, setAvisos] = useState([])
  const [error, setError] = useState(null)
  const [silencio, setSilencio] = useState(estaEnSilencio)
  const vistos = useRef(null)
  const eraMiTurno = useRef(false)

  const nombre = useCallback((seat) => room.seats[seat]?.name ?? `Asiento ${seat + 1}`, [room])
  const miTurno = game?.legalMoves?.length > 0 && game.phase === 'juego'
  const mano = game?.hand
  const cantos = mano?.cantos ?? []

  // --- Narración: convierte los eventos nuevos en avisos y sonidos ---------
  useEffect(() => {
    if (!game) return
    if (vistos.current === null) {
      // Primera carga (o reconexión): no narramos lo que ya pasó.
      vistos.current = game.eventCount
      return
    }
    const nuevos = game.eventCount - vistos.current
    if (nuevos <= 0) {
      vistos.current = game.eventCount
      return
    }
    vistos.current = game.eventCount

    const recientes = game.events.slice(Math.max(0, game.events.length - nuevos))
    const frescos = []
    for (const evento of recientes) {
      sonar(evento, game.seat, game.team)
      const aviso = describir(evento, nombre)
      if (aviso) frescos.push({ ...aviso, id: `${game.eventCount}-${frescos.length}` })
    }
    if (frescos.length > 0) {
      setAvisos((previos) => [...previos, ...frescos].slice(-4))
      const quitar = setTimeout(() => {
        setAvisos((previos) => previos.filter((a) => !frescos.some((f) => f.id === a.id)))
      }, 3400)
      return () => clearTimeout(quitar)
    }
  }, [game, nombre])

  // --- Alarma de turno -----------------------------------------------------
  useEffect(() => {
    if (miTurno && !eraMiTurno.current) sonido.turno()
    eraMiTurno.current = miTurno
  }, [miTurno])

  // Al cambiar el turno se limpia lo que estuvieras a punto de jugar.
  useEffect(() => {
    setPendiente(null)
    setResaltadas([])
  }, [mano?.turn, game?.phase])

  const jugadaDe = useCallback(
    (cartaId) => game?.legalMoves?.find((move) => move.card === cartaId),
    [game],
  )

  async function jugar(move, cantar) {
    setPendiente(null)
    setResaltadas([])
    const r = await acciones.jugar({ type: move.type, card: move.card, cantar })
    if (!r.ok) {
      sonido.error()
      setError(r.error.message)
      setTimeout(() => setError(null), 3000)
    }
  }

  // Repartir viaja por el mismo evento que jugar una carta: para el servidor
  // es una jugada más, y así se valida contra legalMoves igual que el resto.
  async function repartir(move) {
    if (!move) return
    const r = await acciones.jugar(move)
    if (!r.ok) {
      sonido.error()
      setError(r.error.message)
    }
  }

  const asientos = useMemo(() => {
    const total = room.config.players
    const yo = game?.seat ?? room.yourSeat ?? 0
    return room.seats.map((puesto) => ({
      puesto,
      posicion: POSICIONES[total][(puesto.seat - yo + total) % total],
    }))
  }, [room, game])

  const turnoDe = game?.phase === 'reparto' ? game.dealer : mano?.turn

  if (!game) {
    return (
      <div className="mesa-cargando">
        <Dorso />
        <p>Preparando la mesa…</p>
      </div>
    )
  }

  const terminada = game.winner !== null
  const gane = terminada && game.winner === game.team

  return (
    <div className={`mesa mesa-${room.config.players}`}>
      <div className="mesa-barra">
        <span className="mesa-codigo">{room.code}</span>
        <Marcador room={room} game={game} />
        <div className="mesa-barra-botones">
          <button
            type="button"
            className="boton boton-chico boton-fantasma"
            onClick={() => setSilencio(alternarSilencio())}
            title={silencio ? 'Activar sonido' : 'Silenciar'}
          >
            {silencio ? '🔇' : '🔊'}
          </button>
          <button type="button" className="boton boton-chico boton-fantasma" onClick={onSalir}>
            Salir
          </button>
        </div>
      </div>

      <div className="mesa-pano">
        {asientos
          .filter(({ posicion }) => posicion !== 'yo')
          .map(({ puesto, posicion }) => (
            <Jugador
              key={puesto.seat}
              puesto={puesto}
              game={game}
              posicion={posicion}
              esTurno={turnoDe === puesto.seat && !room.paused}
              esRepartidor={game.dealer === puesto.seat}
              cantos={cantos}
            />
          ))}

        <div className="mesa-centro">
          {mano && (
            <>
              <div className="mesa-mazo" title={`${mano.deckLeft} cartas por repartir`}>
                {mano.deckLeft > 0 && (
                  <>
                    <Dorso className="mesa-mazo-carta" style={{ '--i': 0 }} />
                    <Dorso className="mesa-mazo-carta" style={{ '--i': 1 }} />
                    <Dorso className="mesa-mazo-carta" style={{ '--i': 2 }} />
                  </>
                )}
                <span className="mesa-mazo-cuenta">{mano.deckLeft}</span>
              </div>

              <div className="mesa-cartas">
                {mano.table.length === 0 && <span className="mesa-vacia">Mesa limpia</span>}
                {mano.table.map((carta) => (
                  <Carta
                    key={carta.id}
                    carta={carta}
                    estado={resaltadas.includes(carta.id) ? 'capturable' : ''}
                    className={mano.lastPlayed?.id === carta.id ? 'carta-recien-jugada' : ''}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mesa-avisos">
          {avisos.map((aviso) => (
            <div key={aviso.id} className={`aviso aviso-${aviso.tono}`}>
              {aviso.texto}
            </div>
          ))}
        </div>

        {room.paused && (
          <div className="mesa-pausa">
            <p>Esperando a {room.waitingFor.join(', ')}…</p>
            {room.canVoteCancel && (
              <button type="button" className="boton boton-peligro boton-chico" onClick={acciones.cancelar}>
                Cancelar la mesa ({room.cancelVotes} voto{room.cancelVotes === 1 ? '' : 's'})
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mesa-abajo">
        {asientos
          .filter(({ posicion }) => posicion === 'yo')
          .map(({ puesto }) => (
            <Jugador
              key={puesto.seat}
              puesto={puesto}
              game={game}
              posicion="yo"
              esTurno={miTurno}
              esRepartidor={game.dealer === puesto.seat}
              cantos={cantos}
            />
          ))}

        <div className={`mi-mano ${miTurno ? 'mi-mano-activa' : ''}`}>
          {(mano?.myCards ?? []).map((carta) => {
            const move = jugadaDe(carta.id)
            const jugable = Boolean(move) && !room.paused
            return (
              <Carta
                key={carta.id}
                carta={carta}
                estado={jugable ? 'jugable' : 'apagada'}
                seleccionada={pendiente?.card === carta.id}
                onClick={
                  jugable
                    ? () => (move.canDeclare ? setPendiente(move) : jugar(move, false))
                    : undefined
                }
                onPointerEnter={() => move && setResaltadas(move.captures)}
                onPointerLeave={() => setResaltadas([])}
                title={
                  move
                    ? [
                        move.caida ? `Caída (+${move.points})` : null,
                        move.mesaLimpia ? 'Deja la mesa limpia' : null,
                        move.captures.length ? `Se lleva ${move.captures.length + 1} cartas` : 'La lanzas a la mesa',
                        move.killsCanto ? 'Le mata el canto' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'No es tu turno'
                }
              />
            )
          })}
        </div>

        {mano?.myCanto && mano.myCantoPlayable && (
          <p className="mi-canto">
            Tienes <strong>{nombreCanto(mano.myCanto.type)}</strong> ({mano.myCanto.points} pts).
            Se canta al jugar una de esas cartas.
          </p>
        )}
      </div>

      {/* --- Capas por encima de la mesa ------------------------------------ */}

      {pendiente && (
        <div className="capa" onClick={() => setPendiente(null)}>
          <div className="panel panel-canto" onClick={(e) => e.stopPropagation()}>
            <h3>¿Cantas {nombreCanto(pendiente.canto.type)}?</h3>
            <p className="panel-pista">
              Son {pendiente.canto.points} puntos.
              {pendiente.captures.length === 0
                ? ' Ojo: el de tu derecha puede matártelo si le cae a esa carta.'
                : ' Cantas capturando, así que nadie te lo puede matar.'}
            </p>
            <div className="panel-botones">
              <button type="button" className="boton" onClick={() => jugar(pendiente, true)}>
                ¡Cantar {nombreCanto(pendiente.canto.type)}!
              </button>
              <button
                type="button"
                className="boton boton-fantasma"
                onClick={() => jugar(pendiente, false)}
              >
                Jugar callado
              </button>
            </div>
          </div>
        </div>
      )}

      {!terminada && game.phase === 'reparto' && (
        <div className="capa capa-quieta">
          <div className="panel-pila">
            {game.lastHand && <ResumenMano resumen={game.lastHand} room={room} game={game} />}
            {game.legalMoves.length > 0 ? (
              <ModalReparto game={game} onRepartir={repartir} />
            ) : (
              <div className="panel">
                <h3>Reparte {nombre(game.dealer)}</h3>
                <p className="panel-pista">Está eligiendo cómo echar las cartas…</p>
              </div>
            )}
          </div>
        </div>
      )}

      {terminada && (
        <div className="capa capa-quieta">
          <div className="panel panel-fin">
            <h3>{gane ? '¡Ganaste!' : 'Perdiste'}</h3>
            <p className="panel-marcador">{game.scores.join(' — ')}</p>
            <p className="panel-pista">
              {game.teams[game.winner].map(nombre).join(' y ')} llega a {game.target}.
            </p>
            <div className="panel-botones">
              {room.youAreHost && (
                <button type="button" className="boton" onClick={acciones.revancha}>
                  Revancha
                </button>
              )}
              <button type="button" className="boton boton-fantasma" onClick={onSalir}>
                Volver al menú
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="mesa-error aviso-error">{error}</div>}
    </div>
  )
}
