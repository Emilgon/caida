import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, MotionConfig } from 'motion/react'

import Carta, { Dorso, VUELO } from '../cartas/Carta.jsx'
import Jugador from './Jugador.jsx'
import Marcador from './Marcador.jsx'
import Reparto, { SECUENCIA } from './Reparto.jsx'
import { alternarSilencio, estaEnSilencio, sonido } from '../sonido.js'
import { burbujaDe, burbujaVictima, lineaDe, nombreCanto, sonar } from './narracion.js'
import './mesa.css'

// Dónde se sienta cada quien en pantalla. El turno corre hacia la derecha, así
// que el que juega después de ti va a tu derecha.
const POSICIONES = {
  2: ['yo', 'arriba'],
  3: ['yo', 'derecha', 'izquierda'],
  4: ['yo', 'derecha', 'arriba', 'izquierda'],
}

// Hacia dónde salen volando las cartas capturadas, según dónde esté sentado
// quien capturó. En píxeles, relativo al centro de la mesa.
const RUMBO = {
  yo: { x: 0, y: 340 },
  arriba: { x: 0, y: -300 },
  izquierda: { x: -560, y: -40 },
  derecha: { x: 560, y: -40 },
}

// Cuánto se queda en pantalla lo que acaba de pasar. Va con el ritmo de los
// bots (2,5 s) para que dé tiempo a leerlo y no se amontone.
const DURACION_BURBUJA = 2600
const DURACION_LINEA = 3200

export default function Mesa({ room, game, acciones, onSalir }) {
  const [resaltadas, setResaltadas] = useState([])
  const [burbujas, setBurbujas] = useState({}) // asiento -> aviso
  const [linea, setLinea] = useState(null)
  const [rumbo, setRumbo] = useState(RUMBO.arriba) // hacia dónde salen las capturadas
  const [golpe, setGolpe] = useState(null) // 'caida' | 'mesa'
  const [error, setError] = useState(null)
  const [silencio, setSilencio] = useState(estaEnSilencio)

  // Estado del reparto a mano: primero se decide el orden, luego se cuenta.
  const [reparto, setReparto] = useState({ first: null, direction: null, revelados: 0 })

  const vistos = useRef(null)
  const eraMiTurno = useRef(false)
  const relojes = useRef([])

  const nombre = useCallback((seat) => room.seats[seat]?.name ?? `Asiento ${seat + 1}`, [room])
  const mano = game?.hand
  const cantos = mano?.cantos ?? []
  const miTurno = game?.legalMoves?.length > 0 && game.phase === 'juego'
  const soyRepartidor = game?.phase === 'reparto' && game.legalMoves.length > 0

  const posicionDe = useCallback(
    (seat) => {
      const total = room.config.players
      const yo = game?.seat ?? room.yourSeat ?? 0
      return POSICIONES[total][(seat - yo + total) % total]
    },
    [room, game],
  )

  // Los temporizadores se limpian al desmontar: si no, un aviso se queda
  // pegado cuando cambias de pantalla a mitad de una animación.
  useEffect(() => () => relojes.current.forEach(clearTimeout), [])
  const enUnRato = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms)
    relojes.current.push(id)
    return id
  }, [])

  // --- Narración: eventos nuevos -> burbujas, sonido y animaciones ---------
  useEffect(() => {
    if (!game) return
    if (vistos.current === null) {
      vistos.current = game.eventCount // primera carga: no narramos el pasado
      return
    }
    const nuevos = game.eventCount - vistos.current
    vistos.current = game.eventCount
    if (nuevos <= 0) return

    const recientes = game.events.slice(Math.max(0, game.events.length - nuevos))
    const frescas = {}
    let ultimaLinea = null

    for (const evento of recientes) {
      sonar(evento, game.team)

      for (const burbuja of [burbujaDe(evento), burbujaVictima(evento)]) {
        if (burbuja) frescas[burbuja.seat] = { ...burbuja, id: `${game.eventCount}-${burbuja.seat}` }
      }
      const texto = lineaDe(evento)
      if (texto) ultimaLinea = texto

      // Quien capturó decide hacia dónde salen volando las cartas: Motion las
      // saca de la mesa en esa dirección al desmontarlas.
      if (evento.type === 'caida' || evento.type === 'recoger') {
        setRumbo(RUMBO[posicionDe(evento.seat)] ?? RUMBO.arriba)
        setGolpe(evento.type === 'caida' ? 'caida' : evento.mesaLimpia ? 'mesa' : null)
        enUnRato(() => setGolpe(null), 800)
      }

      // Reparto nuevo: si no soy yo quien cuenta, las cartas van saliendo solas.
      if (evento.type === 'reparto') {
        setReparto((previo) => ({ ...previo, direction: evento.direction, revelados: previo.revelados }))
      }
    }

    if (Object.keys(frescas).length > 0) {
      setBurbujas((previas) => ({ ...previas, ...frescas }))
      enUnRato(() => {
        setBurbujas((previas) => {
          const copia = { ...previas }
          for (const [seat, aviso] of Object.entries(frescas)) {
            if (copia[seat]?.id === aviso.id) delete copia[seat]
          }
          return copia
        })
      }, DURACION_BURBUJA)
    }
    if (ultimaLinea) {
      setLinea(ultimaLinea)
      enUnRato(() => setLinea((actual) => (actual === ultimaLinea ? null : actual)), DURACION_LINEA)
    }
  }, [game, enUnRato, posicionDe])

  // --- Alarma de turno -----------------------------------------------------
  useEffect(() => {
    if (miTurno && !eraMiTurno.current) sonido.turno()
    eraMiTurno.current = miTurno
  }, [miTurno])

  useEffect(() => {
    setResaltadas([])
  }, [mano?.turn, game?.phase])

  // --- Reparto: al empezar una mano nueva se reinicia el conteo ------------
  useEffect(() => {
    if (game?.phase === 'reparto') setReparto({ first: null, direction: null, revelados: 0 })
  }, [game?.phase, game?.handNumber])

  // Quien no reparte ve salir las cartas solas, una tras otra.
  useEffect(() => {
    if (!mano || reparto.first !== null) return // el que cuenta va a su ritmo
    if (mano.lastPlayed !== null || mano.lastCapturer !== null) return
    if (reparto.revelados >= 4) return
    const id = enUnRato(() => setReparto((p) => ({ ...p, revelados: Math.min(4, p.revelados + 1) })), 700)
    return () => clearTimeout(id)
  }, [mano, reparto.first, reparto.revelados, enUnRato])

  // El conteo solo vive en el hueco entre repartir y la primera jugada: en
  // cuanto alguien juega, las posiciones de la mesa ya no son las del reparto
  // y el filtro de revelado escondería cartas en juego.
  const reciénRepartida =
    Boolean(mano) && mano.lastPlayed === null && mano.lastCapturer === null && mano.table.length === 4
  const contando = reciénRepartida && reparto.revelados < 4

  // Quien reparte es el único que pone `first`, y sigue contando aunque la
  // partida ya haya pasado a fase de juego.
  const yoCuento = reparto.first !== null

  const jugadaDe = useCallback(
    (cartaId) => game?.legalMoves?.find((move) => move.card === cartaId),
    [game],
  )

  async function pedir(move) {
    const r = await acciones.jugar(move)
    if (!r.ok) {
      sonido.error()
      setError(r.error.message)
      enUnRato(() => setError(null), 3200)
    }
    return r
  }

  async function jugarCarta(move) {
    setResaltadas([])
    await pedir({ type: 'jugar', card: move.card })
  }

  /** El repartidor pone la carta número `n` sobre la mesa. */
  async function contar(n) {
    if (reparto.direction === null) {
      const direction = n === 1 ? 'ascendente' : 'descendente'
      setReparto((p) => ({ ...p, direction, revelados: 1 }))
      sonido.carta()
      const r = await pedir({ type: 'repartir', first: reparto.first, direction })
      if (!r.ok) setReparto((p) => ({ ...p, direction: null, revelados: 0 }))
      return
    }
    sonido.carta()
    const puestas = Math.min(4, reparto.revelados + 1)
    setReparto((p) => ({ ...p, revelados: puestas }))
    // Con las cuatro en la mesa se avisa al servidor y ahí empieza el juego.
    if (puestas === 4) await acciones.contado()
  }

  const asientos = useMemo(
    () => room.seats.map((puesto) => ({ puesto, posicion: posicionDe(puesto.seat) })),
    [room, posicionDe],
  )

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
  const turnoDe = game.phase === 'reparto' ? game.dealer : mano?.turn
  const visiblesEnMesa = contando
    ? mano.table.filter((_, pos) => pos < reparto.revelados)
    : (mano?.table ?? [])

  return (
    // LayoutGroup es lo que hace que una carta se reconozca a sí misma entre
    // tu mano y la mesa: sin él Motion no sabría que son la misma y volvería
    // a lo de antes, desaparecer aquí y aparecer allá.
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
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

      <div className={`mesa-pano ${golpe ? `mesa-golpe-${golpe}` : ''}`}>
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
              aviso={burbujas[puesto.seat]}
            />
          ))}

        <div className="mesa-centro">
          <div className="mesa-mazo" title={`${mano?.deckLeft ?? 40} cartas por repartir`}>
            {(mano?.deckLeft ?? 40) > 0 && (
              <>
                <Dorso className="mesa-mazo-carta" style={{ '--i': 0 }} />
                <Dorso className="mesa-mazo-carta" style={{ '--i': 1 }} />
                <Dorso className="mesa-mazo-carta" style={{ '--i': 2 }} />
              </>
            )}
            <span className="mesa-mazo-cuenta">{mano?.deckLeft ?? 40}</span>
          </div>

          <div className="mesa-tapete">
            {/* Contando la mesa: siluetas numeradas en vez de las cartas. */}
            {yoCuento && (game.phase === 'reparto' || contando) ? (
              <Reparto
                mesa={mano?.table ?? []}
                direction={reparto.direction}
                revelados={reparto.revelados}
                puedoContar
                onContar={contar}
              />
            ) : (
              <div className="mesa-cartas">
                {visiblesEnMesa.length === 0 && game.phase === 'juego' && (
                  <span className="mesa-vacia">Mesa limpia</span>
                )}
                {/* AnimatePresence deja que una carta se vaya volando en vez
                    de desaparecer de golpe al capturarla. */}
                <AnimatePresence mode="popLayout">
                  {visiblesEnMesa.map((carta) => (
                    <Carta
                      key={carta.id}
                      carta={carta}
                      vuela
                      estado={resaltadas.includes(carta.id) ? 'capturable' : ''}
                      className={mano?.lastPlayed?.id === carta.id ? 'carta-cayendo' : ''}
                      exit={{ ...rumbo, scale: 0.5, opacity: 0, rotate: 14 }}
                      transition={VUELO}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {linea && <div className="mesa-linea">{linea}</div>}

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
              aviso={burbujas[puesto.seat]}
            />
          ))}

        {mano?.myCanto && (
          <p className={`mi-canto ${mano.myCantoDeclared ? 'mi-canto-hecho' : ''}`}>
            {mano.myCantoDeclared ? (
              <>Cantaste <strong>{nombreCanto(mano.myCanto.type)}</strong> ({mano.myCanto.points} pts)</>
            ) : (
              <>
                Tienes <strong>{nombreCanto(mano.myCanto.type)}</strong> ({mano.myCanto.points} pts).
                {mano.myCantoPlayable
                  ? ' Se canta solo al jugar una de las cartas marcadas.'
                  : ' Ya no te quedan cartas para cantarlo.'}
              </>
            )}
          </p>
        )}

        <div className={`mi-mano ${miTurno ? 'mi-mano-activa' : ''}`}>
          {(mano?.myCards ?? []).map((carta) => {
            const move = jugadaDe(carta.id)
            const jugable = Boolean(move) && !room.paused
            const esDelCanto =
              mano.myCanto && !mano.myCantoDeclared && mano.myCanto.cards.includes(carta.id)
            return (
              <Carta
                key={carta.id}
                carta={carta}
                vuela
                estado={jugable ? 'jugable' : 'apagada'}
                className={esDelCanto ? 'carta-del-canto' : ''}
                onClick={jugable ? () => jugarCarta(move) : undefined}
                onPointerEnter={() => move && setResaltadas(move.captures)}
                onPointerLeave={() => setResaltadas([])}
                title={
                  move
                    ? [
                        move.caida ? `¡Caída! +${move.points}` : null,
                        move.mesaLimpia ? 'Deja la mesa limpia' : null,
                        move.captures.length
                          ? `Se lleva ${move.captures.length + 1} cartas`
                          : 'La lanzas a la mesa',
                        move.canDeclare ? `Cantas ${nombreCanto(move.canto.type)}` : null,
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
      </div>

      {/* --- Capas por encima de la mesa ------------------------------------ */}

      {!terminada && game.phase === 'reparto' && soyRepartidor && reparto.first === null && (
        <div className="capa capa-quieta">
          <div className="panel-pila">
            {game.lastHand && <ResumenMano resumen={game.lastHand} room={room} game={game} />}
            <div className="panel">
              <h3>Te toca repartir</h3>
              <p className="panel-pista">
                ¿Reparto primero a los jugadores, o empiezo poniendo las cartas de la mesa?
              </p>
              <div className="panel-botones">
                <button
                  type="button"
                  className="boton"
                  onClick={() => setReparto((p) => ({ ...p, first: 'manos' }))}
                >
                  A los jugadores primero
                </button>
                <button
                  type="button"
                  className="boton boton-fantasma"
                  onClick={() => setReparto((p) => ({ ...p, first: 'mesa' }))}
                >
                  La mesa primero
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!terminada && game.phase === 'reparto' && !soyRepartidor && (
        <div className="capa capa-quieta">
          <div className="panel-pila">
            {game.lastHand && <ResumenMano resumen={game.lastHand} room={room} game={game} />}
            <div className="panel">
              <h3>Reparte {nombre(game.dealer)}</h3>
              <p className="panel-pista">Está barajando y decidiendo cómo echar las cartas…</p>
            </div>
          </div>
        </div>
      )}

      {/* Instrucción del conteo, pegada abajo para no tapar la mesa. */}
      {yoCuento && reparto.direction === null && (
        <div className="mesa-instruccion">
          Toca el <strong>1</strong> para contar hacia arriba, o el <strong>4</strong> para contar
          hacia abajo
        </div>
      )}
      {yoCuento && contando && reparto.direction !== null && (
        <div className="mesa-instruccion">
          Sigue contando: toca el <strong>{SECUENCIA[reparto.direction][reparto.revelados]}</strong>
        </div>
      )}
      {!yoCuento && room.contando && (
        <div className="mesa-instruccion">
          {nombre(room.contando.seat)} está poniendo la mesa…
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
      </LayoutGroup>
    </MotionConfig>
  )
}

function ResumenMano({ resumen, room, game }) {
  return (
    <div className="panel panel-resumen">
      <h3>Cerró la mano {resumen.number}</h3>
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
