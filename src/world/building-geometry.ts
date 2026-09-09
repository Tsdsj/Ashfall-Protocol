import type { Collider, StructureData } from "../core/types";
export const STAIRS = { width: 2, run: 4, rise: 3, steps: 10 };
export function stairColliders(b: StructureData): Collider[] {
  if (b.kind !== "stairs" || b.health <= 0) return [];
  return Array.from({ length: STAIRS.steps }, (_, index) => {
    const height = ((index + 1) / STAIRS.steps) * STAIRS.rise,
      z = -STAIRS.run / 2 + ((index + 0.5) / STAIRS.steps) * STAIRS.run,
      c = Math.cos(b.rotation),
      s = Math.sin(b.rotation),
      px = b.position.x + s * z,
      pz = b.position.z + c * z,
      hx =
        (Math.abs(c) * STAIRS.width) / 2 +
        (Math.abs(s) * STAIRS.run) / STAIRS.steps / 2,
      hz =
        (Math.abs(s) * STAIRS.width) / 2 +
        (Math.abs(c) * STAIRS.run) / STAIRS.steps / 2;
    return {
      id: b.id + ":stair-step:" + index,
      minX: px - hx,
      maxX: px + hx,
      minZ: pz - hz,
      maxZ: pz + hz,
      minY: b.position.y,
      maxY: b.position.y + height,
      material: "wood" as const,
    };
  });
}
