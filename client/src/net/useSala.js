import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const SERVIDOR = import.meta.env.VITE_SERVER_URL || 'http://localhost:3002'

// El token es lo que te devuelve a TU asiento si recargas o se te cae la
// señal. Vive en el navegador, uno por mesa: si entras a otra mesa no
// arrastras el de la anterior.
const clave = (code) => `caida:token:${code}`

export function tokenGuardado(code) {
  try {
    return localStorage.getItem(clave(code)) || null
  } catch {
    return null
  }
}

function guardarToken(code, playerId) {
  try {
    localStorage.setItem(clave(code), playerId)
    localStorage.setItem('caida:ultima-mesa', code)
  } catch {
    /* modo incógnito */
  }
}

export function ultimaMesa() {
  try {
    const code = localStorage.getItem('caida:ultima-mesa')
    return code && tokenGuardado(code) ? code : null
  } catch {
    return null
  }
}

export function olvidarMesa(code) {
  try {
    localStorage.removeItem(clave(code))
    if (localStorage.getItem('caida:ultima-mesa') === code) {
      localStorage.removeItem('caida:ultima-mesa')
    }
  } catch {
    /* nada que limpiar */
  }
}

export function nombreGuardado() {
  try {
    return localStorage.getItem('caida:nombre') || ''
  } catch {
    return ''
  }
}

export function guardarNombre(nombre) {
  try {
    localStorage.setItem('caida:nombre', nombre)
  } catch {
    /* nada */
  }
}

/**
 * Un socket para toda la aplicación, con el último estado recibido.
 * Todo lo que se le pide al servidor pasa por `pedir`, que devuelve la
 * respuesta ya normalizada: `{ ok }` o `{ ok: false, error }`.
 */
export function useSala() {
  const socketRef = useRef(null)
  const [conectado, setConectado] = useState(false)
  const [estado, setEstado] = useState(null)
  const [cerrada, setCerrada] = useState(null)

  useEffect(() => {
    const socket = io(SERVIDOR, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => setConectado(true))
    socket.on('disconnect', () => setConectado(false))
    socket.on('sala:estado', setEstado)
    socket.on('sala:cerrada', (info) => setCerrada(info))

    return () => {
      socket.removeAllListeners()
      socket.close()
      socketRef.current = null
    }
  }, [])

  const pedir = useCallback((evento, datos = {}) => {
    return new Promise((resolve) => {
      const socket = socketRef.current
      if (!socket || !socket.connected) {
        resolve({ ok: false, error: { code: 'SIN_CONEXION', message: 'Sin conexión con el servidor.' } })
        return
      }
      const aborto = setTimeout(() => {
        resolve({ ok: false, error: { code: 'SIN_RESPUESTA', message: 'El servidor no respondió.' } })
      }, 8000)
      socket.emit(evento, datos, (respuesta) => {
        clearTimeout(aborto)
        resolve(respuesta ?? { ok: false, error: { code: 'VACIO', message: 'Respuesta vacía.' } })
      })
    })
  }, [])

  const acciones = useMemo(
    () => ({
      async crear({ nombre, players, target, mode }) {
        const r = await pedir('sala:crear', { name: nombre, players, target, mode })
        if (r.ok) guardarToken(r.code, r.playerId)
        return r
      },
      async entrar({ code, nombre }) {
        const r = await pedir('sala:entrar', {
          code,
          name: nombre,
          playerId: tokenGuardado(code) || undefined,
        })
        if (r.ok) guardarToken(r.code, r.playerId)
        return r
      },
      mover: (from, to) => pedir('sala:asiento', { from, to }),
      configurar: (cambios) => pedir('sala:config', cambios),
      agregarBot: (seat) => pedir('sala:bot-agregar', seat === undefined ? {} : { seat }),
      quitarBot: (seat) => pedir('sala:bot-quitar', { seat }),
      empezar: () => pedir('sala:empezar'),
      revancha: () => pedir('sala:revancha'),
      jugar: (move) => pedir('juego:jugada', { move }),
      cancelar: () => pedir('sala:cancelar'),
      salir: () => pedir('sala:salir'),
    }),
    [pedir],
  )

  const reiniciar = useCallback(() => {
    setEstado(null)
    setCerrada(null)
  }, [])

  return { conectado, estado, cerrada, acciones, reiniciar }
}
