# Créditos

## La baraja

Las cartas son la baraja **"Naipes Libres"**, de **Basquetteur y Germarquezm**,
publicada en Wikimedia Commons bajo licencia
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.es).

Los archivos viven en `client/public/cartas/` y **sí van al repositorio**:
son ~1,6 MB y hacen falta para que el despliegue en Vercel funcione. Bajarlas
de Commons en cada build sería frágil y además abusivo con ellos.

Para (re)completarlas:

```bash
cd client
npm run cartas
```

Son 41 archivos —las 40 cartas más el reverso— en `{palo}-{valor}.png`, unos
1,9 MB en total.

El script **no le pregunta nada a la API** de Commons: la ruta de cada archivo
sale del MD5 de su nombre, así que son 41 descargas y ni una llamada de más.
Preguntar carta por carta era justo lo que hacía saltar el límite de peticiones
y dejaba la baraja a medias. Aun así va con calma y es reanudable: si se
interrumpe, se vuelve a lanzar y sigue donde iba.

Si falta alguno, esa carta se dibuja en SVG dentro del propio código en vez de
salir rota. El dibujo no es tan bonito, pero una carta rota no se puede ni
leer, y así el juego nunca se queda a medias.

> Existe una versión en SVG de esta misma baraja
> ([gjenkins20/spanish-playing-cards-svg](https://github.com/gjenkins20/spanish-playing-cards-svg)),
> pero está vectorizada a lo bruto: **1,8 MB por carta y 11 MB el reverso**,
> más de 80 MB en total. Descartada para web. Los PNG originales pesan 1,9 MB
> entre las 41.

**Qué obliga la licencia**: hay que dar crédito a los autores y decir la
licencia — esto que estás leyendo. Y si se modifican las imágenes, hay que
publicarlas con la misma licencia. El código del juego es aparte: usar las
imágenes no lo convierte en obra derivada de ellas.
