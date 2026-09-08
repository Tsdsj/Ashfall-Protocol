import { EventBus } from "../core/events";
import {
  clamp,
  distance,
  type WorldState,
  type NoiseEvent,
  type Vec3,
  type Weather,
} from "../core/types";
import { choose, random } from "../core/random";
import { WorldGenerator } from "../world/generator";
import { ITEMS } from "../data/items";
import { RECIPES } from "../data/recipes";
import { CollisionWorld } from "./collision";
import { Actions } from "./actions";
import { BuildingSystem } from "./building";
import { AISystem } from "./ai";
import { CombatSystem } from "./combat";
import { VehicleSystem } from "./vehicles";
import { populate, director } from "./population";
import { applyDamage, updateSurvival } from "./survival";
import { weight } from "./inventory";
import { DIFFICULTIES } from "./state";
import { craftTransaction } from "./crafting";
import type { SimContext } from "./context";
export interface MovementInput {
  forward: number;
  side: number;
  sprint: boolean;
  jump: boolean;
  brake: boolean;
}
export class Simulation implements SimContext {
  readonly gen: WorldGenerator;
  readonly collision: CollisionWorld;
  readonly bus = new EventBus();
  readonly actions: Actions;
  readonly building: BuildingSystem;
  readonly ai: AISystem;
  readonly combat: CombatSystem;
  readonly vehicles: VehicleSystem;
  noises: NoiseEvent[] = [];
  god = false;
  verticalVelocity = 0;
  grounded = true;
  moving = false;
  sprinting = false;
  indoors = false;
  speed = 0;
  footstep = 0;
  private populationTimer = 0;
  private previousJump = false;
  private previousRegion = "";
  private statTimer = 0;
  craftJob: { id: string; remaining: number; total: number } | null = null;
  constructor(public state: WorldState) {
    this.gen = new WorldGenerator(state.seed);
    this.collision = new CollisionWorld(this.gen, state);
    this.actions = new Actions(this);
    this.building = new BuildingSystem(this);
    this.ai = new AISystem(this);
    this.combat = new CombatSystem(this, this.ai);
    this.vehicles = new VehicleSystem(this, this.ai);
    populate(this);
  }
  nextId(prefix: string): string {
    return `${prefix}-${++this.state.uidCounter}`;
  }
  notify(text: string, type: "info" | "success" | "warning" = "info") {
    this.bus.emit({ type, text });
  }
  noise(position: Vec3, radius: number, kind: string): void {
    if (
      this.noises.some(
        (n) =>
          n.kind === kind && n.life > 0.1 && distance(n.position, position) < 3,
      )
    )
      return;
    this.noises.push({
      position: { ...position },
      radius,
      intensity: 1,
      kind,
      life: 0.25,
    });
    if (this.noises.length > 64) this.noises.shift();
  }
  damage(
    amount: number,
    source: string,
    part: "head" | "chest" | "leg" | "arm" = "chest",
    bleed = true,
  ): void {
    if (this.god || this.state.player.stats.health <= 0) return;
    const p = this.state.player,
      vest = p.inventory.items.find((i) => i.uid === p.equipment.vest);
    const protection = vest
      ? ((ITEMS[vest.id]?.protection ?? 0) * vest.durability) / 100
      : 0;
    const damage = applyDamage(
      p.stats,
      amount * DIFFICULTIES[this.state.difficulty].damage,
      part,
      protection,
      bleed,
    );
    if (vest) vest.durability = clamp(vest.durability - damage * 0.45);
    this.bus.emit({ type: "damage", text: source, value: damage });
    if (p.stats.bleeding > 0 && !this.state.flags.includes("bleed-tutorial")) {
      this.state.flags.push("bleed-tutorial");
      this.notify("你正在流血。打开背包使用绷带。", "warning");
    }
    if (p.stats.health <= 0) this.actions.die();
  }
  startCraft(id: string): boolean {
    if (this.craftJob) {
      this.notify("正在制作，完成后再开始下一件。", "warning");
      return false;
    }
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return false;
    const station = this.stationAvailable(recipe.station);
    if (!station) {
      this.notify(recipe.description, "warning");
      return false;
    }
    const check = craftTransaction(
      structuredClone(this.state.player.inventory),
      recipe,
    );
    if (!check.ok) {
      this.notify(check.reason, "warning");
      return false;
    }
    this.craftJob = { id, remaining: recipe.seconds, total: recipe.seconds };
    this.bus.emit({ type: "sound", text: "craft", kind: "craft" });
    return true;
  }
  tickCraft(dt: number): void {
    if (!this.craftJob) return;
    this.craftJob.remaining = Math.max(0, this.craftJob.remaining - dt);
    if (this.craftJob.remaining === 0) {
      const recipe = RECIPES.find((r) => r.id === this.craftJob!.id)!;
      if (this.stationAvailable(recipe.station)) {
        const result = craftTransaction(this.state.player.inventory, recipe);
        this.notify(
          result.ok ? "制作完成：" + recipe.name : result.reason,
          result.ok ? "success" : "warning",
        );
      } else this.notify("已离开制作设施，材料已保留。", "warning");
      this.actions.cleanup();
      this.craftJob = null;
    }
  }
  stationAvailable(station: string): boolean {
    if (station === "hand") return true;
    if (station === "fire") return !!this.building.near("campfire")?.active;
    if (station === "workbench") return !!this.building.near("workbench");
    if (station === "power") {
      const bench = this.building.near("workbench");
      return !!bench && this.building.powered(bench.position);
    }
    return false;
  }
  update(dt: number, input: MovementInput): void {
    dt = Math.min(dt, 0.05);
    if (this.state.player.stats.health <= 0) return;
    const s = this.state,
      p = s.player;
    s.elapsed += dt;
    s.time += dt / ((s.rules.dayLength * 60) / 24);
    if (s.time >= 24) {
      s.time -= 24;
      s.day++;
    }
    if (s.elapsed >= s.nextWeather) {
      const rng = random(s.seed + ":weather:" + Math.floor(s.elapsed / 180));
      s.weather = choose(rng, [
        "clear",
        "cloudy",
        "overcast",
        "rain",
        "storm",
        "fog",
      ] as Weather[]);
      s.nextWeather = s.elapsed + 180 + rng() * 240;
      this.notify("天气正在变化，留意气温与能见度。");
    }
    if (p.vehicle) {
      this.vehicles.update(dt, input.forward, -input.side, input.brake);
      this.moving =
        Math.abs(s.vehicles.find((v) => v.id === p.vehicle)?.speed ?? 0) > 1;
      this.sprinting = false;
    } else this.move(dt, input);
    this.indoors = this.gen.pois.some(
      (poi) =>
        Math.abs(p.position.x - poi.x) < poi.width / 2 &&
        Math.abs(p.position.z - poi.z) < poi.depth / 2 &&
        p.position.y < this.gen.poiHeight(poi) + 3.5,
    );
    const held = this.combat.equipped();
    if (held?.id === "torch")
      held.durability = clamp(held.durability - dt * 0.04);
    const nearFire =
      (held?.id === "torch" && held.durability > 0) ||
      !!s.structures.find(
        (b) =>
          b.kind === "campfire" &&
          b.active &&
          distance(b.position, p.position) < 7,
      );
    if (!this.god)
      updateSurvival(p, dt, {
        weather: s.weather,
        time: s.time,
        indoors: this.indoors,
        nearFire,
        moving: this.moving,
        sprinting: this.sprinting,
        swimming: this.gen.isWater(p.position.x, p.position.z),
        difficulty: DIFFICULTIES[s.difficulty].drain,
      });
    else p.stats.stamina = 100;
    this.ai.update(dt);
    this.combat.update(dt);
    this.building.update(dt);
    this.tickCraft(dt);
    for (const n of this.noises) n.life -= dt;
    this.noises = this.noises.filter((n) => n.life > 0);
    this.populationTimer -= dt;
    if (this.populationTimer <= 0) {
      this.populationTimer = 1;
      populate(this);
      director(this);
      const region = this.gen.regionAt(p.position.x, p.position.z);
      if (region.id !== this.previousRegion) {
        this.previousRegion = region.id;
        this.bus.emit({ type: "info", text: region.name, kind: "region" });
      }
      for (const poi of this.gen.pois)
        if (
          Math.hypot(poi.x - p.position.x, poi.z - p.position.z) < 35 &&
          !s.discovered.includes(poi.id)
        ) {
          s.discovered.push(poi.id);
          this.notify("发现：" + poi.name, "success");
        }
    }
    this.statTimer -= dt;
    if (this.statTimer <= 0) {
      this.statTimer = 1;
      for (const e of s.events) {
        if (e.resolved || e.expires < s.elapsed) continue;
        const d = distance(p.position, e.position);
        if (e.kind === "gas" && d < 12) {
          const mask = p.inventory.items.some(
            (i) => i.uid === p.equipment.face && i.id === "mask",
          );
          if (!mask) {
            p.stats.poison = clamp(p.stats.poison + 2);
            this.damage(1, "毒气", "chest", false);
          }
        }
        if (e.kind === "wildfire" && d < 8)
          this.damage(3, "林火灼伤", "chest", false);
      }
    }
    if (p.stats.health <= 0) this.actions.die();
  }
  private move(dt: number, input: MovementInput): void {
    const p = this.state.player;
    const invWeight = weight(p.inventory);
    this.moving = !!(input.forward || input.side);
    this.sprinting =
      input.sprint &&
      p.stance === "stand" &&
      p.stats.stamina > 3 &&
      invWeight < 38 &&
      this.moving &&
      !p.stats.fracture;
    const swimming = this.gen.isWater(p.position.x, p.position.z);
    let speed = swimming
      ? 2.3
      : p.stance === "prone"
        ? 1
        : p.stance === "crouch"
          ? 1.65
          : this.sprinting
            ? 6.3
            : 3.7;
    speed *=
      Math.max(0.4, 1 - Math.max(0, invWeight - 22) / 65) *
      (p.stats.fracture ? 0.5 : 1) *
      (p.stats.temperature < 34 ? 0.65 : 1);
    this.speed = this.moving ? speed : 0;
    const length = Math.hypot(input.forward, input.side) || 1,
      dx =
        ((Math.sin(p.yaw) * input.forward + Math.cos(p.yaw) * input.side) /
          length) *
        speed *
        dt,
      dz =
        ((Math.cos(p.yaw) * input.forward - Math.sin(p.yaw) * input.side) /
          length) *
        speed *
        dt;
    const moved = this.collision.move(
      p.position,
      dx,
      dz,
      0.32,
      p.stance === "prone" ? 0.5 : p.stance === "crouch" ? 1.05 : 1.75,
    );
    const d = distance(p.position, moved);
    p.distance += d;
    this.footstep += d;
    p.position.x = moved.x;
    p.position.z = moved.z;
    if (
      input.jump &&
      !this.previousJump &&
      this.grounded &&
      input.forward > 0 &&
      d < speed * dt * 0.45 &&
      p.stats.stamina >= 12
    ) {
      const ahead = {
        x: p.position.x + Math.sin(p.yaw) * 1.05,
        y: p.position.y,
        z: p.position.z + Math.cos(p.yaw) * 1.05,
      };
      const ledge = this.collision
        .nearby(ahead.x, ahead.z, 1)
        .find(
          (c) =>
            c.maxY > p.position.y + 0.1 &&
            c.maxY <= p.position.y + 1.6 &&
            ahead.x > c.minX - 0.4 &&
            ahead.x < c.maxX + 0.4 &&
            ahead.z > c.minZ - 0.4 &&
            ahead.z < c.maxZ + 0.4,
        );
      if (ledge) {
        ahead.y = ledge.maxY + 0.02;
        let fits = !this.collision.blocked(
          ahead.x,
          ahead.y,
          ahead.z,
          0.32,
          1.75,
        );
        if (
          !fits &&
          !this.collision.blocked(ahead.x, ahead.y, ahead.z, 0.32, 1.05)
        ) {
          fits = true;
          p.stance = "crouch";
        }
        if (fits) {
          p.position = ahead;
          p.stats.stamina -= 12;
          this.verticalVelocity = 0;
          this.previousJump = true;
          this.noise(ahead, 10, "climb");
        }
      }
    }
    const ground = this.collision.ground(
      p.position.x,
      p.position.z,
      p.position.y,
    );
    const wasGrounded = this.grounded;
    this.grounded = p.position.y <= ground + 0.06 && this.verticalVelocity <= 0;
    if (
      input.jump &&
      !this.previousJump &&
      (this.grounded || swimming) &&
      p.stats.stamina >= 8
    ) {
      this.verticalVelocity = swimming ? 2.5 : 5.2;
      p.stats.stamina -= 8;
      this.grounded = false;
    }
    this.previousJump = input.jump;
    this.verticalVelocity -= dt * (swimming ? 2 : 15);
    p.position.y += this.verticalVelocity * dt;
    if (swimming && p.position.y < -5.35) {
      p.position.y = -5.35;
      this.verticalVelocity = 0;
    }
    if (p.position.y < ground) {
      if (this.verticalVelocity < -10)
        this.damage((-this.verticalVelocity - 9) * 5, "坠落", "leg", false);
      p.position.y = ground;
      this.verticalVelocity = 0;
      this.grounded = true;
      if (!wasGrounded)
        this.bus.emit({ type: "sound", text: "land", kind: "footstep" });
    }
    if (this.sprinting) p.stats.stamina = clamp(p.stats.stamina - dt * 9);
    else
      p.stats.stamina = clamp(
        p.stats.stamina +
          dt *
            (p.stats.energy < 20 ? 3 : 12) *
            (p.stats.fatigue > 80 ? 0.45 : 1),
      );
    if (this.footstep > (this.sprinting ? 2.4 : 1.85) && this.moving) {
      this.footstep = 0;
      this.noise(
        p.position,
        p.stance === "prone"
          ? 2
          : p.stance === "crouch"
            ? 4
            : this.sprinting
              ? 17
              : 8,
        "footstep",
      );
      const surface = swimming
        ? "water"
        : this.indoors
          ? "wood"
          : this.gen.roadDistance(p.position.x, p.position.z) < 5
            ? "concrete"
            : "grass";
      this.bus.emit({
        type: "sound",
        text: surface,
        kind: "footstep",
        position: { ...p.position },
        value: this.sprinting ? 1 : 0.6,
      });
    }
  }
  inspect() {
    const p = this.state.player;
    return {
      seed: this.state.seed,
      position: { ...p.position },
      health: p.stats.health,
      stats: { ...p.stats },
      weather: this.state.weather,
      time: this.state.time,
      day: this.state.day,
      inventory: p.inventory.items.map((i) => ({
        id: i.id,
        uid: i.uid,
        count: i.count,
        ammo: i.ammo,
      })),
      equipped: this.combat.equipped()?.id,
      structures: this.state.structures.length,
      actors: Object.values(this.state.actors).filter(
        (a) => a.health > 0 && distance(a.position, p.position) < 220,
      ).length,
      kills: p.kills,
      discovered: this.state.discovered,
      flags: this.state.flags,
      crafting: this.craftJob,
      vehicle: p.vehicle,
    };
  }
}
