import { expect, it } from "vitest";
import { environmentApproaches } from "../src/rendering/environment-props";
import {
  CHUNK_SIZE,
  REGIONS,
  TERRAIN_STEP,
  WorldGenerator,
} from "../src/world/generator";
import { generateTerrainData } from "../src/world/terrain-data";

const seeds = ["ashfall", "terrain-1", "terrain-2", "terrain-3", "terrain-4"];
it("removes the former 150m road elevation discontinuity across seeds", () => {
  for (const seed of seeds) {
    const gen = new WorldGenerator(seed);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
      const point = (r: number) =>
        gen.roadHeight(Math.cos(a) * r, 30 + Math.sin(a) * r);
      expect(Math.abs(point(150.001) - point(149.999))).toBeLessThan(0.002);
      for (const join of [60, 220])
        expect(
          Math.abs(point(join + 0.001) - point(join - 0.001)),
        ).toBeLessThan(0.002);
    }
  }
});
it("preserves legacy POI and city floor levels while flattening the mesh under doorsteps", () => {
  for (const seed of seeds) {
    const gen = new WorldGenerator(seed),
      city = REGIONS.find((r) => r.id === "city")!;
    for (const p of gen.pois) {
      const legacy =
        p.region === "city"
          ? gen.baseHeight(city.x, city.z + 54)
          : Math.hypot(p.x, p.z - 30) < 155
            ? 0
            : gen.baseHeight(p.x, p.z);
      expect(gen.poiHeight(p)).toBe(legacy);
      expect(gen.height(p.x, p.z)).toBeCloseTo(legacy, 8);
      const doorZ = p.z - p.depth / 2 - 1.05;
      for (const x of [
        Math.floor(p.x / TERRAIN_STEP) * TERRAIN_STEP,
        Math.ceil(p.x / TERRAIN_STEP) * TERRAIN_STEP,
      ])
        for (const z of [
          Math.floor(doorZ / TERRAIN_STEP) * TERRAIN_STEP,
          Math.ceil(doorZ / TERRAIN_STEP) * TERRAIN_STEP,
        ])
          expect(gen.height(x, z)).toBeCloseTo(legacy, 8);
    }
  }
});
it("keeps the existing entrance paths graded across representative terrain seeds", () => {
  for (const seed of seeds) {
    const gen = new WorldGenerator(seed);
    const paths = environmentApproaches(gen, gen.pois);
    expect(paths.length).toBeGreaterThan(10);
    for (const path of paths) {
      const dx = path.to[0] - path.from[0],
        dz = path.to[1] - path.from[1],
        length = Math.hypot(dx, dz);
      for (let d = 0; d < length; d += 0.25) {
        const at = (s: number) =>
          gen.height(
            path.from[0] + (dx * s) / length,
            path.from[1] + (dz * s) / length,
          );
        expect(Math.abs(at(d + 0.25) - at(d)) / 0.25).toBeLessThan(0.75);
      }
    }
    // Former narrow platform cliff: 1.5876 rise/run before the grading repair.
    if (seed === "terrain-2") {
      const p = gen.pois.find((p) => p.id === "pine-6")!;
      expect(
        Math.abs(
          gen.height(p.x, 158.4412399701774) -
            gen.height(p.x, 158.3412399701774),
        ) / 0.1,
      ).toBeLessThan(1);
    }
  }
});
it("generates identical heights on shared chunk vertices, including negative coordinates", () => {
  const gen = new WorldGenerator("terrain-2"),
    n = CHUNK_SIZE / TERRAIN_STEP;
  for (const [cx, cz] of [
    [-1, 0],
    [0, 0],
    [2, 1],
  ]) {
    const a = generateTerrainData(gen, cx!, cz!),
      right = generateTerrainData(gen, cx! + 1, cz!),
      next = generateTerrainData(gen, cx!, cz! + 1);
    for (let i = 0; i <= n; i++) {
      expect(a.positions[(i * (n + 1) + n) * 3 + 1]).toBe(
        right.positions[i * (n + 1) * 3 + 1],
      );
      expect(a.positions[(n * (n + 1) + i) * 3 + 1]).toBe(
        next.positions[i * 3 + 1],
      );
    }
  }
});
