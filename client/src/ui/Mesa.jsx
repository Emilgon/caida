import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react'

import Carta, { Dorso, RETIRADA, VUELO } from '../cartas/Carta.jsx'
import Jugador from './Jugador.jsx'
import Marcador from './Marcador.jsx'
import Reparto, { SECUENCIA } from './Reparto.jsx'
import { alternarSilencio, estaEnSilencio, sonido } from '../sonido.js'
import {
  burbujaDe,
  burbujaVictima,
  cartaDeId,
  cartelDe,
  lineaDe,
  nombreCanto,
  sonar,
} from './narracion.js'
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
  const [ordenSalida, setOrdenSalida] = useState({}) // id -> turno de salida
  const [golpe, setGolpe] = useState(null) // 'caida' | 'mesa'
  const [caida, setCaida] = useState(null) // el cartelón de la caída
  const [cartel, setCartel] = useState(null) // "Ronda 2", fin de mano…
  const [error, setError] = useState(null)
  const [silencio, setSilencio] = useState(estaEnSilencio)


  const vistos = useRef(null)
  const eraMiTurno = useRef(false)
  const relojes = useRef([])

  const nombre = useCallback((seat) => room.seats[seat]?.name ?? `Asiento ${seat + 1}`, [room])
  const mano = game?.hand
  const cantos = mano?.cantos ?? []
  const miTurno = game?.legalMoves?.length > 0 && game.phase === 'juego'
  const soyRepartidor = game?.phase === "reparto" && game.legalMoves.length > 0
  // Contando la mesa: solo el repartidor tiene jugadas, y son numeros.
  const yoCuento = game?.phase === "contando" && game.legalMoves.length > 0
  const contando = game?.phase === "contando"

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

      // Quien capturó decide hacia dónde salen volando las cartas, y en qué
      // orden: la que jugó pasa por encima de cada una, y se las va llevando
      // de una en una, no todas de golpe.
      if (evento.type === 'caida' || evento.type === 'recoger') {
        setRumbo(RUMBO[posicionDe(evento.seat)] ?? RUMBO.arriba)
        setOrdenSalida(Object.fromEntries(evento.taken.map((id, i) => [id, i])))
        enUnRato(() => setOrdenSalida({}), 1600)

        if (evento.type === 'caida') {
          // El cartel de la caída: qué carta le cayó a cuál, en el centro.
          setCaida({
            id: `${game.eventCount}`,
            quien: nombre(evento.seat),
            aQuien: evento.sobre === undefined ? null : nombre(evento.sobre),
            carta: cartaDeId(evento.card),
            victima: evento.taken[0] ? cartaDeId(evento.taken[0]) : null,
            puntos: evento.points,
            mesa: evento.mesaLimpia,
          })
          enUnRato(() => setCaida(null), 2400)
        }
        setGolpe(evento.type === 'caida' ? 'caida' : evento.mesaLimpia ? 'mesa' : null)
        enUnRato(() => setGolpe(null), 1400)
      }

      const cartel = cartelDe(evento)
      if (cartel) {
        setCartel({ ...cartel, id: `${game.eventCount}` })
        enUnRato(() => setCartel(null), 2000)
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
  }, [game, enUnRato, posicionDe, nombre])

  // --- Alarma de turno -----------------------------------------------------
  useEffect(() => {
    if (miTurno && !eraMiTurno.current) sonido.turno()
    eraMiTurno.current = miTurno
  }, [miTurno])

  useEffect(() => {
    setResaltadas([])
  }, [mano?.turn, game?.phase])


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

  /** El repartidor pone la carta numero `n` cantandola. Cada una es una
   *  jugada de verdad contra el servidor, no un revelado del cliente. */
  async function contar(numero) {
    sonido.carta()
    await pedir({ type: "contar", numero })
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
  // El servidor ya manda solo las cartas cantadas mientras se cuenta.
  const visiblesEnMesa = mano?.table ?? []

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
            {contando ? (
              <Reparto
                mesa={mano?.table ?? []}
                direction={mano?.direction ?? null}
                contadas={mano?.contadas ?? 0}
                puedoContar={yoCuento}
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
                      exit={{
                        ...rumbo,
                        scale: 0.45,
                        opacity: 0,
                        rotate: 14,
                        // Se van de una en una, en el orden en que se
                        // arrastran: primero la del valor jugado, luego la
                        // siguiente de la escalera, y así.
                        transition: { ...RETIRADA, delay: (ordenSalida[carta.id] ?? 0) * 0.22 },
                      }}
                      transition={VUELO}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {linea && <div className="mesa-linea">{linea}</div>}

        {/* El cartelón de la caída: quién le cayó, con qué, y a qué carta. */}
        <AnimatePresence>
          {caida && (
            <motion.div
              key={caida.id}
              className="caidazo"
              initial={{ opacity: 0, scale: 0.6, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.25 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            >
              <span className="caidazo-titulo">
                {caida.mesa ? '¡CAÍDA CON MESA!' : '¡CAÍDA!'}
              </span>
              <div className="caidazo-cartas">
                {caida.victima && <Carta carta={caida.victima} className="caidazo-victima" />}
                <Carta carta={caida.carta} className="caidazo-verdugo" />
              </div>
              <span className="caidazo-pie">
                {caida.quien} · +{caida.puntos}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ronda nueva, fin de mano: lo que corta el ritmo va en grande. */}
        <AnimatePresence>
          {cartel && (
            <motion.div
              key={cartel.id}
              className={`cartel cartel-${cartel.tono}`}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            >
              {cartel.texto}
            </motion.div>
          )}
        </AnimatePresence>

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

      {!terminada && soyRepartidor && (
        <div className="capa capa-quieta">
          <div className="panel-pila">
            {game.lastHand && <ResumenMano resumen={game.lastHand} room={room} game={game} />}
            <div className="panel">
              <h3>Te toca repartir</h3>
              <p className="panel-pista">
                ¿Reparto primero a los jugadores, o empiezo poniendo las cartas de la mesa? En
                cualquier caso, las cartas se echan ya: después las cuentas tú.
              </p>
              <div className="panel-botones">
                <button
                  type="button"
                  className="boton"
                  onClick={() => pedir({ type: 'repartir', first: 'manos' })}
                >
                  A los jugadores primero
                </button>
                <button
                  type="button"
                  className="boton boton-fantasma"
                  onClick={() => pedir({ type: 'repartir', first: 'mesa' })}
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
      {yoCuento && mano.direction === null && (
        <div className="mesa-instruccion">
          Toca el <strong>1</strong> para contar hacia arriba, o el <strong>4</strong> para contar
          hacia abajo
        </div>
      )}
      {yoCuento && mano.direction !== null && (
        <div className="mesa-instruccion">
          Sigue contando: toca el <strong>{SECUENCIA[mano.direction][mano.contadas]}</strong>
        </div>
      )}
      {contando && !yoCuento && (
        <div className="mesa-instruccion">
          {nombre(mano.dealer)} está poniendo la mesa… ({mano.contadas} de 4)
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
