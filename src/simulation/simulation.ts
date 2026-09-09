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
import { ENEMIES } from "../data/enemies";
import { RECIPES } from "../data/recipes";
import { CollisionWorld } from "./collision";
import { DoorSystem } from "./doors";
import { Actions } from "./actions";
import { BuildingSystem } from "./building";
import { AISystem } from "./ai";
import { CombatSystem } from "./combat";
import { VehicleSystem } from "./vehicles";
import { populate, director } from "./population";
import { applyDamage, updateSurvival } from "./survival";
import { weight, countItem, removeItem } from "./inventory";
import { DIFFICULTIES } from "./state";
import { craftTransaction } from "./crafting";
import { LocomotionController, GAITS } from "./locomotion";
import { smoothstep } from "../core/motion";
import type { SimContext } from "./context";
import { NarrativeSystem } from "../narrative";
import { worldEventScenes, updateWorldEvents } from "./world-events";
export interface MovementInput {
  forward: number;
  side: number;
  sprint: boolean;
  jump: boolean;
  brake: boolean;
  aiming?: boolean;
  walk?: boolean;
}
export class Simulation implements SimContext {
  readonly gen: WorldGenerator;
  readonly collision: CollisionWorld;
  readonly doors: DoorSystem;
  readonly bus = new EventBus();
  readonly actions: Actions;
  readonly building: BuildingSystem;
  readonly ai: AISystem;
  readonly combat: CombatSystem;
  readonly vehicles: VehicleSystem;
  readonly narrative: NarrativeSystem;
  noises: NoiseEvent[] = [];
  god = false;
  viewFov = 80;
  viewAspect = 16 / 9;
  verticalVelocity = 0;
  grounded = true;
  moving = false;
  sprinting = false;
  indoors = false;
  speed = 0;
  footstep = 0;
  readonly locomotion = new LocomotionController();
  private vault: {
    from: Vec3;
    to: Vec3;
    elapsed: number;
    duration: number;
  } | null = null;
  private populationTimer = 0;
  private previousJump = false;
  private previousRegion = "";
  private statTimer = 0;
  craftJob: { id: string; remaining: number; total: number } | null = null;
  constructor(public state: WorldState) {
    this.gen = new WorldGenerator(state.seed);
    this.collision = new CollisionWorld(this.gen, state);
    this.doors = new DoorSystem(this);
    this.collision.dynamicDoors = (x, z, radius) =>
      this.doors.colliders(x, z, radius);
    this.actions = new Actions(this);
    this.building = new BuildingSystem(this);
    this.ai = new AISystem(this);
    this.combat = new CombatSystem(this, this.ai);
    this.vehicles = new VehicleSystem(this, this.ai);
    this.narrative = new NarrativeSystem(this);
    this.collision.dynamicObjects = () =>
      worldEventScenes(this).flatMap((event) => event.colliders);
    this.bus.on((event) => {
      if (
        event.type === "motion" &&
        [
          "search",
          "eat",
          "drink",
          "heal",
          "interact",
          "repair",
          "enter-vehicle",
          "harvest",
          "pickup",
          "chop",
          "craft",
        ].includes(event.text)
      )
        this.combat.cancelReload();
    });
    populate(this);
  }
  get busy() {
    return this.craftJob !== null;
  }
  get recipes() {
    return [...RECIPES, ...this.narrative.unlockedRecipes];
  }
  rechargeFlashlight(): boolean {
    const p = this.state.player;
    if (p.flashlightCharge >= 99) {
      this.notify("手电电量充足。");
      return false;
    }
    if (
      !this.building.powered(p.position) &&
      !countItem(p.inventory, "battery")
    ) {
      this.notify(
        "靠近运行中的发电机，或使用一块蓄电池为手电充电。",
        "warning",
      );
      return false;
    }
    return this.actions.begin(
      "repair",
      "正在为手电充电",
      2,
      () => {
        if (
          !this.building.powered(p.position) &&
          !removeItem(p.inventory, "battery", 1)
        ) {
          this.notify("已离开供电范围，且没有备用蓄电池。", "warning");
          return false;
        }
        p.flashlightCharge = 100;
        this.notify("手电已充满。", "success");
        return true;
      },
      { target: { ...p.position } },
    );
  }
  cancelCraft() {
    if (!this.craftJob) return;
    this.craftJob = null;
    this.bus.emit({ type: "motion", text: "cancel", value: 0.15 });
    this.notify("制作已取消，材料已保留。");
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
    if (damage > 4 && this.actions.pending)
      this.actions.cancel("受到攻击，操作被打断。");
    if (p.stats.bleeding > 0 && !this.state.flags.includes("bleed-tutorial")) {
      this.state.flags.push("bleed-tutorial");
      this.notify("你正在流血。打开背包使用绷带。", "warning");
    }
    if (p.stats.health <= 0) this.actions.die();
  }
  startCraft(id: string): boolean {
    if (this.actions.pending) {
      this.notify("先完成手中的操作。", "warning");
      return false;
    }
    if (this.craftJob) {
      this.notify("正在制作，完成后再开始下一件。", "warning");
      return false;
    }
    const recipe = this.recipes.find((r) => r.id === id);
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
    this.bus.emit({ type: "motion", text: "craft", value: recipe.seconds });
    return true;
  }
  tickCraft(dt: number): void {
    if (!this.craftJob) return;
    this.craftJob.remaining = Math.max(0, this.craftJob.remaining - dt);
    if (this.craftJob.remaining === 0) {
      const recipe = this.recipes.find((r) => r.id === this.craftJob!.id)!;
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
    this.collision.queries = 0;
    dt = Math.min(dt, 0.05);
    if (this.state.player.stats.health <= 0) return;
    const s = this.state,
      p = s.player;
    s.elapsed += dt;
    this.doors.update(dt);
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
      this.vehicles.update(dt, input.forward, input.side, input.brake);
      this.moving =
        Math.abs(s.vehicles.find((v) => v.id === p.vehicle)?.speed ?? 0) > 1;
      this.sprinting = false;
    } else this.move(dt, input);
    this.indoors =
      this.state.structures.some(
        (b) =>
          b.health > 0 &&
          b.kind === "roof" &&
          Math.abs(p.position.x - b.position.x) < 2.1 &&
          Math.abs(p.position.z - b.position.z) < 2.1 &&
          p.position.y + 1 < b.position.y + 3.12 &&
          p.position.y > b.position.y - 0.4,
      ) ||
      this.gen.pois.some(
        (poi) =>
          Math.abs(p.position.x - poi.x) < poi.width / 2 &&
          Math.abs(p.position.z - poi.z) < poi.depth / 2 &&
          p.position.y < this.gen.poiHeight(poi) + 3.5,
      );
    const held = this.combat.equipped();
    if (p.flashlight) {
      p.flashlightCharge = clamp(p.flashlightCharge - dt / 18);
      if (
        p.flashlightCharge < 15 &&
        s.elapsed >= (s.cooldowns["flashlight-warning"] ?? 0)
      ) {
        this.bus.emit({
          type: "sound",
          text: "手电电量低",
          kind: "flashlight-low",
        });
        s.cooldowns["flashlight-warning"] = s.elapsed + 45;
        this.notify(
          "手电电量不足。可在背包中使用蓄电池，或靠近发电机充电。",
          "warning",
        );
      }
      if (p.flashlightCharge === 0) {
        p.flashlight = false;
        this.notify("手电已耗尽，请补充电量。", "warning");
      }
    }
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
    this.actions.update(dt);
    updateWorldEvents(this);
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
  setStance(stance: "stand" | "crouch" | "prone"): boolean {
    const p = this.state.player;
    const height = stance === "stand" ? 1.75 : stance === "crouch" ? 1.05 : 0.5;
    if (
      this.collision.blocked(
        p.position.x,
        p.position.y,
        p.position.z,
        0.31,
        height,
      )
    ) {
      this.notify("上方空间不足，无法改变姿态。", "warning");
      return false;
    }
    p.stance = stance;
    return true;
  }
  private move(dt: number, input: MovementInput): void {
    const p = this.state.player,
      motion = this.locomotion;
    motion.landingSpeed = 0;
    if (this.vault) {
      const v = this.vault;
      v.elapsed = Math.min(v.duration, v.elapsed + dt);
      const t = v.elapsed / v.duration,
        blend = smoothstep(t);
      motion.vaultProgress = t;
      p.position.x = v.from.x + (v.to.x - v.from.x) * blend;
      p.position.z = v.from.z + (v.to.z - v.from.z) * blend;
      p.position.y =
        v.from.y + (v.to.y - v.from.y) * blend + Math.sin(t * Math.PI) * 0.14;
      this.moving = true;
      this.sprinting = false;
      this.speed = 0;
      this.verticalVelocity = 0;
      this.previousJump = input.jump;
      if (t === 1) {
        this.vault = null;
        this.grounded = true;
        motion.reset();
        this.bus.emit({ type: "motion", text: "vault-land", value: 0.3 });
      }
      return;
    }
    motion.vaultProgress = -1;
    const invWeight = weight(p.inventory);
    const swimming = this.gen.isWater(p.position.x, p.position.z);
    const requested = motion.step(dt, {
      forward: input.forward,
      side: input.side,
      yaw: p.yaw,
      stance: p.stance,
      sprint: input.sprint,
      walk: input.walk ?? false,
      aiming: input.aiming ?? false,
      swimming,
      weight: invWeight,
      stamina: p.stats.stamina,
      fracture: p.stats.fracture,
      temperature: p.stats.temperature,
      grounded: this.grounded,
    });
    const moved = this.collision.move(
      p.position,
      requested.dx,
      requested.dz,
      0.32,
      p.stance === "prone" ? 0.5 : p.stance === "crouch" ? 1.05 : 1.75,
    );
    const approachesActor = (x: number, z: number) =>
      Object.values(this.state.actors).some((a) => {
        if (
          a.health <= 0 ||
          Math.abs(a.position.x - p.position.x) > 2 ||
          Math.abs(a.position.z - p.position.z) > 2
        )
          return false;
        const def = ENEMIES[a.kind],
          height = def.animal
            ? a.kind === "deer"
              ? 1.4
              : 1.1
            : 1.7 * def.size;
        if (
          p.position.y > a.position.y + height ||
          p.position.y +
            (p.stance === "prone" ? 0.5 : p.stance === "crouch" ? 1.05 : 1.75) <
            a.position.y + 0.1
        )
          return false;
        const radius = def.animal ? 0.75 : 0.32 + 0.4 * def.size,
          before = Math.hypot(
            p.position.x - a.position.x,
            p.position.z - a.position.z,
          ),
          after = Math.hypot(x - a.position.x, z - a.position.z);
        return after < radius && after < before - 0.00001;
      });
    if (approachesActor(moved.x, moved.z)) {
      if (!approachesActor(moved.x, p.position.z)) moved.z = p.position.z;
      else if (!approachesActor(p.position.x, moved.z)) moved.x = p.position.x;
      else {
        moved.x = p.position.x;
        moved.z = p.position.z;
      }
    }
    const dx = moved.x - p.position.x,
      dz = moved.z - p.position.z;
    const travelled = Math.hypot(dx, dz);
    if (Math.abs(dx) < Math.abs(requested.dx) * 0.2) motion.velocity.x = 0;
    if (Math.abs(dz) < Math.abs(requested.dz) * 0.2) motion.velocity.z = 0;
    p.distance += travelled;
    this.footstep += travelled;
    p.position.x = moved.x;
    p.position.z = moved.z;
    this.speed = dt > 0 ? travelled / dt : 0;
    this.moving = this.speed > 0.025;
    this.sprinting = motion.gait === "sprint" && this.moving;
    if (
      input.jump &&
      !this.previousJump &&
      this.grounded &&
      input.forward > 0 &&
      travelled < Math.hypot(requested.dx, requested.dz) * 0.45 &&
      p.stats.stamina >= 12 &&
      p.stance !== "prone"
    ) {
      const ahead = {
        x: p.position.x + Math.sin(p.yaw) * 1.1,
        y: p.position.y,
        z: p.position.z + Math.cos(p.yaw) * 1.1,
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
          this.vault = {
            from: { ...p.position },
            to: ahead,
            elapsed: 0,
            duration: 0.42 + (ahead.y - p.position.y) * 0.16,
          };
          p.stats.stamina -= 12;
          this.previousJump = true;
          motion.vaultProgress = 0;
          this.noise(p.position, 10, "climb");
          this.bus.emit({
            type: "motion",
            text: ahead.y - p.position.y > 1.1 ? "climb" : "vault",
            value: this.vault.duration,
          });
          return;
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
      p.stats.stamina >= 8 &&
      p.stance !== "prone"
    ) {
      this.verticalVelocity = swimming ? 2.5 : 5.2;
      p.stats.stamina -= 8;
      this.grounded = false;
      this.bus.emit({ type: "motion", text: "jump", value: 0.35 });
    }
    this.previousJump = input.jump;
    this.verticalVelocity -= dt * (swimming ? 2 : 15);
    p.position.y += this.verticalVelocity * dt;
    if (swimming && p.position.y < -5.35) {
      p.position.y = -5.35;
      this.verticalVelocity = 0;
    }
    if (p.position.y < ground) {
      const impact = Math.abs(this.verticalVelocity);
      if (this.verticalVelocity < -10)
        this.damage((impact - 9) * 5, "坠落", "leg", false);
      p.position.y = ground;
      this.verticalVelocity = 0;
      this.grounded = true;
      if (!wasGrounded && impact > 1) {
        motion.landingSpeed = impact;
        p.stats.stamina = clamp(
          p.stats.stamina - Math.max(0, impact - 4) * 1.2,
        );
        this.noise(p.position, 8 + impact * 1.5, "landing");
        this.bus.emit({
          type: "sound",
          text: "land",
          kind: "footstep",
          value: clamp(impact / 9, 0.25, 1.5),
        });
        this.bus.emit({ type: "motion", text: "land", value: impact });
      }
    }
    const stepped = motion.travelled(dx, dz, dt, this.grounded);
    const profile = GAITS[motion.gait];
    const recovery =
      this.sprinting || swimming
        ? 0
        : !this.moving
          ? 12
          : motion.gait === "walk"
            ? 7
            : motion.gait === "prone"
              ? 0
              : 4;
    p.stats.stamina = clamp(
      p.stats.stamina +
        dt *
          (recovery *
            (p.stats.energy < 20 ? 0.3 : 1) *
            (p.stats.fatigue > 80 ? 0.45 : 1) -
            (this.moving ? profile.stamina : 0)),
    );
    if (stepped && this.moving) {
      this.footstep = 0;
      const volume =
        (this.sprinting
          ? 1
          : p.stance === "crouch"
            ? 0.32
            : p.stance === "prone"
              ? 0.22
              : input.walk
                ? 0.42
                : 0.65) *
        (0.85 + invWeight / 90);
      this.noise(
        p.position,
        p.stance === "prone"
          ? 2
          : p.stance === "crouch"
            ? 4
            : this.sprinting
              ? 17
              : input.walk
                ? 5
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
        value: volume,
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
      action: this.actions.pending,
      movement: {
        gait: this.locomotion.gait,
        speed: this.speed,
        velocity: { ...this.locomotion.velocity },
        phase: this.locomotion.phase,
        grounded: this.grounded,
        vault: this.locomotion.vaultProgress,
      },
      vehicle: p.vehicle,
    };
  }
}
