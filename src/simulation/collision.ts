import { scatterTrees } from "../world/scatter";
import { openingWreckColliders } from "../rendering/environment-props";
import { storyColliders } from "../world/story-geometry";
import { stairColliders } from "../world/building-geometry";
import {
  facilityColliders,
  facilityOrigin,
  insideFacility,
} from "../world/facility";
import { orientedBoxContains } from "./doors";
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
    material: ["generator", "fridge"].includes(b.kind) ? "metal" : "wood",
  };
}
export class CollisionWorld {
  queries = 0;
  dynamicObjects: () => Collider[] = () => [];
  dynamicDoors: (x: number, z: number, radius: number) => Collider[] = () => [];
  private staticColliders: Collider[];
  private trees = new Map<string, Collider[]>();
  private destroyedTreeCount = -1;
  private destroyedTrees = new Set<string>();
  constructor(
    private gen: WorldGenerator,
    private state: WorldState,
  ) {
    this.staticColliders = [
      ...gen.pois.flatMap((p) => gen.collidersFor(p)),
      ...facilityColliders(gen),
      ...openingWreckColliders(),
    ];
  }
  private treeColliders(x: number, z: number, radius: number): Collider[] {
    if (this.destroyedTreeCount !== this.state.destroyed.length) {
      this.destroyedTreeCount = this.state.destroyed.length;
      this.destroyedTrees = new Set(
        this.state.destroyed.filter((id) => id.startsWith("tree:")),
      );
    }
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
            material: "wood",
          }));
          this.trees.set(key, colliders);
        }
        result.push(
          ...colliders.filter(
            (collider) => !this.destroyedTrees.has(collider.id),
          ),
        );
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
    this.queries++;
    return [
      ...this.staticColliders.filter(
        (c) =>
          c.id !== "pine-3:shelf" &&
          (!c.door || !this.state.doorStates[c.door]),
      ),
      ...this.dynamicDoors(x, z, radius),
      ...this.dynamicObjects(),
      ...storyColliders(this.gen, this.state),
      ...this.state.structures.flatMap(stairColliders),
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
            material: "metal",
          };
        }),
      ...this.state.structures
        .filter(
          (b) =>
            !(["door", "gate"].includes(b.kind) && this.state.doorStates[b.id]),
        )
        .map(structureCollider)
        .filter((c): c is Collider => c !== null),
    ].filter(
      (c) =>
        Math.abs((c.minX + c.maxX) / 2 - x) < radius + 12 &&
        Math.abs((c.minZ + c.maxZ) / 2 - z) < radius + 12 &&
        !this.state.destroyed.includes(c.id) &&
        (!c.door ||
          !!this.state.doorStates[c.door] ||
          !this.state.doors[c.door]),
    );
  }
  blocked(
    x: number,
    y: number,
    z: number,
    radius = 0.32,
    height = 1.7,
  ): boolean {
    return this.nearby(x, z, 3).some((c) =>
      c.id.includes(":stair-step:") && c.maxY - y <= 0.41
        ? false
        : c.obb
          ? orientedBoxContains(c, { x, y, z }, radius, height)
          : x + radius > c.minX &&
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
    let h = insideFacility(this.gen, x, y, z)
      ? facilityOrigin(this.gen).y
      : this.gen.height(x, z);
    for (const c of this.nearby(x, z, 0.4)) {
      if (
        (c.maxY - c.minY <= 1.6 || c.id.includes(":stair-step:")) &&
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
    }
    return h;
  }
  ray(
    origin: Vec3,
    direction: Vec3,
    length: number,
    ignore?: string,
  ): { distance: number; collider: Collider; normal: Vec3 } | null {
    let nearest = length;
    let found: Collider | null = null;
    let normal: Vec3 = { x: -direction.x, y: -direction.y, z: -direction.z };
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
      if (c.obb) {
        const o = c.obb,
          dx = origin.x - o.x,
          dz = origin.z - o.z;
        const cosine = Math.cos(o.yaw),
          sine = Math.sin(o.yaw);
        axes[0] = [
          dx * cosine - dz * sine,
          direction.x * cosine - direction.z * sine,
          -o.halfWidth,
          o.halfWidth,
        ];
        axes[2] = [
          dx * sine + dz * cosine,
          direction.x * sine + direction.z * cosine,
          -o.halfDepth,
          o.halfDepth,
        ];
      }
      let hit = true;
      let face: Vec3 = { x: -direction.x, y: -direction.y, z: -direction.z };
      for (let axis = 0; axis < axes.length; axis++) {
        const [o, d, min, max] = axes[axis]!;
        if (Math.abs(d) < 1e-7) {
          if (o < min || o > max) {
            hit = false;
            break;
          }
        } else {
          let a = (min - o) / d,
            b = (max - o) / d;
          if (a > b) [a, b] = [b, a];
          if (a >= tmin) {
            tmin = a;
            face = { x: 0, y: 0, z: 0 };
            face[(["x", "y", "z"] as const)[axis]!] = -Math.sign(d);
          }
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
        if (c.obb) {
          const cosine = Math.cos(c.obb.yaw),
            sine = Math.sin(c.obb.yaw);
          normal = {
            x: face.x * cosine + face.z * sine,
            y: face.y,
            z: -face.x * sine + face.z * cosine,
          };
        } else normal = face;
      }
    }
    return found ? { distance: nearest, collider: found, normal } : null;
  }
  visible(a: Vec3, b: Vec3): boolean {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z,
      len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    if (this.ray(a, { x: dx / len, y: dy / len, z: dz / len }, len - 0.15))
      return false;
    const steps = Math.min(40, Math.ceil(len / 3));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (
        a.y + dy * t <
        (insideFacility(this.gen, a.x + dx * t, a.y + dy * t, a.z + dz * t)
          ? facilityOrigin(this.gen).y
          : this.gen.height(a.x + dx * t, a.z + dz * t)) +
          0.06
      )
        return false;
    }
    return true;
  }
  terrainRay(
    origin: Vec3,
    direction: Vec3,
    length: number,
  ): { distance: number; collider: Collider; normal: Vec3 } | null {
    if (insideFacility(this.gen, origin.x, origin.y, origin.z)) return null;
    const steps = Math.max(1, Math.ceil(length / 0.5));
    let previous = 0;
    for (let n = 1; n <= steps; n++) {
      const t = (n / steps) * length,
        x = origin.x + direction.x * t,
        z = origin.z + direction.z * t;
      if (origin.y + direction.y * t <= this.gen.height(x, z)) {
        let low = previous,
          high = t;
        for (let i = 0; i < 8; i++) {
          const mid = (low + high) / 2;
          if (
            origin.y + direction.y * mid <=
            this.gen.height(
              origin.x + direction.x * mid,
              origin.z + direction.z * mid,
            )
          )
            high = mid;
          else low = mid;
        }
        const px = origin.x + direction.x * high,
          pz = origin.z + direction.z * high,
          py = this.gen.height(px, pz);
        const nx =
            this.gen.height(px - 0.1, pz) - this.gen.height(px + 0.1, pz),
          nz = this.gen.height(px, pz - 0.1) - this.gen.height(px, pz + 0.1),
          length = Math.hypot(nx, 0.2, nz);
        return {
          distance: high,
          normal: { x: nx / length, y: 0.2 / length, z: nz / length },
          collider: {
            id: "terrain",
            minX: px - 0.05,
            maxX: px + 0.05,
            minZ: pz - 0.05,
            maxZ: pz + 0.05,
            minY: py - 0.1,
            maxY: py,
            material: "dirt",
          },
        };
      }
      previous = t;
    }
    return null;
  }
}
