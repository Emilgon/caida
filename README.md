# Caída Online

Plataforma web para jugar Caída (juego de cartas venezolano) en tiempo real
con personas reales, 2, 3 o 4 jugadores.

**Estado:** Fase 0, esqueleto del proyecto. El motor de reglas todavía no
existe.

## Estructura

- `server/` — Node.js + Express + Socket.IO. Fuente de verdad del estado
  del juego.
  - `src/caida/` — motor de reglas, lógica pura sin dependencia de la red
    (todavía por construir). Ver [REGLAS.md](REGLAS.md).
- `client/` — React + Vite.

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
