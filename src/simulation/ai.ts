import { distance, type ActorData, type Vec3 } from "../core/types";
import { ENEMIES } from "../data/enemies";
import { random } from "../core/random";
import type { SimContext } from "./context";
export class AISystem {
  constructor(private ctx: SimContext) {}
  update(dt: number): void {
    const { state, collision, gen, noises } = this.ctx,
      p = state.player;
    const night = state.time < 6 || state.time > 20;
    for (const a of Object.values(state.actors)) {
      if (a.health <= 0) {
        a.state = "dead";
        continue;
      }
      const def = ENEMIES[a.kind],
        dist = distance(a.position, p.position);
      if (dist > 220) continue;
      a.timer -= dt;
      a.cooldown = Math.max(0, a.cooldown - dt);
      a.lastSeen += dt;
      const stance =
        p.stance === "prone" ? 0.3 : p.stance === "crouch" ? 0.55 : 1;
      const torch = p.inventory.items.find(
        (i) =>
          i.uid === p.quickSlots[p.selected] &&
          i.id === "torch" &&
          i.durability > 0,
      );
      const light = p.flashlight || torch ? 1.5 : night ? 0.55 : 1;
      const fog =
        state.weather === "fog" ? 0.55 : state.weather === "storm" ? 0.7 : 1;
      const deltaAngle =
        Math.atan2(p.position.x - a.position.x, p.position.z - a.position.z) -
        a.yaw;
      const angle = Math.atan2(Math.sin(deltaAngle), Math.cos(deltaAngle));
      const eye = {
          ...a.position,
          y: a.position.y + (def.animal ? 0.75 : 1.5),
        },
        targetEye = {
          ...p.position,
          y: p.position.y + (p.stance === "prone" ? 0.4 : 1.2),
        };
      const canSee =
        dist < def.sight * stance * light * fog &&
        (Math.abs(angle) < 1.25 ||
          dist < 6 ||
          a.state === "chase" ||
          a.state === "attack") &&
        collision.visible(eye, targetEye) &&
        p.stats.health > 0;
      const heard = noises.find(
        (n) =>
          distance(n.position, a.position) < n.radius &&
          (n.kind !== "footstep" || dist < 15),
      );
      if (canSee) {
        a.target = { ...p.position };
        a.lastSeen = 0;
        if (a.kind === "deer") a.state = "flee";
        else if (a.kind === "stalker" && p.flashlight && dist < 15)
          a.state = "flee";
        else if (a.kind === "boar" && dist > 10 && a.health === def.health)
          a.state = "wander";
        else a.state = dist < def.reach ? "attack" : "chase";
      } else if (heard && a.state !== "flee") {
        a.target = { ...heard.position };
        a.state = def.animal && a.kind === "deer" ? "flee" : "investigate";
        a.timer = 9;
      } else if (
        (a.state === "chase" || a.state === "attack") &&
        a.lastSeen > 5
      ) {
        a.state = "search";
        a.timer = 8;
      }
      if (
        a.state === "attack" &&
        a.cooldown === 0 &&
        canSee &&
        dist < def.reach + 0.3
      ) {
        a.cooldown = def.interval;
        if (a.kind === "raider") {
          this.ctx.bus.emit({
            type: "shot",
            text: "掠夺者开火",
            position: eye,
            kind: "enemy",
          });
          this.ctx.noise(a.position, 70, "enemyshot");
          if (Math.sin(state.elapsed * 31 + a.phase) > 0.05)
            this.ctx.damage(def.damage, "掠夺者射击", "chest");
          a.state = "cover";
          a.timer = 2.2;
        } else {
          this.ctx.damage(def.damage, def.name, "chest");
          this.ctx.bus.emit({
            type: "sound",
            text: "growl",
            kind: "growl",
            position: a.position,
          });
        }
      }
      let target: Vec3 | null = null;
      let speed = def.speed;
      if (
        a.state === "chase" ||
        a.state === "investigate" ||
        a.state === "search"
      )
        target = a.target;
      if (a.state === "flee") {
        const dx = a.position.x - a.target.x,
          dz = a.position.z - a.target.z;
        const l = Math.hypot(dx, dz) || 1;
        target = {
          x: a.position.x + (dx / l) * 10,
          y: 0,
          z: a.position.z + (dz / l) * 10,
        };
        speed *= 1.3;
        if (dist > 55) {
          a.state = "idle";
          a.timer = 4;
        }
      }
      if (a.state === "cover") {
        const covers = collision.nearby(a.position.x, a.position.z, 20);
        const c = covers.sort(
          (a, b) =>
            Math.hypot(a.minX - p.position.x, a.minZ - p.position.z) -
            Math.hypot(b.minX - p.position.x, b.minZ - p.position.z),
        )[0];
        if (c) {
          const cx = (c.minX + c.maxX) / 2,
            cz = (c.minZ + c.maxZ) / 2,
            dx = cx - p.position.x,
            dz = cz - p.position.z,
            len = Math.hypot(dx, dz) || 1;
          target = { x: cx + (dx / len) * 2, y: 0, z: cz + (dz / len) * 2 };
        }
        if (a.timer <= 0) a.state = "chase";
      }
      if (a.state === "idle" && a.timer <= 0) {
        const rng = random(a.id + ":" + Math.floor(state.elapsed / 6));
        a.target = gen.position(
          a.home.x + (rng() - 0.5) * 22,
          a.home.z + (rng() - 0.5) * 22,
        );
        a.state = "wander";
        a.timer = 8;
      }
      if (a.state === "wander") {
        target = a.target;
        speed *= 0.45;
      }
      if (target) {
        const dx = target.x - a.position.x,
          dz = target.z - a.position.z,
          len = Math.hypot(dx, dz);
        if (len > 0.8) {
          let vx = (dx / len) * speed * dt,
            vz = (dz / len) * speed * dt;
          if (a.kind === "stalker" && a.state === "chase" && dist > 7) {
            vx += Math.cos(state.elapsed * 0.3 + a.phase) * 0.5 * speed * dt;
            vz += Math.sin(state.elapsed * 0.3 + a.phase) * 0.5 * speed * dt;
          }
          const moved = collision.move(
            a.position,
            vx,
            vz,
            0.35,
            def.animal ? 1 : 1.7,
          );
          if (
            Math.hypot(moved.x - a.position.x, moved.z - a.position.z) <
            speed * dt * 0.15
          ) {
            const sign = Math.sin(a.phase) > 0 ? 1 : -1;
            const around = collision.move(
              a.position,
              -vz * sign,
              vx * sign,
              0.35,
              1.7,
            );
            Object.assign(a.position, around);
            if (a.state === "chase" && a.cooldown === 0) {
              const obstruction = collision
                .nearby(a.position.x, a.position.z, 3)
                .find((c) => c.door);
              if (obstruction?.door) {
                state.doors[obstruction.door] = true;
                this.ctx.noise(a.position, 20, "door");
                a.cooldown = 3;
              } else {
                const barrier = state.structures.find(
                  (b) =>
                    b.health > 0 &&
                    ["wall", "window", "door", "fence", "gate"].includes(
                      b.kind,
                    ) &&
                    distance(b.position, a.position) < 2.5,
                );
                if (barrier) {
                  barrier.health = Math.max(
                    0,
                    barrier.health - def.damage * 0.8,
                  );
                  a.cooldown = def.interval;
                  this.ctx.noise(barrier.position, 12, "impact");
                  this.ctx.bus.emit({
                    type: "hit",
                    text: "撞击营地结构",
                    position: {
                      ...barrier.position,
                      y: barrier.position.y + 1,
                    },
                    kind: "wall",
                  });
                }
              }
            }
          } else Object.assign(a.position, moved);
          a.position.y = gen.height(a.position.x, a.position.z);
          a.yaw = Math.atan2(vx, vz);
        } else if (a.state !== "chase") {
          a.state = "idle";
          a.timer = 3 + (Math.sin(a.phase) + 1) * 2;
        }
      }
      if (
        (a.state === "search" ||
          a.state === "investigate" ||
          a.state === "wander") &&
        a.timer <= 0
      ) {
        a.state = "idle";
        a.timer = 3;
      }
      // Doors, not teleportation, are the only way an infected actor opens a blocked route.
      if (def.animal && gen.isWater(a.position.x, a.position.z)) {
        a.state = "flee";
        a.target = { x: -570, y: 0, z: -615 };
      }
    }
  }
  hurt(
    a: ActorData,
    amount: number,
    part: "head" | "chest" | "leg" | "arm" = "chest",
  ): number {
    if (a.health <= 0) return 0;
    const armor = a.kind === "armored" && part === "chest" ? 0.55 : 0;
    const damage =
      amount * (part === "head" ? 2.5 : part === "leg" ? 0.7 : 1) * (1 - armor);
    a.health = Math.max(0, a.health - damage);
    a.state = a.kind === "deer" ? "flee" : "chase";
    a.target = { ...this.ctx.state.player.position };
    a.lastSeen = 0;
    this.ctx.bus.emit({
      type: "hit",
      text: part === "head" ? "精准命中" : "命中",
      position: {
        ...a.position,
        y: a.position.y + (part === "head" ? 1.7 : 1),
      },
      value: damage,
    });
    if (a.health <= 0) {
      a.state = "dead";
      if (!ENEMIES[a.kind].animal) this.ctx.state.player.kills++;
      this.ctx.bus.emit({
        type: "sound",
        text: "death",
        kind: "death",
        position: a.position,
      });
      if (a.kind === "bloated")
        this.ctx.state.events.push({
          id: this.ctx.nextId("gas"),
          kind: "gas",
          name: "腐蚀残留",
          position: { ...a.position },
          start: this.ctx.state.elapsed,
          expires: this.ctx.state.elapsed + 35,
          resolved: false,
        });
    }
    return damage;
  }
}
