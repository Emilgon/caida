// Baja la baraja "Naipes Libres" (Basquetteur y Germarquezm, CC BY-SA 3.0)
// de Wikimedia Commons a client/public/cartas/.
//
//   npm run cartas
//
// La ruta de cada archivo en Commons sale del MD5 de su nombre, así que no
// hace falta preguntarle nada a la API: son 41 descargas y ni una llamada de
// más. Preguntarlo carta por carta era justo lo que hacía saltar el límite.
//
// Es reanudable: si se corta, se relanza y sigue donde iba. Y comprueba que
// cada archivo sea de verdad un PNG, porque las páginas de error de Commons
// también llegan con código 200.
import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DESTINO = process.argv[2] ?? 'public/cartas'
const UA = 'CaidaOnline/1.0 (proyecto personal; github.com/Emilgon/caida)'
const PALOS = ['oros', 'copas', 'espadas', 'bastos']
const VALORES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]
const FIRMA_PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

// En Commons los números van "2oros.png" y las figuras con inicial:
// A(s)=1, S(ota)=10, C(aballo)=11, R(ey)=12.
const prefijo = (v) => ({ 1: 'A', 10: 'S', 11: 'C', 12: 'R' })[v] ?? String(v)

function urlDe(nombre) {
  const h = createHash('md5').update(nombre).digest('hex')
  return `https://upload.wikimedia.org/wikipedia/commons/${h[0]}/${h.slice(0, 2)}/${nombre}`
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function bajar(nombre, destino) {
  const url = urlDe(nombre)
  for (let intento = 1; intento <= 12; intento += 1) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (r.status === 429) {
      // Commons corta cuando uno se apura. Se espera cada vez un poco más.
      await dormir(Math.min(60000, 5000 * intento))
      continue
    }
    if (r.status === 404) throw new Error(`no existe en Commons: ${nombre}`)
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 1000 && buf.subarray(0, 8).equals(FIRMA_PNG)) {
      await writeFile(destino, buf)
      return buf.length
    }
    await dormir(4000 * intento)
  }
  throw new Error(`no se pudo bajar ${nombre}`)
}

await mkdir(DESTINO, { recursive: true })

const tareas = []
for (const palo of PALOS) {
  for (const valor of VALORES) {
    tareas.push({ commons: `${prefijo(valor)}${palo}.png`, local: `${palo}-${valor}.png` })
  }
}
tareas.push({ commons: 'Atras.png', local: 'reverso.png' })

let bajadas = 0
let saltadas = 0

for (const [i, t] of tareas.entries()) {
  const destino = join(DESTINO, t.local)
  try {
    const { size } = await stat(destino)
    if (size > 1000) {
      saltadas += 1
      continue
    }
  } catch {
    /* no estaba */
  }
  const bytes = await bajar(t.commons, destino)
  bajadas += 1
  console.log(`${i + 1}/${tareas.length}  ${t.local.padEnd(16)} ${(bytes / 1024).toFixed(0)} KB`)
  await dormir(900)
}

console.log(`\nlisto: ${bajadas} bajadas, ${saltadas} ya estaban`)
console.log('Naipes Libres, de Basquetteur y Germarquezm — CC BY-SA 3.0')
