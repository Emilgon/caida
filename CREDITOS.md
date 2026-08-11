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

Va despacio a propósito —Commons corta las descargas apuradas con un 429— y
es reanudable: si se interrumpe, se vuelve a lanzar y sigue donde iba. Son 41
archivos, las 40 cartas más el reverso, en `{palo}-{valor}.png`.

Si falta alguno, esa carta se dibuja en SVG dentro del propio código en vez de
salir rota. El dibujo no es tan bonito, pero una carta rota no se puede ni
leer, y así el juego nunca se queda a medias.

**Qué obliga la licencia**: hay que dar crédito a los autores y decir la
licencia — esto que estás leyendo. Y si se modifican las imágenes, hay que
publicarlas con la misma licencia. El código del juego es aparte: usar las
imágenes no lo convierte en obra derivada de ellas.
