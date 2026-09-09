import type { Vec3, WorldState } from "../core/types";
import { clamp } from "../core/types";
import { REGIONS, WorldGenerator } from "../world/generator";
export const TERRAIN_REVISION = "terrain:graded-v1";
/** The exact pre-grading height contract, used only when upgrading a save. */
export function legacyTerrainHeight(
  gen: WorldGenerator,
  x: number,
  z: number,
): number {
  let h = gen.baseHeight(x, z);
  const nearStart = Math.hypot(x, z - 30);
  if (nearStart < 170) h *= clamp((nearStart - 60) / 110, 0, 1);
  const road = gen.roadDistance(x, z);
  if (road < 14)
    h =
      h * clamp((road - 5) / 9, 0, 1) +
      (Math.hypot(x, z - 30) < 150 ? 0 : gen.baseHeight(x, z)) *
        (1 - clamp((road - 5) / 9, 0, 1));
  for (const p of gen.pois) {
    const d = Math.max(
      Math.abs(x - p.x) - p.width / 2,
      Math.abs(z - p.z) - p.depth / 2,
    );
    if (d < 9) {
      const level = gen.poiHeight(p);
      const t = clamp(d / 9, 0, 1);
      h = level + (h - level) * t;
    }
  }
  const city = REGIONS.find((r) => r.id === "city")!;
  const urbanDistance = Math.max(
    Math.abs(x - city.x) - 112,
    Math.abs(z - (city.z + 54)) - 108,
  );
  if (urbanDistance < 40) {
    const level = gen.baseHeight(city.x, city.z + 54),
      t = clamp(urbanDistance / 40, 0, 1);
    h = level + (h - level) * t;
  }
  const lake = gen.lakeDistance(x, z);
  if (lake < 1.25)
    h =
      h * clamp((lake - 1) / 0.25, 0, 1) +
      (-8 + Math.min(lake, 1) * 2) * (1 - clamp((lake - 1) / 0.25, 0, 1));
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > 1870) h += (edge - 1870) * 0.6;
  return h;
}

export function migrateTerrain(state: WorldState): void {
  if (state.flags.includes(TERRAIN_REVISION)) return;
  const gen = new WorldGenerator(state.seed);
  const delta = (p: Vec3) =>
    gen.height(p.x, p.z) - legacyTerrainHeight(gen, p.x, p.z);
  const original = state.structures.map((b) => ({
    ...b,
    position: { ...b.position },
  }));
  const moves = new Map<string, number>();
  const foundations = original.filter((b) => b.kind === "foundation");
  for (const first of foundations) {
    if (moves.has(first.id)) continue;
    const group = [first],
      visited = new Set([first.id]);
    for (let i = 0; i < group.length; i++) {
      const current = group[i]!;
      for (const next of foundations) {
        if (
          !visited.has(next.id) &&
          Math.hypot(
            next.position.x - current.position.x,
            next.position.z - current.position.z,
          ) <= 4.01
        ) {
          visited.add(next.id);
          group.push(next);
        }
      }
    }
    // A connected camp is one rigid assembly; never tear adjacent floors apart.
    const lift = Math.max(...group.map((b) => delta(b.position)));
    for (const b of group) moves.set(b.id, lift);
  }
  for (const b of original) {
    const base =
      b.kind === "foundation"
        ? b
        : original.find(
            (other) =>
              other.kind === "foundation" &&
              Math.hypot(
                other.position.x - b.position.x,
                other.position.z - b.position.z,
              ) < 3,
          );
    moves.set(b.id, base ? moves.get(base.id)! : delta(b.position));
  }
  for (const b of state.structures) b.position.y += moves.get(b.id)!;
  const moved = new Set<Vec3>();
  const shiftSurface = (p: Vec3) => {
    if (moved.has(p)) return;
    moved.add(p);
    // Authored underground interiors use their own floor, never terrain height.
    if (p.y < legacyTerrainHeight(gen, p.x, p.z) - 2) return;
    const support = original.find(
      (b) =>
        Math.hypot(b.position.x - p.x, b.position.z - p.z) < 2.5 &&
        p.y >= b.position.y - 0.2 &&
        p.y <= b.position.y + 3.5,
    );
    p.y += support ? moves.get(support.id)! : delta(p);
  };
  shiftSurface(state.player.position);
  shiftSurface(state.player.spawn);
  if (state.waypoint) shiftSurface(state.waypoint);
  for (const v of state.vehicles) shiftSurface(v.position);
  for (const c of Object.values(state.containers))
    if (c.type === "dropped") shiftSurface(c.position);
  for (const a of Object.values(state.actors)) {
    shiftSurface(a.position);
    shiftSurface(a.home);
    shiftSurface(a.target);
    if (a.traversal) {
      shiftSurface(a.traversal.from);
      shiftSurface(a.traversal.to);
    }
  }
  for (const e of state.events) shiftSurface(e.position);
  state.flags.push(TERRAIN_REVISION);
}
