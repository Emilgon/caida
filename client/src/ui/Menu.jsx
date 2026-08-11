import { useState } from 'react'

import Carta from '../cartas/Carta.jsx'
import { guardarNombre, nombreGuardado } from '../net/useSala.js'
import { sonido } from '../sonido.js'
import './menu.css'

const CARTAS_PORTADA = [
  { id: 'oros-12', suit: 'oros', value: 12 },
  { id: 'copas-1', suit: 'copas', value: 1 },
  { id: 'espadas-11', suit: 'espadas', value: 11 },
  { id: 'bastos-7', suit: 'bastos', value: 7 },
]

function Portada() {
  return (
    <header className="portada">
      <div className="portada-abanico" aria-hidden="true">
        {CARTAS_PORTADA.map((carta, i) => (
          <Carta
            key={carta.id}
            carta={carta}
            className="portada-carta"
            style={{ '--giro': `${(i - 1.5) * 11}deg`, '--salto': `${Math.abs(i - 1.5) * 13}px` }}
          />
        ))}
      </div>
      <h1 className="portada-titulo">Caída</h1>
      <p className="portada-sub">Juego de cartas venezolano</p>
    </header>
  )
}

function Elegir({ etiqueta, valor, opciones, onChange }) {
  return (
    <label className="campo">
      {etiqueta}
      <div className="opciones">
        {opciones.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            className="opcion"
            aria-pressed={valor === opcion.valor}
            onClick={() => onChange(opcion.valor)}
          >
            {opcion.texto}
          </button>
        ))}
      </div>
    </label>
  )
}

export default function Menu({ acciones, ultima, onVolverAMesa }) {
  const [nombre, setNombre] = useState(nombreGuardado)
  const [pantalla, setPantalla] = useState('inicio')
  const [jugadores, setJugadores] = useState(4)
  const [meta, setMeta] = useState(24)
  const [modo, setModo] = useState('tradicional')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const nombreListo = nombre.trim().length > 0

  async function correr(tarea) {
    setOcupado(true)
    setError(null)
    guardarNombre(nombre.trim())
    const respuesta = await tarea()
    setOcupado(false)
    if (!respuesta.ok) {
      sonido.error()
      setError(respuesta.error.message)
    }
    return respuesta
  }

  async function contraBots() {
    const creada = await correr(() =>
      acciones.crear({ nombre: nombre.trim(), players: jugadores, target: meta, mode: modo }),
    )
    if (!creada.ok) return
    for (let i = 1; i < jugadores; i += 1) {
      const puesto = await acciones.agregarBot()
      if (!puesto.ok) {
        setError(puesto.error.message)
        return
      }
    }
    sonido.barajar()
    const arranque = await acciones.empezar()
    if (!arranque.ok) setError(arranque.error.message)
  }

  async function crearMesa() {
    const creada = await correr(() =>
      acciones.crear({ nombre: nombre.trim(), players: jugadores, target: meta, mode: modo }),
    )
    if (creada.ok) sonido.puerta()
  }

  async function entrarMesa() {
    const entrada = await correr(() =>
      acciones.entrar({ code: codigo.trim().toUpperCase(), nombre: nombre.trim() }),
    )
    if (entrada.ok) sonido.puerta()
  }

  return (
    <div className="menu">
      <div className="menu-caja">
        <Portada />

        {ultima && (
          <button type="button" className="boton menu-retomar" onClick={onVolverAMesa}>
            Volver a la mesa {ultima}
          </button>
        )}

        <label className="campo">
          Tu nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="¿Cómo te llamas?"
            maxLength={20}
            autoComplete="nickname"
          />
        </label>

        {pantalla === 'inicio' && (
          <div className="menu-acciones">
            <button
              type="button"
              className="boton"
              disabled={!nombreListo}
              onClick={() => setPantalla('bots')}
            >
              Jugar contra los bots
            </button>
            <button
              type="button"
              className="boton boton-fantasma"
              disabled={!nombreListo}
              onClick={() => setPantalla('crear')}
            >
              Crear una mesa
            </button>
            <button
              type="button"
              className="boton boton-fantasma"
              disabled={!nombreListo}
              onClick={() => setPantalla('entrar')}
            >
              Entrar con código
            </button>
            {!nombreListo && <p className="menu-pista">Escribe tu nombre para empezar.</p>}
          </div>
        )}

        {(pantalla === 'bots' || pantalla === 'crear') && (
          <div className="menu-acciones">
            <Elegir
              etiqueta={pantalla === 'bots' ? 'Cuántos en la mesa (tú incluido)' : 'Jugadores'}
              valor={jugadores}
              onChange={setJugadores}
              opciones={[
                { valor: 2, texto: '2' },
                { valor: 3, texto: '3' },
                { valor: 4, texto: '4 · parejas' },
              ]}
            />
            <Elegir
              etiqueta="Se juega a"
              valor={meta}
              onChange={setMeta}
              opciones={[
                { valor: 24, texto: '24 puntos' },
                { valor: 48, texto: '48 puntos' },
              ]}
            />
            <Elegir
              etiqueta="Modo de cantos"
              valor={modo}
              onChange={setModo}
              opciones={[
                { valor: 'tradicional', texto: 'Tradicional' },
                { valor: 'mayor-canto', texto: 'Mayor canto' },
              ]}
            />
            {pantalla === 'bots' && (
              <p className="menu-pista">
                {jugadores === 4
                  ? 'Odaa, Key y Toby. Tu pareja va enfrente.'
                  : `Te acompañan ${['Odaa', 'Key', 'Toby'].slice(0, jugadores - 1).join(' y ')}.`}
              </p>
            )}
            <button
              type="button"
              className="boton"
              disabled={ocupado}
              onClick={pantalla === 'bots' ? contraBots : crearMesa}
            >
              {ocupado ? 'Un momento…' : pantalla === 'bots' ? 'Barajar y empezar' : 'Crear la mesa'}
            </button>
            <button type="button" className="boton boton-fantasma" onClick={() => setPantalla('inicio')}>
              Atrás
            </button>
          </div>
        )}

        {pantalla === 'entrar' && (
          <div className="menu-acciones">
            <label className="campo">
              Código de la mesa
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="menu-codigo"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="boton"
              disabled={ocupado || codigo.trim().length < 6}
              onClick={entrarMesa}
            >
              {ocupado ? 'Entrando…' : 'Entrar'}
            </button>
            <button type="button" className="boton boton-fantasma" onClick={() => setPantalla('inicio')}>
              Atrás
            </button>
          </div>
        )}

        {error && <p className="aviso-error">{error}</p>}
      </div>
    </div>
  )
}
