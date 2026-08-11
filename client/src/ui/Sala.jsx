import { useState } from 'react'

import { Dorso } from '../cartas/Carta.jsx'
import { sonido } from '../sonido.js'
import './sala.css'

const ETIQUETA_MODO = { tradicional: 'Tradicional', 'mayor-canto': 'Mayor canto' }

function Asiento({ puesto, pareja, esLider, arrastrando, onArrastrar, onSoltar, onQuitarBot }) {
  const { seat, empty, name, bot, host, you, connected } = puesto
  const movible = esLider && !empty

  return (
    <div
      className={[
        'asiento',
        empty && 'asiento-vacio',
        you && 'asiento-tuyo',
        arrastrando === seat && 'asiento-arrastrando',
        pareja !== null && `asiento-pareja-${pareja}`,
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={movible}
      onDragStart={() => onArrastrar(seat)}
      onDragEnd={() => onArrastrar(null)}
      onDragOver={(e) => {
        if (esLider && arrastrando !== null && arrastrando !== seat) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onSoltar(seat)
      }}
    >
      <span className="asiento-numero">Asiento {seat + 1}</span>

      {empty ? (
        <span className="asiento-libre">Libre</span>
      ) : (
        <>
          <span className="asiento-nombre">
            {name}
            {you && <em> (tú)</em>}
          </span>
          <span className="asiento-etiquetas">
            {host && <span className="etiqueta etiqueta-lider">Líder</span>}
            {bot && <span className="etiqueta etiqueta-bot">Bot</span>}
            {!connected && <span className="etiqueta etiqueta-caido">Sin conexión</span>}
          </span>
          {esLider && bot && (
            <button
              type="button"
              className="boton boton-chico boton-fantasma asiento-quitar"
              onClick={() => onQuitarBot(seat)}
            >
              Quitar
            </button>
          )}
        </>
      )}

      {movible && <span className="asiento-agarre" title="Arrastra para mover" />}
    </div>
  )
}

export default function Sala({ sala, acciones, onSalir }) {
  const [arrastrando, setArrastrando] = useState(null)
  const [error, setError] = useState(null)
  const [copiado, setCopiado] = useState(false)

  const esLider = sala.youAreHost
  const parejaDe = (seat) => {
    if (!sala.teams) return null
    return sala.teams.findIndex((equipo) => equipo.includes(seat))
  }

  async function correr(promesa) {
    const r = await promesa
    if (!r.ok) {
      sonido.error()
      setError(r.error.message)
    } else {
      setError(null)
    }
    return r
  }

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(sala.code)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      setError('Tu navegador no dejó copiar. Anótalo a mano: ' + sala.code)
    }
  }

  const faltan = sala.seats.filter((puesto) => puesto.empty).length

  return (
    <div className="sala">
      <div className="sala-caja">
        <header className="sala-cabecera">
          <div>
            <h2>Mesa lista para {sala.config.players}</h2>
            <p className="sala-reglas">
              A {sala.config.target} puntos · {ETIQUETA_MODO[sala.config.mode]}
            </p>
          </div>
          <div className="sala-codigo">
            <span className="sala-codigo-etiqueta">Código</span>
            <button type="button" className="sala-codigo-valor" onClick={copiarCodigo}>
              {sala.code}
            </button>
            <span className="sala-codigo-pista">{copiado ? '¡Copiado!' : 'Tócalo para copiar'}</span>
          </div>
        </header>

        {sala.teams && (
          <p className="sala-pista">
            Los asientos 1 y 3 juegan contra el 2 y el 4.
            {esLider && ' Arrastra a la gente para armar las parejas.'}
          </p>
        )}

        <div className={`sala-asientos sala-asientos-${sala.config.players}`}>
          {sala.seats.map((puesto) => (
            <Asiento
              key={puesto.seat}
              puesto={puesto}
              pareja={parejaDe(puesto.seat)}
              esLider={esLider}
              arrastrando={arrastrando}
              onArrastrar={setArrastrando}
              onSoltar={(destino) => {
                if (arrastrando === null || arrastrando === destino) return
                correr(acciones.mover(arrastrando, destino))
                setArrastrando(null)
              }}
              onQuitarBot={(seat) => correr(acciones.quitarBot(seat))}
            />
          ))}
        </div>

        {esLider && (
          <div className="sala-controles">
            <button
              type="button"
              className="boton boton-fantasma"
              disabled={faltan === 0}
              onClick={() => correr(acciones.agregarBot())}
            >
              Sentar un bot
            </button>
            <button
              type="button"
              className="boton"
              disabled={faltan > 0}
              onClick={async () => {
                sonido.barajar()
                await correr(acciones.empezar())
              }}
            >
              {faltan > 0 ? `Faltan ${faltan}` : 'Barajar y empezar'}
            </button>
          </div>
        )}

        {!esLider && (
          <p className="sala-pista sala-esperando">
            <Dorso className="sala-dorso" />
            Esperando a que el líder reparta…
          </p>
        )}

        {error && <p className="aviso-error">{error}</p>}

        <button type="button" className="boton boton-chico boton-fantasma sala-salir" onClick={onSalir}>
          Salir de la mesa
        </button>
      </div>
    </div>
  )
}
