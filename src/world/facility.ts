import type { Collider, Vec3 } from "../core/types";
import type { WorldGenerator } from "./generator";
export const FACILITY = {
  halfWidth: 5.4,
  front: -5.5,
  back: 11,
  depth: -8,
  height: 3.4,
};
export function facilityOrigin(gen: WorldGenerator): Vec3 {
  const poi = gen.pois.find((p) => p.id === "lab-0")!;
  return { x: poi.x, y: gen.poiHeight(poi) + FACILITY.depth, z: poi.z };
}
export function insideFacility(
  gen: WorldGenerator,
  x: number,
  y: number,
  z: number,
): boolean {
  const p = facilityOrigin(gen);
  return (
    Math.abs(x - p.x) < FACILITY.halfWidth + 0.1 &&
    z - p.z > FACILITY.front - 0.1 &&
    z - p.z < FACILITY.back + 0.1 &&
    y < p.y + FACILITY.height + 0.5
  );
}
export function facilityColliders(gen: WorldGenerator): Collider[] {
  const p = facilityOrigin(gen);
  const box = (
    id: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ): Collider => ({
    id: "facility:" + id,
    minX: p.x + x - w / 2,
    maxX: p.x + x + w / 2,
    minY: p.y + y - h / 2,
    maxY: p.y + y + h / 2,
    minZ: p.z + z - d / 2,
    maxZ: p.z + z + d / 2,
    material: "concrete",
  });
  const out = [
    box("floor", 0, -0.15, 2.75, 11, 0.3, 16.5),
    box("ceiling", 0, 3.5, 2.75, 11, 0.3, 16.5),
    box("front", 0, 1.7, -5.5, 11, 3.4, 0.3),
    box("back", 0, 1.7, 11, 11, 3.4, 0.3),
    box("left", -5.4, 1.7, 2.75, 0.3, 3.4, 16.5),
    box("right", 5.4, 1.7, 2.75, 0.3, 3.4, 16.5),
  ];
  for (const side of [-1, 1])
    out.push(box("vault-wall" + side, side * 3.3, 1.7, 5, 4.3, 3.4, 0.18));
  for (const side of [-1, 1])
    for (const z of [7.2, 9.5])
      out.push(box("chamber" + side + z, side * 3.7, 1.2, z, 1.2, 2.4, 1.7));
  return out;
}
