import { ITEMS } from "../data/items";
import { distance, type Stack, type Vec3 } from "../core/types";
import { countItem, removeItem } from "./inventory";
import type { SimContext } from "./context";
import type { AISystem } from "./ai";
interface Projectile {
  position: Vec3;
  velocity: Vec3;
  damage: number;
  life: number;
  travel: number;
  range: number;
  penetration: number;
  active: boolean;
}
export class CombatSystem {
  cooldown = 0;
  reloadRemaining = 0;
  reloadTotal = 0;
  recoil = 0;
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
      let best = Infinity;
      let target: (typeof this.ctx.state.actors)[string] | null = null;
      for (const actor of Object.values(this.ctx.state.actors)) {
        if (actor.health <= 0) continue;
        const d = distance(origin, actor.position);
        const dx = actor.position.x - origin.x,
          dz = actor.position.z - origin.z;
        const dot =
          (dx * direction.x + dz * direction.z) / (Math.hypot(dx, dz) || 1);
        if (
          d < w.range &&
          dot > 0.72 &&
          d < best &&
          this.ctx.collision.visible(origin, {
            ...actor.position,
            y: actor.position.y + 1,
          })
        ) {
          best = d;
          target = actor;
        }
      }
      if (target)
        this.ai.hurt(target, w.damage, direction.y > 0.18 ? "head" : "chest");
      else {
        const hit = this.ctx.collision.ray(origin, direction, w.range);
        if (hit) {
          if (
            hit.collider.door &&
            ["hatchet", "crowbar", "machete"].includes(stack.id)
          ) {
            this.ctx.state.doors[hit.collider.door] = true;
            this.ctx.state.destroyed.push(hit.collider.id);
            this.ctx.notify("门锁已破坏");
          }
          const b = this.ctx.state.structures.find(
            (b) => b.id === hit.collider.id,
          );
          if (b) b.health = Math.max(0, b.health - w.damage);
          this.ctx.bus.emit({
            type: "hit",
            text: "击中障碍",
            position: {
              x: origin.x + direction.x * hit.distance,
              y: origin.y + direction.y * hit.distance,
              z: origin.z + direction.z * hit.distance,
            },
          });
        }
      }
    }
    return true;
  }
  reload(): boolean {
    const stack = this.equipped(),
      w = stack && ITEMS[stack.id]?.weapon;
    if (!stack || !w?.ammo || this.reloadRemaining > 0) return false;
    if (this.jammed) {
      this.jammed = false;
      this.cooldown = 1.2;
      this.ctx.notify("已清除卡壳");
      this.ctx.bus.emit({ type: "sound", text: "reload", kind: "reload" });
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
    this.reloadUid = stack.uid;
    this.reloadTotal = w.reload ?? 1.5;
    this.reloadRemaining = this.reloadTotal;
    this.ctx.bus.emit({ type: "sound", text: "reload", kind: "reload" });
    return true;
  }
  cancelReload() {
    this.reloadRemaining = 0;
    this.reloadUid = null;
  }
  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoil *= Math.exp(-dt * 12);
    if (this.reloadRemaining > 0) {
      if (this.equipped()?.uid !== this.reloadUid) {
        this.cancelReload();
      } else {
        this.reloadRemaining = Math.max(0, this.reloadRemaining - dt);
        if (this.reloadRemaining === 0) {
          const stack = this.equipped()!,
            w = ITEMS[stack.id]!.weapon!;
          const max =
              (w.magazine ?? 1) +
              (stack.attachments.includes("extendedmag")
                ? Math.ceil((w.magazine ?? 1) * 0.5)
                : 0),
            n = Math.min(
              max - stack.ammo,
              countItem(this.ctx.state.player.inventory, w.ammo!),
            );
          if (n > 0 && removeItem(this.ctx.state.player.inventory, w.ammo!, n))
            stack.ammo += n;
          this.ctx.notify("换弹完成");
          this.reloadUid = null;
        }
      }
    }
    for (const b of this.projectiles) {
      if (!b.active) continue;
      const len = Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z) * dt;
      const dir = {
        x: (b.velocity.x * dt) / len,
        y: (b.velocity.y * dt) / len,
        z: (b.velocity.z * dt) / len,
      };
      const wall = this.ctx.collision.ray(b.position, dir, len);
      let nearest = wall?.distance ?? len;
      let target: (typeof this.ctx.state.actors)[string] | undefined;
      let part: "head" | "chest" | "leg" = "chest";
      for (const actor of Object.values(this.ctx.state.actors)) {
        if (actor.health <= 0) continue;
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
          part = hy > 1.5 ? "head" : hy < 0.65 ? "leg" : "chest";
        }
      }
      if (target) {
        this.ai.hurt(
          target,
          b.damage * Math.max(0.4, 1 - (b.travel / b.range) * 0.5),
          part,
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
        });
        if (
          wall.collider.id.includes(":glass:") ||
          (b.penetration > 0.3 && wall.collider.door)
        ) {
          const glass = wall.collider.id.includes(":glass:");
          this.ctx.state.destroyed.push(wall.collider.id);
          if (wall.collider.door)
            this.ctx.state.doors[wall.collider.door] = true;
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
        b.position.y < this.ctx.gen.height(b.position.x, b.position.z)
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
      const floor = this.ctx.gen.height(g.position.x, g.position.z) + 0.15;
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
      if (g.timer <= 0) {
        this.ctx.noise(g.position, 350, "explosion");
        this.ctx.bus.emit({
          type: "shot",
          text: "爆炸",
          position: g.position,
          kind: "explosion",
        });
        for (const a of Object.values(this.ctx.state.actors)) {
          const d = distance(a.position, g.position);
          if (
            d < 10 &&
            this.ctx.collision.visible(g.position, {
              ...a.position,
              y: a.position.y + 1,
            })
          )
            this.ai.hurt(a, (1 - d / 10) * 180);
        }
        const d = distance(this.ctx.state.player.position, g.position);
        if (d < 9) this.ctx.damage((1 - d / 9) * 95, "爆炸");
        for (const b of this.ctx.state.structures)
          if (distance(b.position, g.position) < 8)
            b.health = Math.max(0, b.health - 70);
      }
    }
    this.grenades = this.grenades.filter((g) => g.timer > 0);
  }
  throw(origin: Vec3, direction: Vec3): boolean {
    if (
      this.grenades.length >= 6 ||
      !removeItem(this.ctx.state.player.inventory, "grenade", 1)
    ) {
      this.ctx.notify("没有可投掷的手榴弹", "warning");
      return false;
    }
    this.grenades.push({
      position: { x: origin.x, y: origin.y, z: origin.z },
      velocity: {
        x: direction.x * 14,
        y: direction.y * 14 + 4,
        z: direction.z * 14,
      },
      timer: 3,
    });
    this.ctx.notify("手榴弹已投出");
    return true;
  }
}
