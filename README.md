# Caída Online

Plataforma web para jugar Caída (juego de cartas venezolano) en tiempo real
con personas reales, 2, 3 o 4 jugadores.

**Estado:** jugable. Motor, salas, bots e interfaz. Se puede jugar contra
Odaa, Key y Toby, o con gente por código de mesa.

## Estructura

- `server/` — Node.js + Express + Socket.IO. Fuente de verdad del estado
  del juego.
  - `src/caida/` — motor de reglas, lógica pura sin dependencia de la red.
    Ver [REGLAS.md](REGLAS.md).
  - `src/rooms/` — salas: quién está sentado dónde, reconexión, y el puente
    con los sockets.
  - `src/bots/` — Odaa, Key y Toby.
- `client/` — React + Vite.
  - `src/cartas/` — la baraja española dibujada en SVG.
  - `src/ui/` — menú, sala y tablero.

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

## Las salas

En `server/src/rooms/`. Mesas **privadas por código**: creas una, el servidor
te da un código de 6 letras y quien lo tenga entra. Se llenan por orden de
llegada y el líder (quien la creó) arrastra a la gente de asiento para armar
las parejas, porque con 4 los asientos `0`+`2` juegan contra `1`+`3`.

Cada jugador tiene un **token** que su navegador guarda. Es lo que le devuelve
su asiento si recarga la página o se le cae la señal: mientras tanto la mesa
se congela y los demás ven a quién se está esperando. Pasado un minuto (o de
una vez, si la persona se fue a propósito), los que siguen conectados pueden
cancelar la mesa, pero hacen falta **todos** — si no, cualquiera podría
disolver una partida que va perdiendo.

El token es un secreto: con el de otro se podrían ver sus cartas, así que
nunca viaja a los demás jugadores.

### Protocolo

Todo lo que manda el cliente lleva callback de respuesta:
`{ ok: true, ... }` o `{ ok: false, error: { code, message } }`, con el
`message` en español listo para mostrar.

| Evento | Quién | Qué hace |
|---|---|---|
| `sala:crear` | cualquiera | `{ name, players, target, mode }` → `{ code, playerId }` |
| `sala:entrar` | cualquiera | `{ code, name, playerId? }`. Con `playerId` es reconexión |
| `sala:asiento` | líder | `{ from, to }`, arrastrar y soltar |
| `sala:config` | líder | `{ players, target, mode }`, antes de empezar |
| `sala:empezar` | líder | mesa llena y todos conectados |
| `juego:jugada` | quien tenga el turno | `{ move }`, tal cual salió de `legalMoves` |
| `sala:revancha` | líder | otra partida, mismos asientos |
| `sala:cancelar` | los conectados | voto para disolver una mesa colgada |
| `sala:salir` | cualquiera | irse |

El servidor emite `sala:estado` con `{ room, game }` **por socket**, no a la
sala entera: la vista de cada quien es distinta y las cartas de uno no pueden
salir en el mensaje de otro. También emite `sala:cerrada` cuando la mesa se
cancela.

La semilla de la baraja **la pone el servidor**. Si la eligiera el cliente
sabría de antemano cómo queda el mazo.

Las salas viven en memoria. Si el servidor se reinicia — en Render free se
duerme por inactividad — las partidas en curso se pierden. Asumido para el
v1; persistirlas es meter una base de datos.

## Los bots

Odaa, Key y Toby. El líder los sienta y los quita antes de empezar, así que
se arma yo contra 1, contra 2, o contra 3 con parejas.

Deciden con la **misma vista que recibe una persona**: no ven las cartas de
nadie ni el mazo. Es a propósito. Un bot que espía juega de una forma que no
se puede reproducir jugando, y entonces sus errores no sirven para encontrar
fallos en el juego.

Prefieren caer antes que lanzar, se llevan la jugada que más cartas arrastra
y matan el canto cuando pueden. Si no capturan, sueltan la carta chica y
guardan la grande. Cantan cuando lo hacen capturando —así nadie se lo mata—
y si van a lanzar, esperan a la última carta del canto.

## Tests

```bash
cd server && npm test    # motor, salas, bots, end to end por sockets
cd client && npm test    # las pantallas, dibujadas contra partidas reales
```

- **Reglas**: cada regla de [REGLAS.md](REGLAS.md) por separado.
- **Partidas simuladas**: 2, 3 y 4 jugadores en los dos modos, comprobando en
  cada jugada que las 40 cartas siguen ahí sin duplicarse, que el marcador
  nunca baja y que nadie ve lo ajeno.
- **Salas**: entrar, armar parejas, empezar, caerse, volver, cancelar.
- **End to end**: servidor Socket.IO real y clientes reales por TCP jugando
  una partida completa de 4, contrastando en cada jugada lo que recibió cada
  cliente contra el estado verdadero del servidor.
- **Pantallas**: menú, sala y tablero dibujados contra partidas de verdad
  salidas del motor, incluida la comprobación de que el tablero nunca pinta
  una carta que no deberías estar viendo.

## Correr en local

Necesitas dos terminales.

**Servidor** (puerto 3002):

```bash
cd server
npm install
npm run dev
```

**Cliente** (puerto **5174**, fijo a propósito: es el que el servidor permite
por CORS por defecto. Si está ocupado, Vite falla en vez de moverse solo, que
es lo que hacía que el socket quedara rechazado sin explicación):

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
