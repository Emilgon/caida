// Baja la baraja "Naipes Libres" (Basquetteur y Germarquezm, CC BY-SA 3.0)
// de Wikimedia Commons a client/public/cartas/.
//
//   npm run cartas
//
// Va una carta a la vez y sin apurar: Commons corta a las malas si uno se
// apura (429). Es reanudable, así que si se corta, se vuelve a lanzar y
// sigue donde iba. Verifica que cada archivo sea de verdad un PNG, porque
// las páginas de error también llegan con 200.
import { writeFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const DESTINO = process.argv[2] ?? 'public/cartas'
const UA = 'CaidaOnline/1.0 (proyecto personal; contacto via github.com/Emilgon/caida)'
const PALOS = { oros: 'oros', copas: 'copas', espadas: 'espadas', bastos: 'bastos' }
const VALORES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]

// En Commons los números van "2oros.png" y las figuras con inicial:
// A(s)=1, S(ota)=10, C(aballo)=11, R(ey)=12.
const prefijo = (v) => ({ 1: 'A', 10: 'S', 11: 'C', 12: 'R' })[v] ?? String(v)

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function urlDe(nombre) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(nombre)}&prop=imageinfo&iiprop=url|size|extmetadata&format=json`
  const r = await fetch(api, { headers: { 'User-Agent': UA } })
  const j = await r.json()
  const p = Object.values(j.query.pages)[0]
  const i = p.imageinfo?.[0]
  if (!i) throw new Error(`no existe ${nombre}`)
  const meta = i.extmetadata || {}
  return {
    url: i.url.split('?')[0],
    licencia: meta.LicenseShortName?.value ?? '?',
    autor: (meta.Artist?.value ?? '?').replace(/<[^>]+>/g, '').trim(),
  }
}

const FIRMA_PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

async function bajar(nombre, destino) {
  const info = await urlDe(nombre)
  // Commons corta a las malas si uno se apura (429). Se espera cada vez más.
  for (let intento = 1; intento <= 20; intento += 1) {
    const r = await fetch(info.url, { headers: { 'User-Agent': UA } })
    if (r.status === 429) {
      await dormir(90000)
      continue
    }
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 1000 && buf.subarray(0, 8).equals(FIRMA_PNG)) {
      await writeFile(destino, buf)
      return { ...info, bytes: buf.length }
    }
    await dormir(30000)
  }
  throw new Error(`no se pudo bajar ${nombre}`)
}

await mkdir(DESTINO, { recursive: true })

const tareas = []
for (const palo of Object.keys(PALOS)) {
  for (const valor of VALORES) {
    tareas.push({ commons: `${prefijo(valor)}${palo}.png`, local: `${palo}-${valor}.png` })
  }
}
tareas.push({ commons: 'Atras.png', local: 'reverso.png' })

const autores = new Set()
const licencias = new Set()
let hechas = 0

for (const t of tareas) {
  const destino = join(DESTINO, t.local)
  hechas += 1
  // Reanudable: lo ya bajado y sano no se vuelve a pedir.
  try {
    const { size } = await stat(destino)
    if (size > 1000) {
      process.stdout.write(`\r${hechas}/${tareas.length}  ${t.local.padEnd(18)} (ya estaba)`)
      continue
    }
  } catch {
    /* no estaba */
  }
  const info = await bajar(t.commons, destino)
  autores.add(info.autor)
  licencias.add(info.licencia)
  process.stdout.write(`\r${hechas}/${tareas.length}  ${t.local.padEnd(18)}            `)
  await dormir(40000)
}

console.log('\n')
console.log('licencia:', [...licencias].join(', '))
console.log('autores:', [...autores].join(' | '))
