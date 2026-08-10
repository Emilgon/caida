# Convenciones del motor (Fase 1 en adelante)

Este proyecto sigue el mismo patrón que ya se probó en el otro juego de
Emilio (dominó, repo separado: `Emilgon/domino`, carpeta
`server/src/domino/`). Si una sesión nueva no tiene ese repo a la vista,
esto resume lo que hay que replicar:

- **Lógica pura, sin sockets**: el motor vive en `server/src/caida/` (o
  nombre similar), no importa nada de Express/Socket.IO. Cada función que
  cambia el estado devuelve un estado **nuevo** (inmutable — `structuredClone`
  antes de mutar la copia), nunca modifica lo que recibe.
- **Errores tipados**: una clase `GameError extends Error` con `code` +
  `message` en español, listo para mostrarle al jugador tal cual. Nunca un
  `throw` genérico para una regla del juego.
- **`createMatch`** arranca la partida (recibe meta de puntos, modo de mesa,
  número de jugadores, semilla opcional). **`legalMoves`** calcula qué puede
  hacer un jugador en su turno (vacío si no le toca). Las acciones (jugar
  carta, hacer caída, declarar canto) validan contra `legalMoves` antes de
  aplicar nada.
- **`publicStateFor(match, player)`**: la vista que le llega a CADA jugador
  nunca expone las cartas de los demás mientras la mano está en juego — la
  base de que hacer trampa no sea posible ni queriendo.
- **Aleatoriedad con semilla** (`mulberry32` o similar): permite reproducir
  una partida completa para depurar un bug reportado, sin depender de
  `Math.random()` en la lógica.
- **Tests antes que la UI**: `server/src/caida/*.test.js`, con casos
  concretos de cada regla de `REGLAS.md` y con partidas completas simuladas
  (no solo unitarios sueltos) para las 3 modalidades de jugadores.

No hace falta copiar código del dominó — la mecánica de Caída no se parece
en nada (cartas vs fichas, captura vs cadena). Esto es solo el "cómo se
organiza el código", no el "qué hace".
