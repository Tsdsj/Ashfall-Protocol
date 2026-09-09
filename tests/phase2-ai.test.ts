import { describe, it, expect } from "vitest";
import { Simulation } from "../src/simulation/simulation";
import { createWorld } from "../src/simulation/state";
import {
  spawnActor,
  canSpawnAt,
  insidePlayerView,
  spawnHidden,
} from "../src/simulation/population";
import { addItem } from "../src/simulation/inventory";
import { distance, type EnemyKind } from "../src/core/types";
import { FirstPersonMotionController } from "../src/rendering/first-person-motion";
import { DEFAULT_SETTINGS } from "../src/simulation/state";

function fixture(kind: EnemyKind = "walker", range = 1.4) {
  const sim = new Simulation(createWorld("ai-quality"));
  sim.state.actors = {};
  sim.state.player.position = { x: 0, y: 0, z: 0 };
  sim.state.player.yaw = 0;
  sim.state.player.pitch = 0;
  sim.state.time = 12;
  const actor = spawnActor(sim, "target", kind, { x: 0, y: 0, z: range });
  actor.yaw = Math.PI;
  actor.behavior = "standing";
  return { sim, actor };
}
function advance(sim: Simulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    sim.state.elapsed += 1 / 60;
    sim.doors.update(1 / 60);
    sim.ai.update(1 / 60);
    for (const n of sim.noises) n.life -= 1 / 60;
    sim.noises = sim.noises.filter((n) => n.life > 0);
  }
}
describe("攻击的预示、命中帧和恢复", () => {
  it("前摇期间不造成伤害，一次挥击只在命中帧扣血一次", () => {
    const { sim, actor } = fixture();
    advance(sim, 0.2);
    expect(actor.state).toBe("windup");
    expect(sim.state.player.stats.health).toBe(100);
    advance(sim, 0.25);
    expect(sim.state.player.stats.health).toBe(91);
    expect(actor.attack?.hit).toBe(true);
    advance(sim, 0.9);
    expect(sim.state.player.stats.health).toBe(91);
    expect(actor.state).toBe("recover");
  });
  it("玩家在前摇时后撤，可以躲开已经开始的攻击", () => {
    const { sim, actor } = fixture();
    advance(sim, 0.2);
    sim.state.player.position.z = -4;
    advance(sim, 0.3);
    expect(actor.attack?.hit).toBe(true);
    expect(sim.state.player.stats.health).toBe(100);
  });
  it("玩家近战同样有命中时刻，不能在按键瞬间造成伤害", () => {
    const { sim, actor } = fixture();
    sim.state.player.pitch = 0.35;
    expect(
      sim.combat.fire({ x: 0, y: 1.68, z: 0 }, { x: 0, y: -0.35, z: 0.94 }),
    ).toBe(true);
    expect(actor.health).toBe(70);
    sim.combat.update(0.1);
    expect(actor.health).toBe(70);
    sim.combat.update(0.07);
    expect(actor.health).toBeLessThan(70);
    const health = actor.health;
    sim.combat.update(0.25);
    expect(actor.health).toBe(health);
  });
  it("排除卡壳具有动作过程，中途取消仍然保留卡壳状态", () => {
    const { sim } = fixture();
    addItem(sim.state.player.inventory, "pistol");
    const gun = sim.state.player.inventory.items.find(
      (i) => i.id === "pistol",
    )!;
    sim.actions.use(gun.uid);
    gun.jammed = true;
    gun.ammo = 5;
    expect(sim.combat.reload()).toBe(true);
    sim.combat.update(0.5);
    expect(gun.jammed).toBe(true);
    sim.combat.cancelReload();
    expect(gun.jammed).toBe(true);
    sim.combat.reload();
    sim.combat.update(1.3);
    expect(gun.jammed).toBe(false);
    expect(gun.ammo).toBe(5);
  });
  it("敌人的开火不会驱动玩家自己的武器后坐力", () => {
    const { sim } = fixture(),
      motion = new FirstPersonMotionController();
    motion.update(0.1, sim, DEFAULT_SETTINGS, false, 0);
    const before = motion.pose.weaponPosition.z;
    motion.feedback({ type: "shot", text: "enemy", kind: "enemy", value: 1 });
    motion.update(0.016, sim, DEFAULT_SETTINGS, false, 0);
    expect(motion.pose.weaponPosition.z).toBe(before);
  });
});
describe("方向受击、肢体与倒地", () => {
  it("四个命中方向被独立记录", () => {
    for (const [direction, side] of [
      [{ x: 0, y: 0, z: -1 }, "front"],
      [{ x: 0, y: 0, z: 1 }, "back"],
      [{ x: 1, y: 0, z: 0 }, "left"],
      [{ x: -1, y: 0, z: 0 }, "right"],
    ] as const) {
      const { sim, actor } = fixture();
      actor.yaw = 0;
      sim.ai.hurt(actor, 2, "chest", {
        direction,
        source: "bullet",
        impact: 20,
      });
      expect(actor.reaction?.side).toBe(side);
    }
  });
  it("强冲击会打断攻击、击倒存活敌人，之后完整起身", () => {
    const { sim, actor } = fixture();
    advance(sim, 0.2);
    sim.ai.hurt(actor, 2, "chest", {
      source: "explosion",
      impact: 90,
      direction: { x: 0, y: 0, z: 1 },
    });
    expect(actor.state).toBe("knockdown");
    expect(actor.attack).toBeNull();
    expect(actor.health).toBeGreaterThan(0);
    advance(sim, 1.5);
    expect(actor.state).toBe("getup");
    advance(sim, 1.1);
    expect(["chase", "windup", "attack"]).toContain(actor.state);
  });
  it("腿部受损降低追击速度，手臂受损降低攻击伤害", () => {
    const healthy = fixture("armored", 10),
      injured = fixture("armored", 10);
    injured.sim.ai.hurt(injured.actor, 30, "leg", {
      impact: 10,
      source: "bullet",
    });
    advance(healthy.sim, 1);
    advance(injured.sim, 1);
    expect(injured.actor.legDamage).toBeGreaterThan(0);
    expect(injured.actor.speed).toBeLessThan(healthy.actor.speed);
    const arms = fixture("armored");
    arms.sim.ai.hurt(arms.actor, 20, "arm", { impact: 10, source: "bullet" });
    advance(arms.sim, 0.5);
    expect(arms.sim.state.player.stats.health).toBeGreaterThan(86);
    expect(arms.sim.state.player.stats.health).toBeLessThan(100);
  });
  it("不同方向与伤害类型选择不同死亡表现，重复命中不会重复计数", () => {
    const styles = new Set<number>();
    for (const direction of [
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
    ]) {
      const { sim, actor } = fixture();
      actor.yaw = 0;
      sim.ai.hurt(actor, 100, "chest", { source: "bullet", direction });
      styles.add(actor.deathStyle);
      sim.ai.hurt(actor, 100);
      expect(sim.state.player.kills).toBe(1);
    }
    expect(styles.size).toBe(4);
  });
});
describe("世界内的生成、移动与避险", () => {
  it("持续向敌人前进不会穿过其身体，后退仍能离开", () => {
    const { sim, actor } = fixture();
    sim.god = true;
    sim.state.player.position = { x: 0, y: 0, z: 0 };
    sim.state.player.yaw = 0;
    actor.position = { x: 0, y: 0, z: 2.5 };
    actor.yaw = Math.PI;
    actor.behavior = "standing";
    actor.awareness = 1;
    actor.cooldown = 8;
    for (let i = 0; i < 60; i++)
      sim.update(1 / 60, {
        forward: 1,
        side: 0,
        sprint: false,
        jump: false,
        brake: false,
      });
    expect(sim.state.player.position.z).toBeLessThan(actor.position.z);
    expect(
      Math.hypot(
        actor.position.x - sim.state.player.position.x,
        actor.position.z - sim.state.player.position.z,
      ),
    ).toBeGreaterThan(0.68);
    const before = sim.state.player.position.z;
    for (let i = 0; i < 30; i++)
      sim.update(1 / 60, {
        forward: -1,
        side: 0,
        sprint: false,
        jump: false,
        brake: false,
      });
    expect(sim.state.player.position.z).toBeLessThan(before - 0.4);
  });
  it("攻击冷却时保留身体间距，不继续挤进玩家摄像机", () => {
    const { sim, actor } = fixture();
    sim.state.player.position = { x: 0, y: 0, z: 0 };
    actor.position = { x: 0, y: 0, z: 1.4 };
    actor.target = { ...sim.state.player.position };
    actor.yaw = Math.PI;
    actor.behavior = "standing";
    actor.cooldown = 8;
    actor.awareness = 1;
    advance(sim, 2);
    expect(Math.hypot(actor.position.x, actor.position.z)).toBeGreaterThan(1.1);
  });
  it("公开视线内拒绝刷新，背后安全空位允许生成", () => {
    const { sim } = fixture();
    sim.state.actors = {};
    sim.state.player.position = { x: -14, y: 0, z: -28 };
    expect(insidePlayerView(sim, { x: -14, y: 0, z: 12 })).toBe(true);
    expect(insidePlayerView(sim, { x: -14, y: 0, z: -70 })).toBe(false);
    let checked = 0;
    for (const x of [-65, -45, -25, -5, 15, 35, 55])
      for (const z of [-5, 15, 35, 55, 75, 95]) {
        const point = sim.gen.position(x, z);
        if (
          insidePlayerView(sim, point) &&
          sim.collision.visible(
            { x: -14, y: 1.68, z: -28 },
            { ...point, y: point.y + 1.1 },
          ) &&
          !sim.collision.blocked(point.x, point.y, point.z)
        ) {
          expect(canSpawnAt(sim, point)).toBe(false);
          checked++;
        }
      }
    expect(checked).toBeGreaterThan(0);
    const safe = [-30, -20, -10, 0, 10]
      .map((x) => sim.gen.position(x, -80))
      .some((point) => canSpawnAt(sim, point));
    expect(safe).toBe(true);
    expect(canSpawnAt(sim, { x: -14, y: 0, z: -30 })).toBe(false);
  });
  it("持续存在的敌人不会因再次填充而重置位置或生命", () => {
    const { sim, actor } = fixture();
    sim.ai.hurt(actor, 10);
    const position = { ...actor.position };
    const again = spawnHidden(sim, actor.id, actor.kind, [
      { x: 500, y: 0, z: 500 },
    ]);
    expect(again).toBe(actor);
    expect(again?.position).toEqual(position);
    expect(again?.health).toBe(60);
  });
  it("群体追击会相互分离，不维持完全重叠", () => {
    const { sim } = fixture();
    sim.state.actors = {};
    for (let i = 0; i < 5; i++) {
      const a = spawnActor(sim, "crowd-" + i, "walker", { x: 0, y: 0, z: 5 });
      a.yaw = Math.PI;
      a.behavior = "standing";
    }
    advance(sim, 1.5);
    const actors = Object.values(sim.state.actors);
    let minimum = Infinity;
    for (let i = 0; i < actors.length; i++)
      for (let j = i + 1; j < actors.length; j++)
        minimum = Math.min(
          minimum,
          distance(actors[i]!.position, actors[j]!.position),
        );
    expect(minimum).toBeGreaterThan(0.4);
    expect(
      actors.every((a) => Object.values(a.position).every(Number.isFinite)),
    ).toBe(true);
  });
  it("被枪声惊动的野猪远离声源，狼会避开燃烧的篝火", () => {
    const boar = fixture("boar", 10);
    boar.sim.noise(boar.sim.state.player.position, 100, "gunshot");
    advance(boar.sim, 1);
    expect(boar.actor.position.z).toBeGreaterThan(10);
    const wolf = fixture("wolf", 4);
    wolf.sim.state.structures.push({
      id: "test-fire",
      kind: "campfire",
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      health: 100,
      fuel: 80,
      active: true,
      growth: 0,
      plantedAt: 0,
    });
    advance(wolf.sim, 1.5);
    expect(wolf.actor.position.z).toBeGreaterThan(4);
    expect(wolf.sim.state.player.stats.health).toBe(100);
  });
  it("房间内的感染者可以找到并逐步突破关闭的门", () => {
    const { sim, actor } = fixture();
    actor.position = { x: 14, y: 0, z: 16 };
    actor.home = { ...actor.position };
    actor.yaw = Math.PI;
    sim.state.player.position = { x: 14, y: 0, z: 5 };
    sim.noise(sim.state.player.position, 40, "gunshot");
    advance(sim, 32);
    expect(sim.doors.get("pine-0")!.status).toBe("broken");
    expect(actor.position.z).toBeLessThan(9);
  });
});
