// Abre el juego en el Edge que ya está instalado, juega una partida contra
// bots y guarda capturas. Sirve para ver la pantalla sin tener que pedirle a
// nadie que la mire: los fallos de maquetación no salen en los tests.
//
//   npm run mirar            (necesita el servidor y el cliente corriendo)
//   npm run mirar -- 1280x800
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.env.URL ?? 'http://localhost:5174'
const SALIDA = process.env.SALIDA ?? 'capturas'

const TAMANOS = process.argv[2]
  ? [process.argv[2].split('x').map(Number)]
  : [
      [1920, 1080],
      [1366, 768],
      [430, 932], // celular en vertical
    ]

await mkdir(SALIDA, { recursive: true })

const navegador = await chromium.launch({ executablePath: EDGE, headless: true })

/**
 * Qué se sale de la pantalla. Ignora lo que hay DENTRO de un <svg>: sus
 * elementos reportan la geometría sin recortar, y la carta ya los recorta con
 * overflow:hidden. Si no, salen doce falsos avisos por cada dorso dibujado.
 */
async function desbordes(page) {
  return page.evaluate(() => {
    const malos = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('svg')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const margen = 2
      const fuera =
        r.left < -margen ||
        r.top < -margen ||
        r.right > window.innerWidth + margen ||
        r.bottom > window.innerHeight + margen
      if (fuera) {
        malos.push({
          que: (el.getAttribute('class') || el.tagName).slice(0, 60),
          caja: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        })
      }
    }
    return { malos: malos.slice(0, 12), ancho: window.innerWidth, alto: window.innerHeight }
  })
}

for (const [ancho, alto] of TAMANOS) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto } })
  const page = await contexto.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text()))

  await page.goto(URL, { waitUntil: 'networkidle' })
  const etiqueta = `${ancho}x${alto}`

  // Menú
  await page.fill('input[placeholder="¿Cómo te llamas?"]', 'Emilio')
  await page.screenshot({ path: `${SALIDA}/${etiqueta}-1-menu.png` })

  // Mesa de 4 contra los bots
  await page.click('text=Jugar contra los bots')
  await page.click('button:has-text("4 · parejas")')
  await page.click('text=Barajar y empezar')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SALIDA}/${etiqueta}-2-reparto.png` })

  // Si me toca repartir, hago el conteo a mano para ver las siluetas. Si
  // reparte un bot, esperamos a que acabe (el reparto es al azar, así que no
  // siempre toca; con --repartiendo se insiste hasta que sí).
  const aJugadores = page.locator('text=A los jugadores primero')
  if (await aJugadores.count()) {
    await aJugadores.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SALIDA}/${etiqueta}-3-siluetas.png` })

    for (let i = 0; i < 4; i += 1) {
      const activa = page.locator('.conteo-activa')
      if (!(await activa.count())) break
      // La primera vez elegimos el 1 (contar hacia arriba).
      await activa.first().click()
      await page.waitForTimeout(650)
      if (i === 0) await page.screenshot({ path: `${SALIDA}/${etiqueta}-3b-contando.png` })
    }
    await page.screenshot({ path: `${SALIDA}/${etiqueta}-3c-mesa-puesta.png` })
  }

  // Dejamos correr a los bots y jugamos lo que se pueda.
  for (let i = 0; i < 4; i += 1) {
    await page.waitForTimeout(2600)
    const mias = page.locator('.mi-mano .carta-jugable')
    if (await mias.count()) await mias.first().click()
  }
  await page.screenshot({ path: `${SALIDA}/${etiqueta}-4-jugando.png` })

  const info = await desbordes(page)
  console.log(`\n=== ${etiqueta} (${info.ancho}x${info.alto})`)
  if (errores.length) console.log('  errores JS:', errores.slice(0, 4).join(' | '))
  if (info.malos.length === 0) console.log('  nada se sale de la pantalla')
  else for (const m of info.malos) console.log(`  SE SALE  ${m.que}  [${m.caja.join(', ')}]`)

  await contexto.close()
}

await navegador.close()
console.log(`\ncapturas en client/${SALIDA}/`)
