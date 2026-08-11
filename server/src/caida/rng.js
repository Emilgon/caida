// Aleatoriedad con semilla. El motor nunca llama a Math.random(): la unica
// vez que se usa es para inventar una semilla si no nos dan una, y esa
// semilla queda guardada en la partida. Con la semilla y la lista de jugadas
// se puede reproducir una partida entera para depurar un bug reportado.

// mulberry32, en version "sin estado escondido": el estado es un uint32 que
// vive en el objeto de la partida, asi que structuredClone lo copia solo.
function step(state) {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { state: a, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

export function createRng(seed) {
  let state = seed >>> 0;
  return {
    get state() {
      return state >>> 0;
    },
    next() {
      const result = step(state);
      state = result.state;
      return result.value;
    },
    int(n) {
      return Math.floor(this.next() * n);
    },
  };
}

// Fisher-Yates. Devuelve un arreglo nuevo; no toca el que recibe.
export function shuffle(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// FNV-1a, para poder usar una semilla legible ("mesa-de-prueba") en los tests.
function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function normalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  if (typeof seed === "string" && seed.length > 0) return hashString(seed);
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}
