# Caída Online

Plataforma web para jugar Caída (juego de cartas venezolano) en tiempo real
con personas reales, 2, 3 o 4 jugadores.

**Estado:** Fase 1 lista. El motor de reglas está completo y probado; falta
la capa de salas por socket (Fase 2) y la interfaz (Fase 3).

## Estructura

- `server/` — Node.js + Express + Socket.IO. Fuente de verdad del estado
  del juego.
  - `src/caida/` — motor de reglas, lógica pura sin dependencia de la red.
    Ver [REGLAS.md](REGLAS.md).
- `client/` — React + Vite.

## El motor

Todo el juego vive en `server/src/caida/`, sin saber que existen los sockets.
La capa de red solo debe importar desde `src/caida/index.js`.

- `createMatch({ players, target, mode, seed })` — arranca la partida.
- `legalMoves(match, seat)` — qué puede hacer ese asiento ahora (vacío si no
  le toca). Cada jugada viene con su efecto ya calculado: qué captura, si es
  caída, si limpia la mesa, cuántos puntos da, si puede cantar con ella.
- `applyMove(match, seat, move)` — valida contra `legalMoves` y devuelve un
  estado **nuevo**; nunca modifica el que recibe.
- `publicStateFor(match, seat)` — la vista de un jugador. Nunca lleva las
  cartas de los demás ni el mazo, así que hacer trampa no es posible ni
  queriendo.
- Los errores de regla salen como `GameError` con `code` y un `message` en
  español listo para mostrar.

El azar va con semilla (`seed`, número o texto), guardada en la partida: con
la semilla y la lista de jugadas se reproduce una partida entera para depurar.

```bash
cd server
npm test
```

94 tests: cada regla de [REGLAS.md](REGLAS.md) por separado y partidas
completas simuladas para 2, 3 y 4 jugadores en los dos modos, verificando en
cada jugada que no se pierde ni se duplica una carta y que nadie ve lo ajeno.

## Correr en local

Necesitas dos terminales.

**Servidor** (puerto 3002):

```bash
cd server
npm install
npm run dev
```

**Cliente** (puerto elegido por Vite, normalmente 5173 o el siguiente libre):

```bash
cd client
npm install
npm run dev
```

## Variables de entorno

**Servidor:**

- `PORT` — puerto de escucha (default `3002`). En Render lo inyecta la
  plataforma.
- `CLIENT_ORIGIN` — orígenes permitidos por CORS (default
  `http://localhost:5174`). Acepta varios separados por coma, para cubrir
  producción y las URLs de preview de Vercel.

**Cliente:**

- `VITE_SERVER_URL` — URL del servidor (default `http://localhost:3002`).

En producción hay que definir ambas apuntando a los dominios reales.

## Despliegue

Mismo patrón que el dominó: **servidor → Render** (blueprint en
[render.yaml](render.yaml), `rootDir: server`, health check en `/health`),
**cliente → Vercel** (root `client`, build `npm run build`, output `dist`).
Proyectos separados de los del dominó — es otra app.
