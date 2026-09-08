import { scatterTrees } from "../world/scatter";
import {
  type Collider,
  type StructureData,
  type Vec3,
  type WorldState,
} from "../core/types";
import type { WorldGenerator } from "../world/generator";
export function structureCollider(b: StructureData): Collider | null {
  const angle = Math.round(b.rotation / (Math.PI / 2)) % 2;
  const dimension: Record<string, [number, number, number]> = {
    wall: [4, 0.22, 3],
    window: [4, 0.22, 3],
    door: [4, 0.22, 3],
    fence: [4, 0.2, 1.5],
    gate: [4, 0.22, 2.5],
    storage: [1.4, 0.85, 1],
    workbench: [2.2, 1, 1],
    generator: [1.2, 0.8, 1],
    fridge: [0.8, 0.8, 1.6],
  };
  const d = dimension[b.kind];
  if (
    !d ||
    b.health <= 0 ||
    ((b.kind === "door" || b.kind === "gate") && b.active)
  )
    return null;
  const [a, c, h] = d,
    w = angle ? c : a,
    depth = angle ? a : c;
  return {
    id: b.id,
    minX: b.position.x - w / 2,
    maxX: b.position.x + w / 2,
    minZ: b.position.z - depth / 2,
    maxZ: b.position.z + depth / 2,
    minY: b.position.y,
    maxY: b.position.y + h,
  };
}
export class CollisionWorld {
  private staticColliders: Collider[];
  private trees = new Map<string, Collider[]>();
  constructor(
    private gen: WorldGenerator,
    private state: WorldState,
  ) {
    this.staticColliders = gen.pois.flatMap((p) => gen.collidersFor(p));
  }
  private treeColliders(x: number, z: number, radius: number): Collider[] {
    const result: Collider[] = [];
    for (
      let cz = Math.floor((z - radius) / 256);
      cz <= Math.floor((z + radius) / 256);
      cz++
    )
      for (
        let cx = Math.floor((x - radius) / 256);
        cx <= Math.floor((x + radius) / 256);
        cx++
      ) {
        const key = cx + "," + cz;
        let colliders = this.trees.get(key);
        if (!colliders) {
          colliders = scatterTrees(this.gen, cx, cz).map((t) => ({
            id: t.id,
            minX: t.position.x - 0.24 * t.scale.x,
            maxX: t.position.x + 0.24 * t.scale.x,
            minZ: t.position.z - 0.24 * t.scale.x,
            maxZ: t.position.z + 0.24 * t.scale.x,
            minY: t.position.y,
            maxY: t.position.y + 4,
          }));
          this.trees.set(key, colliders);
        }
        result.push(...colliders);
      }
    if (this.trees.size > 40) {
      const p = this.state.player.position;
      for (const key of this.trees.keys()) {
        const [cx, cz] = key.split(",").map(Number);
        if (Math.abs(cx! * 256 - p.x) > 700 || Math.abs(cz! * 256 - p.z) > 700)
          this.trees.delete(key);
      }
    }
    return result;
  }
  nearby(x: number, z: number, radius = 30): Collider[] {
    return [
      ...this.staticColliders,
      ...this.treeColliders(x, z, radius),
      ...this.state.vehicles
        .filter((v) => v.id !== this.state.player.vehicle)
        .map((v): Collider => {
          const sx =
              Math.abs(Math.cos(v.yaw)) * 0.98 +
              Math.abs(Math.sin(v.yaw)) * 2.2,
            sz =
              Math.abs(Math.sin(v.yaw)) * 0.98 +
              Math.abs(Math.cos(v.yaw)) * 2.2;
          return {
            id: v.id,
            minX: v.position.x - sx,
            maxX: v.position.x + sx,
            minZ: v.position.z - sz,
            maxZ: v.position.z + sz,
            minY: v.position.y + 0.25,
            maxY: v.position.y + 1.95,
          };
        }),
      ...this.state.structures
        .map(structureCollider)
        .filter((c): c is Collider => c !== null),
    ].filter(
      (c) =>
        Math.abs((c.minX + c.maxX) / 2 - x) < radius + 12 &&
        Math.abs((c.minZ + c.maxZ) / 2 - z) < radius + 12 &&
        !this.state.destroyed.includes(c.id) &&
        (!c.door || !this.state.doors[c.door]),
    );
  }
  blocked(
    x: number,
    y: number,
    z: number,
    radius = 0.32,
    height = 1.7,
  ): boolean {
    return this.nearby(x, z, 3).some(
      (c) =>
        x + radius > c.minX &&
        x - radius < c.maxX &&
        z + radius > c.minZ &&
        z - radius < c.maxZ &&
        y + height > c.minY + 0.2 &&
        y < c.maxY - 0.05,
    );
  }
  move(
    position: Vec3,
    dx: number,
    dz: number,
    radius = 0.32,
    height = 1.7,
  ): Vec3 {
    let x = position.x,
      z = position.z;
    const stepCount = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
    for (let i = 0; i < stepCount; i++) {
      const nx = x + dx / stepCount,
        nz = z + dz / stepCount;
      if (
        Math.abs(nx) < 2010 &&
        !this.blocked(nx, position.y, z, radius, height)
      )
        x = nx;
      if (
        Math.abs(nz) < 2010 &&
        !this.blocked(x, position.y, nz, radius, height)
      )
        z = nz;
    }
    return { x, y: position.y, z };
  }
  ground(x: number, z: number, y = Infinity): number {
    let h = this.gen.height(x, z);
    for (const c of this.nearby(x, z, 0.4)) {
      if (
        c.maxY - c.minY <= 1.6 &&
        x > c.minX - 0.1 &&
        x < c.maxX + 0.1 &&
        z > c.minZ - 0.1 &&
        z < c.maxZ + 0.1 &&
        c.maxY < y + 0.55
      )
        h = Math.max(h, c.maxY);
    }
    for (const b of this.state.structures) {
      if (b.health <= 0) continue;
      const dx = Math.abs(x - b.position.x),
        dz = Math.abs(z - b.position.z);
      if (
        ["foundation", "floor", "roof"].includes(b.kind) &&
        dx < 2.05 &&
        dz < 2.05
      ) {
        const top = b.position.y + (b.kind === "roof" ? 3.1 : 0.22);
        if (top < y + 0.55) h = Math.max(h, top);
      }
      if (b.kind === "stairs" && dx < 1.2 && dz < 2)
        h = Math.max(h, b.position.y + (0.5 - dz / 4) * 0.5);
    }
    return h;
  }
  ray(
    origin: Vec3,
    direction: Vec3,
    length: number,
    ignore?: string,
  ): { distance: number; collider: Collider } | null {
    let nearest = length;
    let found: Collider | null = null;
    for (const c of this.nearby(origin.x, origin.z, length)) {
      if (c.id === ignore) continue;
      let tmin = 0,
        tmax = nearest;
      const axes: [
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
      ] = [
        [origin.x, direction.x, c.minX, c.maxX],
        [origin.y, direction.y, c.minY, c.maxY],
        [origin.z, direction.z, c.minZ, c.maxZ],
      ];
      let hit = true;
      for (const [o, d, min, max] of axes) {
        if (Math.abs(d) < 1e-7) {
          if (o < min || o > max) {
            hit = false;
            break;
          }
        } else {
          let a = (min - o) / d,
            b = (max - o) / d;
          if (a > b) [a, b] = [b, a];
          tmin = Math.max(tmin, a);
          tmax = Math.min(tmax, b);
          if (tmin > tmax) {
            hit = false;
            break;
          }
        }
      }
      if (hit && tmin < nearest) {
        nearest = tmin;
        found = c;
      }
    }
    return found ? { distance: nearest, collider: found } : null;
  }
  visible(a: Vec3, b: Vec3): boolean {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z,
      len = Math.hypot(dx, dy, dz);
    return (
      len < 0.01 ||
      !this.ray(a, { x: dx / len, y: dy / len, z: dz / len }, len - 0.15)
    );
  }
}
