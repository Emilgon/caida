# Reglas implementadas (Caída venezolana)

Esta es la especificación que sigue el motor. Si una regla no está aquí, no
está implementada. Fuente: [Caída explicado — Venezuela](https://hive.blog/spanish/@joriangel/juego-de-cartas-caida-explicado-venezuela),
corregida y completada por Emilio.

## Baraja y jugadores

- Española de 40 cartas: valores `1,2,3,4,5,6,7,10,11,12` (sin 8 ni 9), en 4
  palos.
- 2, 3 o 4 jugadores.
- Con 4, se juega en parejas cruzadas (asientos `0`+`2` contra `1`+`3`, igual
  que el dominó). Con 2 o 3, cada quien juega para sí.
- Meta de puntos, elegible al crear la mesa: **24 o 48**.
- Dos modos de mesa, elegibles al crear la mesa: **Tradicional (con mata
  canto)** o **Mayor Canto** (ver más abajo).

## Reparto de una mano

1. El primer repartidor de la partida se decide al azar (botón de barajar).
   En las manos siguientes, el reparto rota al siguiente jugador.
2. Quien reparte elige, antes de repartir:
   - Qué reparte primero: las manos o la mesa.
   - Con qué sentido cuenta la mesa: ascendente (1,2,3,4) o descendente
     (4,3,2,1).
3. Reparte 3 cartas a cada jugador.
4. Reparte 4 cartas a la mesa, una por una, contando el número que
   corresponda según el sentido elegido. **Si el valor de la carta coincide
   con el número dicho en esa posición**, quien reparte (o su pareja) se
   anota los puntos de esa posición (1 a 4). Si no acierta ninguna de las 4,
   es "mal echada": el primer jugador en jugar se anota 1 punto de consuelo.
5. Las 4 cartas de mesa **nunca tienen valores repetidos entre sí** (se
   garantiza al repartir, sin simular el redibujo del mazo físico).

## Cantos

Se detectan en la mano de 3 cartas de cada jugador, pero **se declaran turno
a turno**, en el momento de jugar o hacer caída con la carta que forma parte
del canto — no todos de una vez al ver la mano.

| Canto | Composición | Puntos |
|---|---|---|
| Ronda | par + 1 carta suelta | según el valor del par: 1-7→1, 10→2, 11→3, 12→4 |
| Trivilín / Marisco | trío | 5 |
| Patrulla | escalera de 3 consecutivas | 6 |
| Vigía | par + 1 consecutiva | 7 |
| Registro | 1, 11, 12 | 8 |
| Registrico | 1, 10, 11 | 10 |
| Casa Chica | 1, 11, 11 | 11 |
| Casa Grande | 1, 12, 12 | 12 |

**Matar el canto**: solo el jugador sentado inmediatamente a la derecha de
quien cantó (el turno siguiente, nadie más adelante) puede matárselo,
haciendo caída sobre esa misma carta. El canto se anula del todo, y quien
mató se anota los puntos de la CAÍDA (tabla de abajo), no los del canto.

**Modo Tradicional**: cada canto vale su tabla propia, independiente de los
demás, salvo que lo maten. Si dos jugadores cantan el mismo tipo (típico:
Ronda) y a ninguno lo matan, solo se anota el de mayor valor.

**Modo Mayor Canto**: en toda la mano solo cuenta el canto más alto que
haya, de cualquier tipo (comparando por su valor en la tabla). El mata canto
sigue existiendo igual. Se resuelve al cerrar la mano, cuando ya se
declararon todos los cantos posibles.

## Turno de juego

Empieza el jugador a la derecha de quien repartió, sentido antihorario
(igual que el dominó). En tu turno:

- Si tienes una carta del mismo valor que alguna en la mesa, puedes hacer
  **caída**: te llevas TODAS las cartas de la mesa de ese valor (no solo
  una) más la que jugaste. Sumas los puntos de caída:

  | Valor | Puntos |
  |---|---|
  | 1 a 7 | 1 |
  | 10 | 2 |
  | 11 | 3 |
  | 12 | 4 |

  - Si la caída deja la mesa vacía del todo: **caída con mesa**, 5 puntos.
- Si no, lanzas una carta cualquiera a la mesa (declarando el canto si esa
  carta pertenece a uno tuyo).
- Si al recoger (sin ser caída) la mesa queda vacía: **mesa limpia**, 4
  puntos.

## Fin de la mano

Cuando todos agotan su mano de 3 cartas, quien hizo la última captura se
lleva lo que quede suelto en la mesa. Cada jugador (o pareja, en 4p) cuenta
sus cartas capturadas contra un umbral parejo según el número de jugadores;
lo que exceda son puntos extra (1 por carta):

- 2 jugadores: 20 cartas cada uno.
- 3 jugadores: quien repartió cuenta hasta 14, los otros 2 hasta 13.
- 4 jugadores (por pareja): 10 por jugador, sumado por pareja.

Se reparte de nuevo (rota el repartidor) hasta que alguien llegue a la meta.

## Fuera del v1

El "trivilín de tres 12" (gana la partida entera de un golpe) y el
"zapatero" (pagar doble si terminas en 0, viene de apuestas con dinero real)
no están implementados. Se agregan después si se extrañan jugando.
