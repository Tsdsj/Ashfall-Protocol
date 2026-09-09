import {
  clamp,
  distance,
  type ActorData,
  type AIState,
  type BodyPart,
  type HitContext,
  type NoiseEvent,
  type Vec3,
} from "../core/types";
import { ENEMIES } from "../data/enemies";
import { random } from "../core/random";
import { angleDelta, damp, dampAngle, smoothstep } from "../core/motion";
import { LocalNavigator } from "./navigation";
import { normalizeActor } from "./quality-state";
import type { SimContext } from "./context";

interface Senses {
  next: number;
  sees: boolean;
  heard: NoiseEvent | null;
  vocalAt: number;
  stuck: number;
}
export class AISystem {
  readonly navigation: LocalNavigator;
  private senses = new Map<string, Senses>();
  constructor(private ctx: SimContext) {
    this.navigation = new LocalNavigator(ctx);
  }
  private state(actor: ActorData, state: AIState) {
    if (actor.state === state) return;
    actor.state = state;
    actor.stateAge = 0;
  }
  private vocal(actor: ActorData, phase: string, gain = 0.7) {
    this.ctx.bus.emit({
      type: "sound",
      text: phase,
      kind: "growl",
      actorId: actor.id,
      position: { ...actor.position, y: actor.position.y + 1.1 },
      value: gain,
    });
  }
  private sense(actor: ActorData, memory: Senses) {
    const { state, collision } = this.ctx,
      p = state.player,
      def = ENEMIES[actor.kind];
    const dist = distance(actor.position, p.position),
      night = state.time < 6 || state.time > 20;
    const torch = p.inventory.items.some(
      (i) =>
        i.uid === p.quickSlots[p.selected] &&
        i.id === "torch" &&
        i.durability > 0,
    );
    const fire = state.structures.some(
      (b) =>
        b.kind === "campfire" &&
        b.active &&
        b.fuel > 0 &&
        distance(b.position, p.position) < 8,
    );
    const light = p.flashlight || torch ? 1.45 : fire ? 1.25 : night ? 0.55 : 1;
    const posture =
      p.stance === "prone" ? 0.3 : p.stance === "crouch" ? 0.55 : 1;
    const weather =
      state.weather === "fog" ? 0.55 : state.weather === "storm" ? 0.7 : 1;
    const eye = {
      ...actor.position,
      y: actor.position.y + (def.animal ? 0.75 : 1.5),
    };
    const target = {
      ...p.position,
      y:
        p.position.y +
        (p.stance === "prone" ? 0.4 : p.stance === "crouch" ? 0.95 : 1.4),
    };
    const angle = Math.abs(
      angleDelta(
        actor.yaw,
        Math.atan2(
          p.position.x - actor.position.x,
          p.position.z - actor.position.z,
        ),
      ),
    );
    memory.sees =
      p.stats.health > 0 &&
      dist < def.sight * posture * light * weather &&
      (angle < 1.3 || dist < 3.5 || actor.awareness > 0.65) &&
      collision.visible(eye, target);
    memory.heard =
      this.ctx.noises.find(
        (n) =>
          distance(n.position, actor.position) < n.radius &&
          (n.kind !== "footstep" || dist < 15),
      ) ?? null;
    memory.next = state.elapsed + 0.12 + (actor.phase % 1) * 0.035;
  }
  private attack(
    actor: ActorData,
    target: "player" | "door" | "structure" = "player",
    id = "",
  ) {
    const def = ENEMIES[actor.kind],
      windup =
        actor.kind === "bloated"
          ? 0.46
          : actor.kind === "runner"
            ? 0.27
            : def.animal
              ? 0.3
              : 0.35;
    actor.attack = {
      elapsed: 0,
      duration: Math.max(def.interval, windup + 0.4),
      hitTime: windup,
      hit: false,
      yaw: actor.yaw,
      target,
      targetId: id,
    };
    actor.cooldown = actor.attack.duration;
    this.state(actor, "windup");
    this.vocal(actor, "attack", 0.95);
  }
  private tickAttack(actor: ActorData, dt: number): boolean {
    const attack = actor.attack;
    if (!attack) return false;
    const p = this.ctx.state.player,
      def = ENEMIES[actor.kind];
    attack.elapsed = Math.min(attack.duration, attack.elapsed + dt);
    if (attack.elapsed < attack.hitTime * 0.65 && attack.target === "player") {
      actor.yaw = dampAngle(
        actor.yaw,
        Math.atan2(
          p.position.x - actor.position.x,
          p.position.z - actor.position.z,
        ),
        8,
        dt,
      );
      attack.yaw = actor.yaw;
    }
    if (!attack.hit && attack.elapsed >= attack.hitTime) {
      attack.hit = true;
      this.state(actor, "attack");
      if (attack.target === "door")
        this.ctx.doors.damage(
          attack.targetId,
          def.damage * (1 - actor.armDamage * 0.005),
        );
      else if (attack.target === "structure") {
        const structure = this.ctx.state.structures.find(
          (b) => b.id === attack.targetId,
        );
        if (structure && distance(structure.position, actor.position) < 2.8) {
          structure.health = Math.max(0, structure.health - def.damage * 0.8);
          this.ctx.bus.emit({
            type: "hit",
            text: "撞击营地结构",
            kind: "wall",
            material: "wood",
            position: { ...structure.position, y: structure.position.y + 1 },
            value: def.damage,
          });
          this.ctx.noise(structure.position, 15, "impact");
        }
      } else {
        const dist = distance(actor.position, p.position),
          angle = Math.abs(
            angleDelta(
              attack.yaw,
              Math.atan2(
                p.position.x - actor.position.x,
                p.position.z - actor.position.z,
              ),
            ),
          );
        const eye = {
            ...actor.position,
            y: actor.position.y + (def.animal ? 0.75 : 1.45),
          },
          target = {
            ...p.position,
            y: p.position.y + (p.stance === "prone" ? 0.4 : 1.2),
          };
        if (actor.kind === "raider") {
          const len =
            Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z) ||
            1;
          this.ctx.bus.emit({
            type: "shot",
            text: "掠夺者开火",
            kind: "enemy",
            position: eye,
            direction: {
              x: (target.x - eye.x) / len,
              y: (target.y - eye.y) / len,
              z: (target.z - eye.z) / len,
            },
            actorId: actor.id,
          });
          this.ctx.noise(actor.position, 100, "enemyshot");
        }
        if (
          dist < def.reach + 0.15 &&
          angle < (actor.kind === "raider" ? 0.65 : 1.05) &&
          this.ctx.collision.visible(eye, target) &&
          p.stats.health > 0 &&
          (actor.kind !== "raider" ||
            Math.sin(this.ctx.state.elapsed * 31 + actor.phase) > 0.12)
        )
          this.ctx.damage(
            def.damage * Math.max(0.4, 1 - actor.armDamage * 0.006),
            def.name,
            def.animal ? "leg" : "chest",
          );
      }
    }
    if (
      attack.elapsed > attack.hitTime + 0.14 &&
      attack.elapsed < attack.duration
    )
      this.state(actor, "recover");
    if (attack.elapsed >= attack.duration) {
      actor.attack = null;
      this.state(actor, actor.kind === "raider" ? "cover" : "chase");
      actor.timer = actor.kind === "raider" ? 1.3 : 0;
    }
    actor.speed = damp(actor.speed, 0, 20, dt);
    return true;
  }
  private ground(actor: ActorData, dt: number) {
    if (actor.traversal) return;
    const ground = this.ctx.collision.ground(
      actor.position.x,
      actor.position.z,
      actor.position.y,
    );
    if (actor.position.y > ground + 0.08) {
      actor.verticalVelocity -= 15 * dt;
      actor.position.y = Math.max(
        ground,
        actor.position.y + actor.verticalVelocity * dt,
      );
    } else {
      actor.position.y = ground;
      actor.verticalVelocity = 0;
    }
  }
  private separation(actor: ActorData, actors: ActorData[], dt: number) {
    let x = 0,
      z = 0;
    const player = this.ctx.state.player.position,
      px = actor.position.x - player.x,
      pz = actor.position.z - player.z,
      pd = Math.hypot(px, pz);
    if (pd < 1.05 && Math.abs(actor.position.y - player.y) < 1.3) {
      const safe = pd || 1;
      x +=
        (pd > 0.001 ? px / safe : Math.sin(actor.yaw + Math.PI)) *
        (1.05 - pd) *
        12;
      z +=
        (pd > 0.001 ? pz / safe : Math.cos(actor.yaw + Math.PI)) *
        (1.05 - pd) *
        12;
    }
    for (const other of actors) {
      if (
        other === actor ||
        other.health <= 0 ||
        Math.abs(other.position.y - actor.position.y) > 1.3
      )
        continue;
      const dx = actor.position.x - other.position.x,
        dz = actor.position.z - other.position.z,
        dist = Math.hypot(dx, dz);
      if (dist > 0.95) continue;
      const angle = actor.phase + other.phase;
      x += (dist > 0.001 ? dx / dist : Math.cos(angle)) * (0.95 - dist) * 2.5;
      z += (dist > 0.001 ? dz / dist : Math.sin(angle)) * (0.95 - dist) * 2.5;
    }
    const amount = Math.hypot(x, z);
    if (amount > 0) {
      const scale = Math.min(1, 1.5 / amount);
      const position = this.ctx.collision.move(
        actor.position,
        x * scale * dt,
        z * scale * dt,
        0.34,
        ENEMIES[actor.kind].animal ? 1 : 1.7,
      );
      actor.position.x = position.x;
      actor.position.z = position.z;
    }
  }
  private traverse(actor: ActorData, goal: Vec3): boolean {
    if (ENEMIES[actor.kind].animal || actor.kind === "bloated") return false;
    const dx = goal.x - actor.position.x,
      dz = goal.z - actor.position.z,
      length = Math.hypot(dx, dz) || 1;
    const maximum = ["runner", "stalker", "raider"].includes(actor.kind)
      ? 1.5
      : 0.85;
    const ahead = {
      x: actor.position.x + (dx / length) * 0.8,
      z: actor.position.z + (dz / length) * 0.8,
    };
    const obstacle = this.ctx.collision
      .nearby(ahead.x, ahead.z, 1)
      .find(
        (c) =>
          !c.door &&
          c.maxY > actor.position.y + 0.12 &&
          c.maxY - actor.position.y <= maximum &&
          ahead.x > c.minX - 0.35 &&
          ahead.x < c.maxX + 0.35 &&
          ahead.z > c.minZ - 0.35 &&
          ahead.z < c.maxZ + 0.35,
      );
    if (!obstacle) return false;
    const to = this.ctx.gen.position(
      actor.position.x + (dx / length) * 1.8,
      actor.position.z + (dz / length) * 1.8,
    );
    if (this.ctx.collision.blocked(to.x, to.y, to.z, 0.34, 1.7)) return false;
    actor.traversal = {
      from: { ...actor.position },
      to,
      elapsed: 0,
      duration: 0.75 + (obstacle.maxY - actor.position.y) * 0.2,
      height: obstacle.maxY - actor.position.y + 0.22,
    };
    this.state(actor, "vault");
    this.navigation.clear(actor.id);
    return true;
  }
  private doorRoute(actor: ActorData, goal: Vec3): Vec3 | null {
    const possible = Object.values(this.ctx.state.doorStates)
      .filter(
        (d) =>
          d.status !== "broken" && d.progress < 0.85 && d.kind !== "vehicle",
      )
      .map((d) => ({ door: d, geometry: this.ctx.doors.geometry(d.id) }))
      .filter(
        (e) => !!e.geometry && distance(e.geometry!.hinge, actor.position) < 22,
      )
      .sort(
        (a, b) =>
          distance(a.geometry!.hinge, actor.position) -
          distance(b.geometry!.hinge, actor.position),
      );
    const selected = possible[0];
    if (!selected?.geometry) return null;
    const g = selected.geometry,
      center = {
        x: g.hinge.x + (Math.cos(g.yaw) * g.width) / 2,
        y: g.hinge.y,
        z: g.hinge.z - (Math.sin(g.yaw) * g.width) / 2,
      };
    if (distance(actor.position, center) < 2.3) {
      if (actor.kind === "raider") this.ctx.doors.request(g.id, true, "human");
      else if (actor.awareness > 0.25 && actor.cooldown <= 0)
        this.attack(actor, "door", g.id);
    }
    const side =
      (actor.position.z - center.z) * Math.cos(g.yaw) +
        (actor.position.x - center.x) * Math.sin(g.yaw) >
      0
        ? 1
        : -1;
    const point = {
      x: center.x + Math.sin(g.yaw) * side * 1.5,
      y: center.y,
      z: center.z + Math.cos(g.yaw) * side * 1.5,
    };
    return distance(goal, point) > 1 ? point : null;
  }
  private move(actor: ActorData, goal: Vec3, dt: number, memory: Senses) {
    const def = ENEMIES[actor.kind];
    let target = goal;
    const route = this.navigation.waypoint(actor, goal);
    if (route.found) target = route.point;
    else if (actor.awareness > 0.25)
      target = this.doorRoute(actor, goal) ?? route.point;
    if (actor.attack) return;
    const dx = target.x - actor.position.x,
      dz = target.z - actor.position.z,
      length = Math.hypot(dx, dz);
    if (length < 0.5) {
      actor.speed = damp(actor.speed, 0, 18, dt);
      if (!["chase", "flee", "cover"].includes(actor.state)) {
        this.state(actor, "idle");
        actor.timer = 2 + (actor.phase % 3);
      }
      return;
    }
    let speed =
      def.speed *
      (actor.state === "wander"
        ? 0.4
        : actor.state === "search"
          ? 0.65
          : actor.state === "investigate"
            ? 0.72
            : actor.state === "flee"
              ? 1.25
              : 1);
    if (!def.animal) speed *= Math.max(0.25, 1 - actor.legDamage * 0.0065);
    if (actor.state === "chase" && !def.animal)
      speed *=
        actor.kind === "runner"
          ? Math.sin(this.ctx.state.elapsed * 1.9 + actor.phase) > 0.45
            ? 1.17
            : 0.92
          : 0.94 + Math.sin(actor.gaitPhase) * 0.06;
    actor.speed = damp(actor.speed, speed, 9, dt);
    const vx = (dx / length) * actor.speed * dt,
      vz = (dz / length) * actor.speed * dt;
    const moved = this.ctx.collision.move(
      actor.position,
      vx,
      vz,
      0.34,
      def.animal ? 1 : 1.7,
    );
    const travelled = distance(moved, actor.position);
    if (travelled < actor.speed * dt * 0.18) {
      memory.stuck += dt;
      if (actor.awareness > 0.3 && this.traverse(actor, goal)) return;
      if (memory.stuck > 0.3) {
        const point = this.doorRoute(actor, goal);
        if (!point) {
          const barrier = this.ctx.state.structures.find(
            (b) =>
              b.health > 0 &&
              ["wall", "window", "fence", "gate"].includes(b.kind) &&
              distance(b.position, actor.position) < 2.5,
          );
          if (barrier && actor.cooldown <= 0 && actor.awareness > 0.3)
            this.attack(actor, "structure", barrier.id);
        }
      }
      if (memory.stuck > 1.5) {
        this.navigation.clear(actor.id);
        memory.stuck = 0;
      }
    } else memory.stuck = 0;
    actor.position.x = moved.x;
    actor.position.z = moved.z;
    actor.yaw = dampAngle(
      actor.yaw,
      Math.atan2(dx, dz),
      def.animal ? 11 : 8,
      dt,
    );
    actor.gaitPhase +=
      (travelled / (def.animal ? 2.2 : actor.speed > 3 ? 3.0 : 1.7)) *
      Math.PI *
      2;
    actor.speed = dt > 0 ? travelled / dt : 0;
  }
  update(dt: number): void {
    const { state, gen } = this.ctx,
      p = state.player;
    this.navigation.beginFrame();
    const actors = Object.values(state.actors).filter(
      (a) => distance(a.position, p.position) < 220,
    );
    for (const actor of actors) {
      normalizeActor(actor);
      actor.stateAge += dt;
      if (actor.health <= 0) {
        this.state(actor, "dead");
        this.ground(actor, dt);
        continue;
      }
      let memory = this.senses.get(actor.id);
      if (!memory) {
        memory = {
          next: 0,
          sees: false,
          heard: null,
          vocalAt: state.elapsed + 2 + (actor.phase % 12),
          stuck: 0,
        };
        this.senses.set(actor.id, memory);
      }
      actor.timer -= dt;
      if ((state.cooldowns["ai-hold:" + actor.id] ?? 0) > state.elapsed) {
        actor.attack = null;
        actor.speed = 0;
        this.state(actor, "idle");
        continue;
      }
      if ((state.cooldowns["ai-withdraw:" + actor.id] ?? 0) > state.elapsed) {
        actor.attack = null;
        this.state(actor, "flee");
        this.ground(actor, dt);
        this.move(actor, actor.target, dt, memory);
        continue;
      }
      actor.cooldown = Math.max(0, actor.cooldown - dt);
      actor.lastSeen += dt;
      if (actor.reaction) {
        actor.reaction.elapsed += dt;
        if (actor.reaction.elapsed >= actor.reaction.duration)
          actor.reaction = null;
      }
      if (actor.traversal) {
        const v = actor.traversal;
        v.elapsed = Math.min(v.duration, v.elapsed + dt);
        const t = v.elapsed / v.duration,
          u = smoothstep((t - 0.15) / 0.7);
        actor.position.x = v.from.x + (v.to.x - v.from.x) * u;
        actor.position.z = v.from.z + (v.to.z - v.from.z) * u;
        actor.position.y =
          v.from.y + (v.to.y - v.from.y) * u + Math.sin(t * Math.PI) * v.height;
        if (t === 1) {
          actor.traversal = null;
          this.state(actor, "chase");
        }
        continue;
      }
      this.ground(actor, dt);
      if (actor.state === "knockdown") {
        actor.speed = 0;
        if (actor.stateAge > 1.35) this.state(actor, "getup");
        this.separation(actor, actors, dt);
        continue;
      }
      if (actor.state === "getup") {
        actor.speed = 0;
        if (actor.stateAge > 1.05) {
          actor.behavior = "standing";
          this.state(actor, "chase");
        }
        continue;
      }
      if (actor.state === "stagger") {
        actor.speed = 0;
        if (actor.stateAge > 0.38) this.state(actor, "chase");
        this.separation(actor, actors, dt);
        continue;
      }
      if (this.tickAttack(actor, dt)) {
        this.separation(actor, actors, dt);
        continue;
      }
      if (state.elapsed >= memory.next) this.sense(actor, memory);
      const def = ENEMIES[actor.kind],
        dist = distance(actor.position, p.position),
        heard = memory.heard;
      actor.awareness = clamp(
        actor.awareness + (memory.sees ? dt * 3 : -dt * 0.13),
        0,
        1,
      );
      const fire = def.animal
        ? state.structures.find(
            (b) =>
              b.kind === "campfire" &&
              b.active &&
              b.fuel > 0 &&
              distance(b.position, actor.position) < 13,
          )
        : undefined;
      const startling =
        def.animal &&
        heard &&
        ["gunshot", "enemyshot", "explosion"].includes(heard.kind);
      if (fire || startling) {
        actor.target = { ...(fire?.position ?? heard!.position) };
        this.state(actor, "flee");
        actor.timer = 6;
      } else if (def.animal && actor.state === "flee" && actor.timer > 0) {
        /* Commit to the escape before reassessing. */
      } else if (
        memory.sees &&
        actor.kind === "boar" &&
        dist > 7 &&
        actor.health === def.health
      ) {
        if (!["idle", "wander"].includes(actor.state)) {
          this.state(actor, "idle");
          actor.timer = 3;
        }
      } else if (memory.sees) {
        actor.target = { ...p.position };
        actor.lastSeen = 0;
        if (
          actor.kind === "deer" ||
          (actor.kind === "stalker" && p.flashlight && dist < 12)
        ) {
          this.state(actor, "flee");
          actor.timer = 2;
        } else if (
          ["sitting", "lying", "feeding", "wallLean"].includes(
            actor.behavior,
          ) &&
          actor.state === "idle" &&
          actor.awareness > 0.25
        ) {
          this.state(actor, "getup");
          this.vocal(actor, "alert");
        } else if (actor.awareness > 0.2 || dist < 3) {
          if (actor.state === "idle" || actor.state === "wander")
            this.vocal(actor, "alert");
          if (actor.state !== "cover" || actor.timer <= 0)
            this.state(actor, "chase");
          if (
            dist < def.reach &&
            actor.cooldown <= 0 &&
            actor.state !== "cover"
          )
            this.attack(actor);
        }
      } else if (heard && actor.state !== "flee") {
        const uncertainty = Math.min(
            5,
            distance(actor.position, heard.position) * 0.035,
          ),
          rng = random(actor.id + ":heard:" + Math.floor(state.elapsed));
        actor.target = {
          ...heard.position,
          x: heard.position.x + (rng() - 0.5) * uncertainty,
          z: heard.position.z + (rng() - 0.5) * uncertainty,
        };
        actor.awareness = Math.max(actor.awareness, 0.55);
        this.state(actor, actor.kind === "deer" ? "flee" : "investigate");
        actor.timer = 10;
      } else if (actor.state === "chase" && actor.lastSeen > 4.5) {
        this.state(actor, "search");
        actor.timer = 7;
      }
      if (actor.attack) {
        this.separation(actor, actors, dt);
        continue;
      }
      let target: Vec3 | null = null;
      if (["chase", "investigate", "search"].includes(actor.state))
        target = actor.target;
      if (actor.state === "flee") {
        const dx = actor.position.x - actor.target.x,
          dz = actor.position.z - actor.target.z,
          len = Math.hypot(dx, dz) || 1;
        target = gen.position(
          actor.position.x + (dx / len) * 12,
          actor.position.z + (dz / len) * 12,
        );
        if (
          (distance(actor.position, actor.target) > 45 && actor.timer <= 0) ||
          dist > 100
        ) {
          this.state(actor, "idle");
          actor.timer = 5;
          target = null;
        }
      }
      if (actor.state === "cover") {
        const covers = this.ctx.collision
          .nearby(actor.position.x, actor.position.z, 12)
          .filter((c) => c.maxY - c.minY > 1);
        const cover = covers.sort(
          (a, b) =>
            Math.hypot(a.minX - actor.position.x, a.minZ - actor.position.z) -
            Math.hypot(b.minX - actor.position.x, b.minZ - actor.position.z),
        )[0];
        if (cover) {
          const cx = (cover.minX + cover.maxX) / 2,
            cz = (cover.minZ + cover.maxZ) / 2,
            dx = cx - p.position.x,
            dz = cz - p.position.z,
            len = Math.hypot(dx, dz) || 1;
          target = gen.position(cx + (dx / len) * 1.8, cz + (dz / len) * 1.8);
        }
        if (actor.timer <= 0) this.state(actor, "chase");
      }
      if (actor.state === "idle" && actor.timer <= 0) {
        if (
          ["sitting", "lying", "feeding", "wallLean"].includes(actor.behavior)
        ) {
          actor.timer = 8;
        } else {
          const rng = random(
            actor.id + ":wander:" + Math.floor(state.elapsed / 8),
          );
          actor.target = gen.position(
            actor.home.x + (rng() - 0.5) * 18,
            actor.home.z + (rng() - 0.5) * 18,
          );
          this.state(actor, "wander");
          actor.timer = 8;
        }
      }
      if (actor.state === "wander") target = actor.target;
      if (
        actor.state === "chase" &&
        actor.kind !== "raider" &&
        memory.sees &&
        dist < Math.max(1.15, def.reach * 0.84)
      )
        target = null;
      if (target) this.move(actor, target, dt, memory);
      else actor.speed = damp(actor.speed, 0, 15, dt);
      this.separation(actor, actors, dt);
      this.ground(actor, dt);
      if (
        ["search", "investigate", "wander"].includes(actor.state) &&
        actor.timer <= 0
      ) {
        this.state(actor, "idle");
        actor.timer = 3 + (actor.phase % 4);
        actor.awareness = Math.min(actor.awareness, 0.25);
      }
      if (def.animal && gen.isWater(actor.position.x, actor.position.z)) {
        actor.target = { x: -570, y: 0, z: -615 };
        this.state(actor, "flee");
        actor.timer = 5;
      }
      if (state.elapsed > memory.vocalAt) {
        memory.vocalAt =
          state.elapsed +
          (actor.state === "chase" ? 3.5 : 9) +
          (actor.phase % 9);
        if (dist < 65)
          this.vocal(actor, actor.state, actor.state === "chase" ? 0.75 : 0.35);
      }
    }
    if (this.senses.size > 120)
      for (const id of this.senses.keys())
        if (
          !state.actors[id] ||
          distance(state.actors[id]!.position, p.position) > 300
        ) {
          this.senses.delete(id);
          this.navigation.clear(id);
        }
  }
  hurt(
    actor: ActorData,
    amount: number,
    part: BodyPart = "chest",
    hit: HitContext = {},
  ): number {
    if (actor.health <= 0) return 0;
    normalizeActor(actor);
    const armor = actor.kind === "armored" && part === "chest" ? 0.55 : 0;
    const damage =
      amount * (part === "head" ? 2.5 : part === "leg" ? 0.7 : 1) * (1 - armor);
    actor.health = Math.max(0, actor.health - damage);
    const p = this.ctx.state.player.position,
      raw = hit.direction ?? {
        x: actor.position.x - p.x,
        y: 0,
        z: actor.position.z - p.z,
      };
    const len = Math.hypot(raw.x, raw.y, raw.z) || 1,
      direction = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
    const localSide =
        direction.x * Math.cos(actor.yaw) - direction.z * Math.sin(actor.yaw),
      localForward =
        direction.x * Math.sin(actor.yaw) + direction.z * Math.cos(actor.yaw);
    const side =
      Math.abs(localSide) > Math.abs(localForward)
        ? localSide > 0
          ? "left"
          : "right"
        : localForward < 0
          ? "front"
          : "back";
    const impact = hit.impact ?? amount,
      source = hit.source ?? "melee";
    const knockdown =
      !ENEMIES[actor.kind].animal &&
      (source === "explosion" ||
        impact > 65 ||
        (part === "leg" && actor.legDamage > 45));
    if (part === "leg") actor.legDamage = clamp(actor.legDamage + damage * 0.9);
    if (part === "arm") actor.armDamage = clamp(actor.armDamage + damage);
    actor.reaction = {
      elapsed: 0,
      duration: knockdown ? 2.7 : 0.65,
      strength: clamp(impact / 60, 0.15, 1.8),
      direction,
      part,
      side,
      source,
    };
    actor.target = { ...p };
    actor.lastSeen = 0;
    actor.awareness = 1;
    actor.attack = null;
    actor.traversal = null;
    if (actor.health > 0) {
      this.state(
        actor,
        actor.kind === "deer"
          ? "flee"
          : knockdown
            ? "knockdown"
            : impact > 24
              ? "stagger"
              : "chase",
      );
      this.vocal(actor, "hit", 0.8);
    }
    this.ctx.bus.emit({
      type: "hit",
      text: part === "head" ? "精准命中" : "命中",
      position: hit.position ?? {
        ...actor.position,
        y:
          actor.position.y +
          (part === "head" ? 1.7 : part === "leg" ? 0.4 : 1.15),
      },
      value: damage,
      actorId: actor.id,
      direction,
      part,
      weapon: hit.weapon,
      material: "flesh",
      kind: source,
    });
    if (actor.health <= 0) {
      actor.deathTime = this.ctx.state.elapsed;
      actor.deathStyle =
        source === "explosion"
          ? 5
          : part === "leg"
            ? 4
            : side === "front"
              ? 0
              : side === "back"
                ? 1
                : side === "left"
                  ? 2
                  : 3;
      this.state(actor, "dead");
      actor.speed = 0;
      if (!ENEMIES[actor.kind].animal) this.ctx.state.player.kills++;
      this.ctx.bus.emit({
        type: "sound",
        text: "death",
        kind: "death",
        actorId: actor.id,
        position: { ...actor.position },
        value: clamp(impact / 60, 0.4, 1.5),
      });
      if (actor.kind === "bloated")
        this.ctx.state.events.push({
          id: this.ctx.nextId("gas"),
          kind: "gas",
          name: "腐蚀残留",
          position: { ...actor.position },
          start: this.ctx.state.elapsed,
          expires: this.ctx.state.elapsed + 35,
          resolved: false,
        });
    }
    return damage;
  }
}
