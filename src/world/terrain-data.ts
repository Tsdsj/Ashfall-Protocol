import { noise } from "../core/random";
import type { WorldGenerator } from "./generator";
import { CHUNK_SIZE, TERRAIN_STEP } from "./generator";
export const HORIZON_SIZE = 4608;
export const HORIZON_SEGMENTS = 72;
export function horizonIndices(loaded: ReadonlySet<string>): Uint32Array {
  const result: number[] = [],
    n = HORIZON_SEGMENTS,
    step = HORIZON_SIZE / n;
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const cx = Math.floor(((x + 0.5) * step - HORIZON_SIZE / 2) / CHUNK_SIZE);
      const cz = Math.floor(((z + 0.5) * step - HORIZON_SIZE / 2) / CHUNK_SIZE);
      if (loaded.has(`${cx},${cz}`)) continue;
      const a = z * (n + 1) + x;
      result.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
    }
  return new Uint32Array(result);
}
export function generateTerrainData(
  gen: WorldGenerator,
  cx: number,
  cz: number,
) {
  const n = CHUNK_SIZE / TERRAIN_STEP,
    size = CHUNK_SIZE,
    positions = new Float32Array((n + 1) * (n + 1) * 3),
    uvs = new Float32Array((n + 1) * (n + 1) * 2),
    colors = new Float32Array((n + 1) * (n + 1) * 4),
    indices = new Uint32Array(n * n * 6);
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) {
      const i = z * (n + 1) + x,
        wx = cx * size + (x * size) / n,
        wz = cz * size + (z * size) / n;
      positions.set([wx, gen.height(wx, wz), wz], i * 3);
      uvs.set([wx / 6, wz / 6], i * 2);
      const color = 0.72 + noise(wx / 31, wz / 31, gen.seedNumber + 77) * 0.55;
      const road = gen.roadDistance(wx, wz) < 7;
      colors.set(
        road ? [0.67, 0.67, 0.64, 1] : [color, color * 0.99, color * 0.84, 1],
        i * 4,
      );
    }
  let at = 0;
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const a = z * (n + 1) + x;
      indices.set([a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2], at);
      at += 6;
    }
  return { positions, indices, uvs, colors };
}
