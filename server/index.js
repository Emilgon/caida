// Primero que cualquier otro import, por si algun modulo futuro lee
// process.env al cargarse (paso ya aprendido con el dominó). En Render no
// hace falta: las variables ya vienen inyectadas en el proceso, y dotenv
// nunca pisa una que ya exista.
import "dotenv/config";

import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";

const PORT = process.env.PORT || 3002;

// El header Origin del navegador nunca lleva barra final ni mayusculas en el host,
// asi que normalizamos lo configurado para que un "/" de mas no rompa CORS en silencio.
const normalizeOrigin = (origin) => origin.trim().replace(/\/+$/, "").toLowerCase();

// Acepta una lista separada por comas para cubrir produccion + previews de Vercel.
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || "http://localhost:5174")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Sin Origin: peticiones que no vienen de un navegador (curl, health checks).
    if (!origin) return callback(null, true);
    callback(null, ALLOWED_ORIGINS.includes(normalizeOrigin(origin)));
  },
};

const app = express();
app.use(cors(corsOptions));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: corsOptions });

// TEMPORAL (Fase 0): solo confirma que el pipeline cliente-servidor
// funciona de punta a punta. Se reemplaza por el registerRoomHandlers real
// en la Fase 2, una vez el motor de reglas (Fase 1) este listo.
io.on("connection", (socket) => {
  console.log(`conexion de prueba: ${socket.id}`);
  socket.emit("eco", { mensaje: "servidor de Caída activo" });
});

httpServer.listen(PORT, () => {
  console.log(`servidor escuchando en puerto ${PORT}`);
  console.log(`origenes permitidos: ${ALLOWED_ORIGINS.join(", ")}`);
});
