import { expect, it } from "vitest";
import { ColliderIndex } from "../src/simulation/collider-index";
import type { Collider } from "../src/core/types";
it("matches ordered full scans across cell boundaries, negative coordinates and long rays", () => {
  const colliders: Collider[] = Array.from({ length: 1200 }, (_, i) => {
    const x = ((i * 37) % 997) - 500,
      z = ((i * 71) % 991) - 500;
    return {
      id: String(i),
      minX: x - 2,
      maxX: x + 2,
      minZ: z - 2,
      maxZ: z + 2,
      minY: 0,
      maxY: 3,
      material: "wood",
    };
  });
  const index = new ColliderIndex(colliders);
  for (const x of [-500, -32.01, -32, -0.01, 0, 31.99, 32, 499])
    for (const z of [-33, 0, 32, 450])
      for (const radius of [0, 0.4, 12.4, 32, 100, 10000]) {
        const expected = colliders.filter(
          (c) =>
            Math.abs((c.minX + c.maxX) / 2 - x) < radius &&
            Math.abs((c.minZ + c.maxZ) / 2 - z) < radius,
        );
        expect(index.query(x, z, radius).map((c) => c.id)).toEqual(
          expected.map((c) => c.id),
        );
      }
});
