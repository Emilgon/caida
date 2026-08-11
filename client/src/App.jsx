import { useEffect, useState } from 'react'

import Menu from './ui/Menu.jsx'
import Sala from './ui/Sala.jsx'
import Mesa from './ui/Mesa.jsx'
import { olvidarMesa, tokenGuardado, ultimaMesa, useSala } from './net/useSala.js'
import { sonido } from './sonido.js'

export default function App() {
  const { conectado, estado, cerrada, acciones, reiniciar } = useSala()
  const [mesaGuardada, setMesaGuardada] = useState(ultimaMesa)
  const [aviso, setAviso] = useState(null)

  // La mesa se disolvió mientras estabas dentro.
  useEffect(() => {
    if (!cerrada) return
    olvidarMesa(cerrada.code)
    setMesaGuardada(null)
    setAviso('La mesa se canceló.')
    reiniciar()
  }, [cerrada, reiniciar])

  async function salir() {
    const code = estado?.room?.code
    await acciones.salir()
    if (code) olvidarMesa(code)
    setMesaGuardada(null)
    reiniciar()
  }

  // Volver a una mesa de la que te saliste por recargar o cerrar la pestaña.
  async function retomar() {
    if (!mesaGuardada || !tokenGuardado(mesaGuardada)) return
    const r = await acciones.entrar({ code: mesaGuardada, nombre: '' })
    if (!r.ok) {
      sonido.error()
      setAviso(r.error.message)
      olvidarMesa(mesaGuardada)
      setMesaGuardada(null)
    }
  }

  if (!conectado && !estado) {
    return (
      <div className="mesa-cargando">
        <p>Conectando con el servidor…</p>
      </div>
    )
  }

  if (!estado) {
    return (
      <>
        {aviso && <div className="mesa-error aviso-error">{aviso}</div>}
        <Menu acciones={acciones} ultima={mesaGuardada} onVolverAMesa={retomar} />
      </>
    )
  }

  const { room, game } = estado

  if (room.phase === 'sala') {
    return <Sala sala={room} acciones={acciones} onSalir={salir} />
  }

  return <Mesa room={room} game={game} acciones={acciones} onSalir={salir} />
}
