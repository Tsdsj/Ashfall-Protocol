import { ITEMS } from "../data/items";
import { distance, type Stack, type Vec3, type BodyPart } from "../core/types";
import { addItem, countItem, removeItem, removeUid } from "./inventory";
import type { SimContext } from "./context";
import type { AISystem } from "./ai";
import { rayActorZones, type HitZone } from "./hit-zones";
interface Projectile {
  position: Vec3;
  velocity: Vec3;
  damage: number;
  life: number;
  travel: number;
  range: number;
  penetration: number;
  active: boolean;
  weapon: string;
  impact: number;
}
export class CombatSystem {
  private treeChops = new Map<string, number>();
  treeProgress(id: string): number {
    return this.treeChops.get(id) ?? 0;
  }
  readonly hitZones = new Map<string, HitZone[]>();
  cooldown = 0;
  throwRemaining = 0;
  reloadRemaining = 0;
  reloadTotal = 0;
  recoil = 0;
  reloadMode: "magazine" | "clear" = "magazine";
  melee: {
    uid: string;
    id: string;
    elapsed: number;
    hitTime: number;
    duration: number;
    hit: boolean;
  } | null = null;
  private reloadUid: string | null = null;
  private shotIndex = 0;
  readonly projectiles: Projectile[] = Array.from({ length: 96 }, () => ({
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    damage: 0,
    life: 0,
    travel: 0,
    range: 0,
    penetration: 0,
    active: false,
    weapon: "",
    impact: 0,
  }));
  grenades: { position: Vec3; velocity: Vec3; timer: number }[] = [];
  constructor(
    private ctx: SimContext,
    private ai: AISystem,
  ) {}
  get jammed(): boolean {
    return this.equipped()?.jammed ?? false;
  }
  set jammed(value: boolean) {
    const item = this.equipped();
    if (item) item.jammed = value;
  }
  equipped(): Stack | undefined {
    const p = this.ctx.state.player;
    return p.inventory.items.find((i) => i.uid === p.quickSlots[p.selected]);
  }
  fire(origin: Vec3, direction: Vec3, aiming = false): boolean {
    const p = this.ctx.state.player,
      stack = this.equipped();
    if (
      !stack ||
      this.cooldown > 0 ||
      this.reloadRemaining > 0 ||
      p.stats.health <= 0
    )
      return false;
    const item = ITEMS[stack.id]!,
      w = item.weapon;
    if (!w) {
      return false;
    }
    if (stack.durability <= 0) {
      this.ctx.notify("武器已损坏，请用废金属维修。", "warning");
      this.cooldown = 0.5;
      return false;
    }
    if (this.jammed) {
      this.ctx.notify("枪械卡壳，按 R 清障。", "warning");
      this.cooldown = 0.6;
      return false;
    }
    if (w.ammo && stack.ammo <= 0) {
      this.ctx.bus.emit({ type: "sound", text: "empty", kind: "empty" });
      this.ctx.notify("弹匣为空，按 R 换弹。", "warning");
      this.cooldown = 0.3;
      return false;
    }
    if (p.stats.stamina < w.stamina) {
      this.ctx.notify("体力不足，稍作休息。", "warning");
      return false;
    }
    p.stats.stamina -= w.stamina;
    this.cooldown = w.interval;
    this.recoil = w.recoil * (stack.attachments.includes("grip") ? 0.7 : 1);
    stack.durability = Math.max(0, stack.durability - (w.ammo ? 0.06 : 0.14));
    this.shotIndex++;
    if (w.ammo) {
      stack.ammo--;
      stack.dirt = Math.min(100, stack.dirt + 0.13);
      this.ctx.noise(
        p.position,
        stack.attachments.includes("suppressor") ? 35 : 200,
        "gunshot",
      );
      this.ctx.bus.emit({
        type: "shot",
        text: item.name,
        position: origin,
        value: this.recoil,
        kind: stack.id,
      });
      if (
        (stack.durability < 25 || stack.dirt > 75) &&
        Math.abs(Math.sin(this.shotIndex * 97.73)) < 0.05
      )
        this.jammed = true;
      for (let n = 0; n < (w.pellets ?? 1); n++) {
        const bullet =
          this.projectiles.find((b) => !b.active) ?? this.projectiles[0]!;
        const spread =
          (w.pellets
            ? 0.048
            : aiming
              ? 0.0018 * (stack.attachments.includes("reddot") ? 0.72 : 1)
              : 0.012 * (stack.attachments.includes("laser") ? 0.5 : 1)) *
          (p.stance === "crouch" ? 0.6 : 1);
        const sx = Math.sin(this.shotIndex * 12.989 + n * 8.4) * spread,
          sy = Math.cos(this.shotIndex * 5.41 + n * 13.3) * spread;
        bullet.position = { x: origin.x, y: origin.y, z: origin.z };
        bullet.velocity = {
          x: (direction.x + sx) * (w.velocity ?? 300),
          y: (direction.y + sy) * (w.velocity ?? 300),
          z: (direction.z + sx * 0.7) * (w.velocity ?? 300),
        };
        bullet.damage = w.damage;
        bullet.weapon = stack.id;
        bullet.impact = w.damage * (w.pellets ? w.pellets * 0.7 : 1);
        bullet.life = 0;
        bullet.range = w.range;
        bullet.travel = 0;
        bullet.penetration = w.penetration ?? 0;
        bullet.active = true;
      }
    } else {
      this.ctx.noise(p.position, 7, "melee");
      this.ctx.bus.emit({
        type: "shot",
        text: item.name,
        kind: "melee",
        value: 0.04,
      });
      this.melee = {
        uid: stack.uid,
        id: stack.id,
        elapsed: 0,
        hitTime: Math.min(0.24, w.interval * 0.27),
        duration: w.interval,
        hit: false,
      };
    }
    return true;
  }
  private resolveMelee(id: string, origin: Vec3, direction: Vec3): void {
    const w = ITEMS[id]!.weapon!;
    let best = Infinity;
    let bodyPart: BodyPart = "chest";
    let target: (typeof this.ctx.state.actors)[string] | null = null;
    for (const actor of Object.values(this.ctx.state.actors)) {
      if (actor.health <= 0) continue;
      const zones = this.hitZones.get(actor.id);
      if (zones) {
        const hit = rayActorZones(
          origin,
          direction,
          zones,
          Math.min(best, w.range),
          0.12,
        );
        if (
          hit &&
          this.ctx.collision.visible(origin, {
            x: origin.x + direction.x * hit.distance,
            y: origin.y + direction.y * hit.distance,
            z: origin.z + direction.z * hit.distance,
          })
        ) {
          best = hit.distance;
          target = actor;
          bodyPart = hit.part;
        }
        continue;
      }
      const d = distance(origin, actor.position);
      const dx = actor.position.x - origin.x,
        dz = actor.position.z - origin.z;
      const dot =
        (dx * direction.x + dz * direction.z) /
        ((Math.hypot(dx, dz) || 1) *
          (Math.hypot(direction.x, direction.z) || 1));
      const height =
        origin.y +
        (direction.y * d) / (Math.hypot(direction.x, direction.z) || 1) -
        actor.position.y;
      if (
        d < w.range &&
        dot > 0.72 &&
        d < best &&
        height > 0.08 &&
        height < (["deer", "wolf", "boar"].includes(actor.kind) ? 1.5 : 1.95) &&
        this.ctx.collision.visible(origin, {
          ...actor.position,
          y: actor.position.y + 1,
        })
      ) {
        best = d;
        target = actor;
        bodyPart = height > 1.5 ? "head" : height < 0.65 ? "leg" : "chest";
      }
    }
    if (target)
      this.ai.hurt(target, w.damage, bodyPart, {
        direction,
        source: "melee",
        weapon: id,
        impact: w.damage,
        position: {
          x: origin.x + direction.x * best,
          y: origin.y + direction.y * best,
          z: origin.z + direction.z * best,
        },
      });
    else {
      const hit = this.ctx.collision.ray(origin, direction, w.range);
      if (hit) {
        if (hit.collider.id.startsWith("tree:")) {
          const treeId = hit.collider.id;
          if (id !== "hatchet")
            this.ctx.notify("砍伐树木需要装备手斧。", "warning");
          else if (!this.ctx.state.destroyed.includes(treeId)) {
            const chops = Math.min(4, this.treeProgress(treeId) + 1);
            if (chops < 4) {
              this.treeChops.set(treeId, chops);
              this.ctx.notify(`正在砍伐松树 · ${chops}/4`);
            } else if (addItem(this.ctx.state.player.inventory, "wood", 7)) {
              this.treeChops.delete(treeId);
              this.ctx.state.destroyed.push(treeId);
              const position = {
                x: (hit.collider.minX + hit.collider.maxX) / 2,
                y: hit.collider.minY,
                z: (hit.collider.minZ + hit.collider.maxZ) / 2,
              };
              this.ctx.noise(position, 45, "tree-fall");
              this.ctx.notify("松树已砍倒 · 获得木材 ×7", "success");
              this.ctx.bus.emit({
                type: "sound",
                kind: "tree-felled",
                text: treeId,
                position,
                direction,
              });
            } else {
              this.treeChops.set(treeId, 3);
              this.ctx.notify(
                "背包空间不足，请腾出位置后再完成砍伐。",
                "warning",
              );
            }
          }
        }
        if (
          hit.collider.door &&
          ["hatchet", "crowbar", "machete"].includes(id)
        ) {
          this.ctx.doors.damage(hit.collider.door, w.damage);
          this.ctx.notify(
            this.ctx.doors.get(hit.collider.door)?.status === "broken"
              ? "门已被突破"
              : "门正在受损",
          );
        }
        const b = this.ctx.state.structures.find(
          (b) => b.id === hit.collider.id,
        );
        if (b) b.health = Math.max(0, b.health - w.damage);
        this.ctx.bus.emit({
          type: "hit",
          text: "击中障碍",
          kind: "wall",
          material: hit.collider.material ?? "concrete",
          weapon: id,
          direction,
          normal: hit.normal,
          position: {
            x: origin.x + direction.x * hit.distance,
            y: origin.y + direction.y * hit.distance,
            z: origin.z + direction.z * hit.distance,
          },
        });
      }
    }
  }
  reload(): boolean {
    const stack = this.equipped(),
      w = stack && ITEMS[stack.id]?.weapon;
    if (!stack || !w?.ammo || this.reloadRemaining > 0) return false;
    if (this.jammed) {
      this.reloadMode = "clear";
      this.reloadUid = stack.uid;
      this.reloadRemaining = this.reloadTotal = 1.2;
      this.ctx.notify("正在排除卡壳");
      this.ctx.bus.emit({ type: "sound", text: "clear", kind: "reload" });
      return true;
    }
    const max =
      (w.magazine ?? 1) +
      (stack.attachments.includes("extendedmag")
        ? Math.ceil((w.magazine ?? 1) * 0.5)
        : 0);
    if (stack.ammo >= max) {
      this.ctx.notify("弹匣已满");
      return false;
    }
    if (countItem(this.ctx.state.player.inventory, w.ammo) === 0) {
      this.ctx.notify("没有匹配的弹药", "warning");
      return false;
    }
    this.reloadMode = "magazine";
    this.reloadUid = stack.uid;
    this.reloadTotal = w.reload ?? 1.5;
    this.reloadRemaining = this.reloadTotal;
    this.ctx.bus.emit({
      type: "sound",
      text: "reload",
      kind: ["rifle", "shotgun"].includes(stack.id) ? "mechanical" : "reload",
    });
    return true;
  }
  cancelReload() {
    this.reloadRemaining = 0;
    this.reloadUid = null;
  }
  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.throwRemaining = Math.max(0, this.throwRemaining - dt);
    this.recoil *= Math.exp(-dt * 12);
    if (this.melee) {
      const job = this.melee;
      if (
        this.equipped()?.uid !== job.uid ||
        this.ctx.state.player.stats.health <= 0
      )
        this.melee = null;
      else {
        job.elapsed = Math.min(job.duration, job.elapsed + dt);
        if (!job.hit && job.elapsed >= job.hitTime) {
          job.hit = true;
          const p = this.ctx.state.player,
            height =
              p.stance === "prone" ? 0.48 : p.stance === "crouch" ? 1.06 : 1.68,
            cp = Math.cos(p.pitch);
          this.resolveMelee(
            job.id,
            { ...p.position, y: p.position.y + height },
            {
              x: Math.sin(p.yaw) * cp,
              y: -Math.sin(p.pitch),
              z: Math.cos(p.yaw) * cp,
            },
          );
        }
        if (job.elapsed >= job.duration) this.melee = null;
      }
    }
    if (this.reloadRemaining > 0) {
      if (this.equipped()?.uid !== this.reloadUid) {
        this.cancelReload();
      } else {
        const before = 1 - this.reloadRemaining / this.reloadTotal;
        this.reloadRemaining = Math.max(0, this.reloadRemaining - dt);
        const after = 1 - this.reloadRemaining / this.reloadTotal;
        for (const [time, sound] of [
          [0.18, "mag-out"],
          [0.7, "mag-in"],
          [0.86, "bolt"],
        ] as const)
          if (before < time && after >= time)
            this.ctx.bus.emit({
              type: "sound",
              text:
                this.reloadMode === "clear"
                  ? "bolt"
                  : ["rifle", "shotgun"].includes(this.equipped()?.id ?? "")
                    ? sound === "bolt"
                      ? "bolt"
                      : "load-round"
                    : sound,
              kind: "mechanical",
            });
        if (this.reloadRemaining === 0) {
          const stack = this.equipped()!,
            w = ITEMS[stack.id]!.weapon!;
          if (this.reloadMode === "clear") {
            stack.jammed = false;
            stack.dirt = Math.max(0, stack.dirt - 3);
            this.ctx.notify("已排除卡壳");
          } else {
            const max =
                (w.magazine ?? 1) +
                (stack.attachments.includes("extendedmag")
                  ? Math.ceil((w.magazine ?? 1) * 0.5)
                  : 0),
              n = Math.min(
                max - stack.ammo,
                countItem(this.ctx.state.player.inventory, w.ammo!),
              );
            if (
              n > 0 &&
              removeItem(this.ctx.state.player.inventory, w.ammo!, n)
            )
              stack.ammo += n;
            this.ctx.notify("换弹完成");
          }
          this.reloadUid = null;
        }
      }
    }
    for (const b of this.projectiles) {
      if (!b.active) continue;
      const len = Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z) * dt;
      if (len < 0.000001) continue;
      const dir = {
        x: (b.velocity.x * dt) / len,
        y: (b.velocity.y * dt) / len,
        z: (b.velocity.z * dt) / len,
      };
      const solid = this.ctx.collision.ray(b.position, dir, len);
      const terrain = this.ctx.collision.terrainRay(
        b.position,
        dir,
        solid?.distance ?? len,
      );
      const wall = terrain ?? solid;
      let nearest = wall?.distance ?? len;
      let target: (typeof this.ctx.state.actors)[string] | undefined;
      let part: BodyPart = "chest";
      for (const actor of Object.values(this.ctx.state.actors)) {
        if (actor.health <= 0) continue;
        const zones = this.hitZones.get(actor.id);
        if (zones) {
          const hit = rayActorZones(b.position, dir, zones, nearest);
          if (hit) {
            nearest = hit.distance;
            target = actor;
            part = hit.part;
          }
          continue;
        }
        const dx = actor.position.x - b.position.x,
          dz = actor.position.z - b.position.z;
        const horizontal = dir.x * dir.x + dir.z * dir.z;
        const t = (dx * dir.x + dz * dir.z) / (horizontal || 1);
        if (t < 0 || t > nearest) continue;
        const hx = b.position.x + dir.x * t - actor.position.x,
          hz = b.position.z + dir.z * t - actor.position.z,
          hy = b.position.y + dir.y * t - actor.position.y;
        const animal = ["deer", "boar", "wolf"].includes(actor.kind);
        if (
          hx * hx + hz * hz < (animal ? 0.65 : 0.38) ** 2 &&
          hy > 0.1 &&
          hy < (animal ? 1.4 : 1.9)
        ) {
          nearest = t;
          target = actor;
          const side = hx * Math.cos(actor.yaw) - hz * Math.sin(actor.yaw);
          part =
            hy > 1.5
              ? "head"
              : hy < 0.65
                ? "leg"
                : !animal && Math.abs(side) > 0.22
                  ? "arm"
                  : "chest";
        }
      }
      if (target) {
        this.ai.hurt(
          target,
          b.damage * Math.max(0.4, 1 - (b.travel / b.range) * 0.5),
          part,
          {
            direction: dir,
            source: "bullet",
            weapon: b.weapon,
            impact: b.impact,
            position: {
              x: b.position.x + dir.x * nearest,
              y: b.position.y + dir.y * nearest,
              z: b.position.z + dir.z * nearest,
            },
          },
        );
        b.active = false;
      } else if (wall) {
        const hit = {
          x: b.position.x + dir.x * wall.distance,
          y: b.position.y + dir.y * wall.distance,
          z: b.position.z + dir.z * wall.distance,
        };
        this.ctx.bus.emit({
          type: "hit",
          text: "弹着",
          position: hit,
          kind: "wall",
          material: wall.collider.material ?? "concrete",
          weapon: b.weapon,
          direction: dir,
          normal: wall.normal,
        });
        if (
          wall.collider.id.includes(":glass:") ||
          (b.penetration > 0.3 && wall.collider.door)
        ) {
          const glass = wall.collider.id.includes(":glass:");
          if (glass) this.ctx.state.destroyed.push(wall.collider.id);
          if (wall.collider.door)
            this.ctx.doors.damage(wall.collider.door, b.damage * 0.8);
          b.damage *= glass ? 0.8 : 0.45;
          b.penetration = 0;
          b.position = {
            x: hit.x + dir.x * 0.05,
            y: hit.y + dir.y * 0.05,
            z: hit.z + dir.z * 0.05,
          };
          b.travel += wall.distance;
          b.life += dt;
          this.ctx.noise(hit, 35, glass ? "glass" : "impact");
          continue;
        } else {
          const structure = this.ctx.state.structures.find(
            (s) => s.id === wall.collider.id,
          );
          if (structure)
            structure.health = Math.max(0, structure.health - b.damage * 0.4);
          const vehicle = this.ctx.state.vehicles.find(
            (v) => v.id === wall.collider.id,
          );
          if (vehicle)
            vehicle.health = Math.max(0, vehicle.health - b.damage * 0.2);
          b.active = false;
        }
      }
      b.position.x += b.velocity.x * dt;
      b.position.y += b.velocity.y * dt;
      b.position.z += b.velocity.z * dt;
      b.velocity.y -= 9.81 * dt;
      b.velocity.x *= 1 - dt * 0.035;
      b.velocity.z *= 1 - dt * 0.035;
      b.life += dt;
      b.travel += len;
      if (
        b.travel > b.range ||
        b.life > 5 ||
        b.position.y <
          this.ctx.collision.ground(b.position.x, b.position.z, b.position.y) -
            0.08
      )
        b.active = false;
    }
    for (const g of this.grenades) {
      g.timer -= dt;
      const before = { ...g.position };
      g.position.x += g.velocity.x * dt;
      g.position.y += g.velocity.y * dt;
      g.position.z += g.velocity.z * dt;
      g.velocity.y -= 9.8 * dt;
      const floor =
        this.ctx.collision.ground(g.position.x, g.position.z, g.position.y) +
        0.15;
      if (g.position.y < floor) {
        g.position.y = floor;
        g.velocity.y = Math.abs(g.velocity.y) * 0.3;
        g.velocity.x *= 0.85;
        g.velocity.z *= 0.85;
      }
      if (!this.ctx.collision.visible(before, g.position)) {
        g.position = before;
        g.velocity.x *= -0.5;
        g.velocity.z *= -0.5;
      }
      if (g.timer <= 0) this.detonate(g.position);
    }
    this.grenades = this.grenades.filter((g) => g.timer > 0);
  }
  detonate(position: Vec3, damageScale = 1, radius = 10) {
    this.ctx.noise(position, 350, "explosion");
    this.ctx.bus.emit({
      type: "shot",
      text: "爆炸",
      position,
      kind: "explosion",
    });
    const spatialDistance = (p: Vec3) =>
      Math.hypot(p.x - position.x, p.y - position.y, p.z - position.z);
    if (damageScale <= 0) return;
    for (const actor of Object.values(this.ctx.state.actors)) {
      const target = { ...actor.position, y: actor.position.y + 0.8 },
        d = spatialDistance(target);
      if (
        actor.health > 0 &&
        d < radius &&
        this.ctx.collision.visible(position, target)
      )
        this.ai.hurt(actor, (1 - d / radius) * 180 * damageScale, "chest", {
          direction: {
            x: actor.position.x - position.x,
            y: 0.2,
            z: actor.position.z - position.z,
          },
          source: "explosion",
          impact: 120 * damageScale,
          position: target,
        });
    }
    const player = {
        ...this.ctx.state.player.position,
        y: this.ctx.state.player.position.y + 0.8,
      },
      d = spatialDistance(player);
    if (d < radius * 0.9 && this.ctx.collision.visible(position, player))
      this.ctx.damage((1 - d / (radius * 0.9)) * 95 * damageScale, "爆炸");
    for (const structure of this.ctx.state.structures) {
      const target = { ...structure.position, y: structure.position.y + 0.6 };
      if (
        spatialDistance(target) < radius * 0.8 &&
        this.ctx.collision.visible(position, target)
      )
        structure.health = Math.max(0, structure.health - 70 * damageScale);
    }
  }
  throw(origin: Vec3, direction: Vec3): boolean {
    const player = this.ctx.state.player;
    if (this.throwRemaining > 0 || player.stats.health <= 0) return false;
    const held = this.equipped();
    const stack =
      held?.id === "grenade"
        ? held
        : player.inventory.items.find((item) => item.id === "grenade");
    if (this.grenades.length >= 6) return false;
    if (!stack || !removeUid(player.inventory, stack.uid, 1)) {
      this.ctx.notify("没有可投掷的手榴弹", "warning");
      return false;
    }
    // Commit consumption and release together, before emitting presentation feedback.
    player.quickSlots = player.quickSlots.map((uid) =>
      uid === stack.uid && stack.count === 0 ? null : uid,
    );
    this.throwRemaining = 0.65;
    this.grenades.push({
      position: { x: origin.x, y: origin.y, z: origin.z },
      velocity: {
        x: direction.x * 14,
        y: direction.y * 14 + 4,
        z: direction.z * 14,
      },
      timer: 3,
    });
    this.ctx.bus.emit({
      type: "motion",
      text: "throw",
      kind: "throw",
      value: 0.65,
    });
    this.ctx.notify("手榴弹已投出");
    return true;
  }
}
