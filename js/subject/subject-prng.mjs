/** Deterministic PRNG for reproducible Subject FX (preview/export parity). */
export function hashSeed(parts) {
  const text = parts.map((part) => String(part ?? '')).join('\u001f');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed) {
  let state = hashSeed([seed]) || 1;
  return function next() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function seededRandom(seed, ...parts) {
  const rng = createSeededRandom(hashSeed([seed, ...parts]));
  return rng();
}

export function seededRange(seed, min, max, ...parts) {
  const t = seededRandom(seed, ...parts);
  return min + t * (max - min);
}

export function seededInt(seed, min, max, ...parts) {
  return Math.floor(seededRange(seed, min, max + 0.999999, ...parts));
}
