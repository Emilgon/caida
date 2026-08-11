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

Una **mano** es el mazo completo: las 40 cartas se juegan antes de contar.
Se reparte en **tandas** de 3 cartas por jugador; cuando todos agotan sus 3,
se reparten 3 nuevas del mismo mazo, sin volver a poner cartas en la mesa.
Son 6 tandas con 2 jugadores, 4 con 3 y 3 con 4 (36 cartas repartidas + 4 de
mesa = 40, que es lo que hace cuadrar los umbrales del final).

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
   anota los puntos de esa posición (1 a 4). Si acierta en varias posiciones,
   se suman todas. Si no acierta ninguna de las 4, es "mal echada": el primer
   jugador en jugar se anota 1 punto de consuelo.
5. Las 4 cartas de mesa **nunca tienen valores repetidos entre sí** (se
   garantiza al repartir, sin simular el redibujo del mazo físico).

## Cantos

Se detectan en las 3 cartas que tiene el jugador **en la tanda actual** (se
vuelven a mirar en cada tanda nueva), pero **se declaran turno a turno**, en
el momento de jugar o hacer caída con la carta que forma parte del canto — no
todos de una vez al ver la mano.

Una mano de 3 cartas forma como máximo **un** canto: si encaja en varios
(1,12,12 es a la vez Casa Grande y Ronda de 12), vale el de más puntos.

| Canto | Composición | Puntos |
|---|---|---|
| Ronda | par + 1 carta suelta | según el valor del par: 1-7→1, 10→2, 11→3, 12→4 |
| Trivilín / Marisco | trío | 5 |
| Patrulla | escalera de 3 consecutivas, cualquier palo | 6 |
| Vigía | par + 1 consecutiva | 7 |
| Registro | 1, 11, 12 | 8 |
| Registrico | 1, 10, 11 | 10 |
| Casa Chica | 1, 11, 11 | 11 |
| Casa Grande | 1, 12, 12 | 12 |

**Matar el canto**: solo el jugador sentado inmediatamente a la derecha de
quien cantó (el turno siguiente, nadie más adelante) puede matárselo,
haciendo caída sobre esa misma carta. El canto se anula del todo, y quien
mató se anota los puntos de la CAÍDA (tabla de abajo), no los del canto.

**Modo Tradicional**: **todos los cantos suman**, cada uno su valor de tabla,
sin competir entre sí. Dos jugadores con Ronda cobran los dos; los dos de una
misma pareja también. Lo único que le quita puntos a un canto es que te lo
maten.

**Modo Mayor Canto**: solo cobra el canto **más alto**, y se compara **dentro
de la misma tanda** — que es cuando todos tienen mano comparable; un canto de
la tanda 1 no se enfrenta a uno de la tanda 4. Entran todos los jugadores,
**tu pareja incluida**: si tú tienes Vigía (7) y tu pareja Patrulla (6), la
pareja anota 7, no 13. Los cantos matados se descartan antes de comparar, así
que si a ti te matan la Vigía cobra la Patrulla de tu pareja — siempre que
ningún contrincante tenga uno más alto.

Para saber cuál es "el más alto" en este modo, primero mandan los puntos de
la tabla, y **si empatan, manda el número de las cartas**: una Patrulla 4,5,6
le gana a una 1,2,3 aunque las dos valgan 6, y una Ronda de 5 le gana a una
de 3 aunque las dos valgan 1. Qué carta decide según el canto:

- **Ronda**: el valor del par (la carta suelta no influye).
- **Trivilín**: el valor del trío.
- **Patrulla**: la carta más alta de la escalera.
- **Vigía**: el par, y si también empata, la carta suelta.
- **Registro, Registrico, Casa Chica, Casa Grande**: composición fija, dos
  iguales están siempre empatados.

Si aun así hay empate exacto entre **rivales**, se pisan y no anota ninguno.
Si el empate es entre los dos de una misma pareja, la pareja lo cobra una
sola vez.

Todo esto se resuelve **al cerrar la mano**, cuando ya se declararon todos
los cantos posibles. Declarar no da puntos en el momento.

## Turno de juego

Empieza el jugador a la derecha de quien repartió, sentido antihorario
(igual que el dominó). En tu turno juegas una carta. Si esa carta coincide en
valor con alguna de la mesa, **captura**; si no, se queda en la mesa.

### Capturar

Al capturar te llevas **todas** las cartas de la mesa de ese valor (no solo
una) más la que jugaste, y sigues arrastrando en **escalera** hacia arriba
mientras la mesa tenga el valor siguiente: capturas el 1, y si hay 2 te lo
llevas, y si hay 3 también, hasta que falte el siguiente. Como no hay 8 ni 9,
después del 7 viene el 10 (una escalera puede ser 6,7,10,11,12). La escalera
es **obligatoria**: no se puede cortar antes para no limpiar la mesa.

Hay dos formas de capturar, y solo una da puntos por el valor:

- **Caída**: capturar con el mismo valor de la carta que **acaba de lanzar el
  jugador anterior**. Le "caes" encima. Suma:

  | Valor | Puntos |
  |---|---|
  | 1 a 7 | 1 |
  | 10 | 2 |
  | 11 | 3 |
  | 12 | 4 |

- **Recoger**: capturar cualquier otra carta que ya estaba en la mesa. No
  suma puntos de valor, solo te llevas las cartas (que cuentan al final).

El primero en jugar de la mano nunca puede hacer caída: las 4 cartas de mesa
no las lanzó nadie. Y después de una captura tampoco queda carta viva, así
que el siguiente solo puede recoger o lanzar.

### Mesa

Si la captura deja la mesa **vacía del todo**, son 4 puntos más, se llame
caída o recoger. Los puntos se **suman**: recoger limpiando la mesa son 4;
caer con un 12 y limpiar la mesa son 4 + 4 = 8.

## Fin de la mano

Cuando se acaba el mazo y todos agotan sus cartas, quien hizo la última
captura se lleva lo que quede suelto en la mesa. Cada jugador (o pareja, en 4p) cuenta
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

## Decisiones cerradas en la Fase 1

Las dudas que quedaron abiertas en la planeación, ya resueltas con Emilio y
cubiertas por tests:

1. **Caída con mesa**: es aditivo. Los puntos de la caída MÁS 4 por dejar la
   mesa vacía. La cifra "5" del original es el caso común (caída de 1 a 7).
2. **Patrulla**: cualquier palo. Del mismo palo sería tan raro que el canto
   quedaría muerto frente al Registro, que vale más.
3. **Una carta en dos cantos a la vez**: no puede pasar. Con 3 cartas nunca
   se forman dos cantos distintos — Ronda y Vigía exigen par, Patrulla exige
   tres valores distintos, y las manos con nombre propio (Registro, Casa
   Chica…) son composiciones exactas. Cuando una mano encaja en dos
   definiciones (1,12,12 es Casa Grande y Ronda de 12) vale la de más puntos,
   sin que el jugador elija.

## Ganar

La partida se acaba en el instante en que un equipo llega a la meta, incluso
a mitad de mano. Si al cerrar la mano dos equipos la cruzan a la vez con el
**mismo** puntaje, no hay ganador y se juega otra mano: hay que ganar por
delante.
