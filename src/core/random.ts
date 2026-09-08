export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function random(seed: string | number): () => number {
  let a = typeof seed === "string" ? hash(seed) : seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function noise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const n = (a: number, b: number) => {
    let h = Math.imul(a + seed, 374761393) + Math.imul(b, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const a = n(ix, iz),
    b = n(ix + 1, iz),
    c = n(ix, iz + 1),
    d = n(ix + 1, iz + 1);
  const u = smooth(fx),
    v = smooth(fz);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export function choose<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)]!;
}
