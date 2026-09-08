import { noise } from "../core/random";
import type { WorldGenerator } from "./generator";
export function generateTerrainData(
  gen: WorldGenerator,
  cx: number,
  cz: number,
) {
  const n = 32,
    size = 256,
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
