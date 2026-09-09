import {
  clamp,
  distance,
  type Collider,
  type DoorData,
  type Vec3,
} from "../core/types";
import { countItem } from "./inventory";
import type { SimContext } from "./context";

export interface DoorGeometry {
  id: string;
  hinge: Vec3;
  width: number;
  height: number;
  yaw: number;
  kind: DoorData["kind"];
}
export function orientedBoxContains(
  c: Collider,
  point: Vec3,
  radius: number,
  height: number,
): boolean {
  if (point.y + height <= c.minY + 0.02 || point.y >= c.maxY - 0.02)
    return false;
  if (!c.obb)
    return (
      point.x + radius > c.minX &&
      point.x - radius < c.maxX &&
      point.z + radius > c.minZ &&
      point.z - radius < c.maxZ
    );
  const o = c.obb,
    dx = point.x - o.x,
    dz = point.z - o.z;
  const x = dx * Math.cos(o.yaw) - dz * Math.sin(o.yaw),
    z = dx * Math.sin(o.yaw) + dz * Math.cos(o.yaw);
  const ox = Math.max(0, Math.abs(x) - o.halfWidth),
    oz = Math.max(0, Math.abs(z) - o.halfDepth);
  return ox * ox + oz * oz < radius * radius;
}
export function doorCollider(
  geometry: DoorGeometry,
  progress: number,
): Collider {
  const yaw = geometry.yaw - progress * Math.PI * 0.52,
    half = geometry.width / 2;
  const x = geometry.hinge.x + Math.cos(yaw) * half,
    z = geometry.hinge.z - Math.sin(yaw) * half;
  const sx = Math.abs(Math.cos(yaw)) * half + Math.abs(Math.sin(yaw)) * 0.065;
  const sz = Math.abs(Math.sin(yaw)) * half + Math.abs(Math.cos(yaw)) * 0.065;
  return {
    id: geometry.id + ":door",
    door: geometry.id,
    minX: x - sx,
    maxX: x + sx,
    minZ: z - sz,
    maxZ: z + sz,
    minY: geometry.hinge.y,
    maxY: geometry.hinge.y + geometry.height,
    obb: { x, z, halfWidth: half, halfDepth: 0.065, yaw },
    material: geometry.kind === "wood" ? "wood" : "metal",
  };
}
export class DoorSystem {
  private definitions = new Map<string, DoorGeometry>();
  constructor(private ctx: SimContext) {
    for (const poi of ctx.gen.pois) {
      if (poi.kind === "extraction") continue;
      this.definitions.set(poi.id, {
        id: poi.id,
        hinge: {
          x: poi.x - 0.94,
          y: ctx.gen.poiHeight(poi),
          z: poi.z - poi.depth / 2,
        },
        width: 1.88,
        height: 2.4,
        yaw: 0,
        kind:
          poi.id === "lab-0"
            ? "security"
            : ["military", "industrial", "warehouse", "lab"].includes(poi.kind)
              ? "metal"
              : "wood",
      });
      this.get(poi.id);
    }
    const lab = ctx.gen.pois.find((p) => p.id === "lab-0")!;
    for (const [id, z] of [
      ["facility-lift", -4.8],
      ["facility-vault", 5],
    ] as const) {
      this.definitions.set(id, {
        id,
        hinge: { x: lab.x - 1.15, y: ctx.gen.poiHeight(lab) - 8, z: lab.z + z },
        width: 2.3,
        height: 2.7,
        yaw: 0,
        kind: "security",
      });
      const data = this.get(id)!;
      data.locked = false;
      if (data.status === "locked") data.status = "closed";
    }
  }
  geometry(id: string): DoorGeometry | null {
    const definition = this.definitions.get(id);
    if (definition) return definition;
    const structure = this.ctx.state.structures.find(
      (b) => b.id === id && ["door", "gate"].includes(b.kind) && b.health > 0,
    );
    if (structure)
      return {
        id,
        hinge: {
          x: structure.position.x - Math.cos(structure.rotation) * 1.2,
          y: structure.position.y,
          z: structure.position.z + Math.sin(structure.rotation) * 1.2,
        },
        width: 2.4,
        height: 2.6,
        yaw: structure.rotation,
        kind: structure.kind === "gate" ? "gate" : "wood",
      };
    if (id.startsWith("vehicle:") && id.endsWith(":left")) {
      const v = this.ctx.state.vehicles.find(
        (v) => id === "vehicle:" + v.id + ":left",
      );
      if (v)
        return {
          id,
          hinge: {
            x: v.position.x + Math.cos(v.yaw) * 0.97 + Math.sin(v.yaw) * 0.9,
            y: v.position.y + 0.73,
            z: v.position.z - Math.sin(v.yaw) * 0.97 + Math.cos(v.yaw) * 0.9,
          },
          width: 1.12,
          height: 1.1,
          yaw: v.yaw + Math.PI / 2,
          kind: "vehicle",
        };
    }
    return null;
  }
  get(id: string): DoorData | null {
    const existing = this.ctx.state.doorStates[id];
    if (existing) return existing;
    const geometry = this.geometry(id);
    if (!geometry) return null;
    const structure = this.ctx.state.structures.find((b) => b.id === id);
    const opened = this.ctx.state.doors[id] ?? structure?.active ?? false;
    const broken = this.ctx.state.destroyed.includes(id + ":door");
    const locked = geometry.kind === "security" && !opened;
    const data: DoorData = {
      id,
      kind: geometry.kind,
      progress: opened || broken ? 1 : 0,
      target: opened || broken ? 1 : 0,
      health: broken
        ? 0
        : geometry.kind === "security"
          ? 240
          : geometry.kind === "wood"
            ? 85
            : 145,
      locked,
      status: broken
        ? "broken"
        : opened
          ? "open"
          : locked
            ? "locked"
            : "closed",
      duration:
        geometry.kind === "wood"
          ? 0.6
          : geometry.kind === "vehicle"
            ? 0.5
            : geometry.kind === "gate"
              ? 1.05
              : 0.88,
      startedAt: 0,
      blockedUntil: 0,
      rattle: 0,
    };
    this.ctx.state.doorStates[id] = data;
    return data;
  }
  request(
    id: string,
    open?: boolean,
    actor: "player" | "human" | "script" = "player",
    quick = false,
  ): boolean {
    const data = this.get(id),
      geometry = this.geometry(id);
    if (!data || !geometry || data.status === "broken") return false;
    if (data.locked) {
      if (
        actor === "script" ||
        (actor === "player" &&
          countItem(this.ctx.state.player.inventory, "keycard") > 0)
      )
        data.locked = false;
      else {
        data.status = "locked";
        data.rattle = 1;
        data.startedAt = this.ctx.state.elapsed;
        this.ctx.bus.emit({
          type: "sound",
          text: "locked",
          kind: "door",
          position: geometry.hinge,
        });
        if (actor === "player")
          this.ctx.notify("安全门需要渡鸦访问卡。", "warning");
        return false;
      }
    }
    data.target = Number(open ?? data.target === 0);
    data.status = data.target ? "opening" : "closing";
    data.startedAt = this.ctx.state.elapsed;
    data.blockedUntil = 0;
    data.duration =
      (data.kind === "wood"
        ? 0.6
        : data.kind === "vehicle"
          ? 0.5
          : data.kind === "gate"
            ? 1.05
            : 0.88) *
      (quick ? 0.72 : 1) *
      (data.health < 35 ? 1.25 : 1);
    this.ctx.state.doors[id] = data.target === 1;
    const structure = this.ctx.state.structures.find((b) => b.id === id);
    if (structure) structure.active = data.target === 1;
    if (actor === "player")
      this.ctx.bus.emit({ type: "motion", text: "door", value: data.duration });
    this.ctx.noise(
      geometry.hinge,
      quick ? 22 : data.kind === "wood" ? 8 : 14,
      "door",
    );
    this.ctx.bus.emit({
      type: "sound",
      text: data.target ? "open" : "close",
      kind: "door",
      position: geometry.hinge,
      value: quick ? 1 : 0.65,
    });
    return true;
  }
  damage(id: string, amount: number): boolean {
    const data = this.get(id),
      geometry = this.geometry(id);
    if (!data || !geometry || data.health <= 0) return false;
    data.health = Math.max(
      0,
      data.health - amount * (data.kind === "security" ? 0.45 : 1),
    );
    data.rattle = clamp(amount / 20, 0.2, 1);
    this.ctx.bus.emit({
      type: "hit",
      text: "门受到撞击",
      position: { ...geometry.hinge, y: geometry.hinge.y + 1.1 },
      kind: "wall",
      material: data.kind === "wood" ? "wood" : "metal",
      value: amount,
    });
    this.ctx.noise(geometry.hinge, 22, "door-impact");
    if (data.health === 0) {
      data.status = "broken";
      data.target = 1;
      data.progress = 1;
      data.locked = false;
      this.ctx.state.doors[id] = true;
      if (!this.ctx.state.destroyed.includes(id + ":door"))
        this.ctx.state.destroyed.push(id + ":door");
      this.ctx.bus.emit({
        type: "sound",
        text: "break",
        kind: "door",
        position: geometry.hinge,
      });
    }
    return true;
  }
  update(dt: number) {
    for (const b of this.ctx.state.structures)
      if (["door", "gate"].includes(b.kind)) this.get(b.id);
    for (const data of Object.values(this.ctx.state.doorStates)) {
      data.rattle = Math.max(0, data.rattle - dt * 3);
      if (
        data.status === "broken" ||
        data.status === "locked" ||
        data.progress === data.target
      )
        continue;
      if (data.blockedUntil > this.ctx.state.elapsed) continue;
      const geometry = this.geometry(data.id);
      if (!geometry) continue;
      const delta = dt / data.duration;
      const next = data.target
        ? Math.min(1, data.progress + delta)
        : Math.max(0, data.progress - delta);
      const leaf = doorCollider(geometry, next),
        oldLeaf = doorCollider(geometry, data.progress);
      const player = this.ctx.state.player;
      const height =
        player.stance === "stand"
          ? 1.75
          : player.stance === "crouch"
            ? 1.05
            : 0.5;
      const blockedByPlayer =
        geometry.kind !== "vehicle" &&
        orientedBoxContains(leaf, player.position, 0.32, height) &&
        !orientedBoxContains(oldLeaf, player.position, 0.32, height);
      const blockedByActor = Object.values(this.ctx.state.actors).some(
        (a) =>
          a.health > 0 &&
          distance(a.position, geometry.hinge) < geometry.width + 1 &&
          orientedBoxContains(leaf, a.position, 0.33, 1.6) &&
          !orientedBoxContains(oldLeaf, a.position, 0.33, 1.6),
      );
      if (blockedByPlayer || blockedByActor) {
        if (data.status !== "blocked")
          this.ctx.bus.emit({
            type: "sound",
            text: "blocked",
            kind: "door",
            position: geometry.hinge,
          });
        data.status = "blocked";
        data.blockedUntil = this.ctx.state.elapsed + 0.22;
        data.rattle = 0.4;
        continue;
      }
      data.progress = next;
      data.status =
        next === data.target
          ? next === 1
            ? "open"
            : "closed"
          : data.target
            ? "opening"
            : "closing";
    }
  }
  colliders(x: number, z: number, radius: number): Collider[] {
    const result: Collider[] = [];
    for (const data of Object.values(this.ctx.state.doorStates)) {
      if (data.kind === "vehicle") continue;
      const geometry = this.geometry(data.id);
      if (
        !geometry ||
        Math.abs(geometry.hinge.x - x) > radius + 4 ||
        Math.abs(geometry.hinge.z - z) > radius + 4
      )
        continue;
      if (data.status !== "broken")
        result.push(doorCollider(geometry, data.progress));
      if (!this.definitions.has(data.id) && geometry.kind !== "vehicle") {
        const cosine = Math.cos(geometry.yaw),
          sine = Math.sin(geometry.yaw);
        const center = {
          x: geometry.hinge.x + cosine * 1.2,
          z: geometry.hinge.z - sine * 1.2,
        };
        for (const side of [-1, 1]) {
          const c = doorCollider(
            {
              ...geometry,
              id: data.id + ":frame:" + side,
              width: 0.7,
              height: 2.8,
              hinge: {
                x: center.x + cosine * (side * 1.65 - 0.35),
                y: geometry.hinge.y,
                z: center.z - sine * (side * 1.65 - 0.35),
              },
            },
            0,
          );
          delete c.door;
          result.push(c);
        }
      }
    }
    return result;
  }
}
