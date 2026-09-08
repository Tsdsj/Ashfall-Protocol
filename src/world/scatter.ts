import { random } from "../core/random";
import type { Vec3 } from "../core/types";
import type { WorldGenerator } from "./generator";
export interface TreeInstance {
  id: string;
  position: Vec3;
  variant: number;
  scale: Vec3;
  yaw: number;
}
export function scatterTrees(
  gen: WorldGenerator,
  cx: number,
  cz: number,
): TreeInstance[] {
  const rng = random(gen.seed + ":trees:" + cx + "," + cz),
    trees: TreeInstance[] = [];
  for (let n = 0; n < 235; n++) {
    const x = cx * 256 + rng() * 256,
      z = cz * 256 + rng() * 256,
      size = 0.64 + rng() * 0.66;
    if (gen.isClearing(x, z) || Math.abs(x) > 2030 || Math.abs(z) > 2030)
      continue;
    const y = gen.height(x, z);
    if (gen.isWater(x, z)) continue;
    const variant = Math.floor(rng() * 3);
    trees.push({
      id: `tree:${cx},${cz}:${n}`,
      position: { x, y, z },
      variant,
      scale: { x: size, y: size * (0.85 + rng() * 0.3), z: size },
      yaw: rng() * Math.PI * 2,
    });
  }
  return trees;
}
