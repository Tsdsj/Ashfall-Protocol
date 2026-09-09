import { describe, expect, it } from "vitest";
import { MotionSpring, solveTwoBone } from "../src/core/motion";
import {
  LocomotionController,
  type LocomotionRequest,
} from "../src/simulation/locomotion";
import { Simulation } from "../src/simulation/simulation";
import { createWorld, DEFAULT_SETTINGS } from "../src/simulation/state";
import { FirstPersonMotionController } from "../src/rendering/first-person-motion";
import { addItem, newInventory } from "../src/simulation/inventory";

const request = (
  overrides: Partial<LocomotionRequest> = {},
): LocomotionRequest => ({
  forward: 1,
  side: 0,
  yaw: 0,
  stance: "stand",
  sprint: false,
  walk: false,
  aiming: false,
  swimming: false,
  weight: 15,
  stamina: 100,
  fracture: false,
  temperature: 37,
  grounded: true,
  ...overrides,
});
function simulateMotion(
  hz: number,
  seconds: number,
  r: LocomotionRequest,
  motion = new LocomotionController(),
) {
  let distance = 0;
  for (let i = 0; i < hz * seconds; i++) {
    const step = motion.step(1 / hz, r);
    distance += Math.hypot(step.dx, step.dz);
    motion.travelled(step.dx, step.dz, 1 / hz, r.grounded);
  }
  return { motion, distance };
}

describe("第二阶段：输入、速度与步态", () => {
  it("第一帧已经响应，但不会直接到达最高速度；松手有短促制动", () => {
    const { motion } = simulateMotion(60, 1 / 60, request());
    expect(motion.speed).toBeGreaterThan(0.1);
    expect(motion.speed).toBeLessThan(1);
    simulateMotion(60, 0.4, request(), motion);
    expect(motion.speed).toBeCloseTo(3.7);
    const stop = simulateMotion(60, 1 / 60, request({ forward: 0 }), motion);
    expect(stop.motion.speed).toBeGreaterThan(0);
    expect(stop.motion.speed).toBeLessThan(3.7);
    simulateMotion(60, 0.2, request({ forward: 0 }), motion);
    expect(motion.speed).toBe(0);
  });
  it("30 / 60 / 144 Hz 的移动距离在一个低帧率步长内一致", () => {
    const distances = [30, 60, 144].map(
      (hz) => simulateMotion(hz, 2, request()).distance,
    );
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(
      3.7 / 30,
    );
  });
  it("斜向没有速度增益；后退、横移、慢行、瞄准和匍匐有明确差别", () => {
    const speed = (r: Partial<LocomotionRequest>) =>
      simulateMotion(60, 1, request(r)).motion.speed;
    expect(speed({ side: 1 })).toBeCloseTo(speed({}));
    expect(speed({ forward: -1 })).toBeLessThan(speed({ forward: 0, side: 1 }));
    expect(speed({ walk: true })).toBeLessThan(speed({}));
    expect(speed({ aiming: true })).toBeLessThan(speed({ walk: true }));
    expect(speed({ stance: "prone" })).toBeLessThan(
      speed({ stance: "crouch" }),
    );
  });
  it("瞄准、骨折、重载与后退不会进入冲刺", () => {
    for (const overrides of [
      { aiming: true },
      { fracture: true },
      { weight: 42 },
      { forward: -1 },
    ]) {
      const { motion } = simulateMotion(
        60,
        1,
        request({ sprint: true, ...overrides }),
      );
      expect(motion.gait).not.toBe("sprint");
    }
  });
  it("脚步相位只由实际接地位移推进，撞墙和腾空不制造原地脚步", () => {
    const motion = new LocomotionController();
    motion.step(1 / 60, request());
    expect(motion.travelled(0, 0, 1 / 60, true)).toBe(false);
    expect(motion.phase).toBe(0);
    motion.travelled(0, 1, 1 / 60, false);
    expect(motion.phase).toBe(0);
    motion.travelled(0, 1, 1 / 60, true);
    expect(motion.phase).toBeGreaterThan(0);
  });
  it("翻越低矮障碍需要连续位移，不在触发帧传送到障碍顶", () => {
    const sim = new Simulation(createWorld("vault-regression"));
    sim.god = true;
    sim.state.player.position = { x: 0, y: 0, z: -1.4 };
    sim.state.player.yaw = 0;
    sim.state.structures.push({
      id: "vault-box",
      kind: "storage",
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      health: 100,
      active: false,
      fuel: 0,
      growth: 0,
      plantedAt: 0,
      inventory: newInventory(),
    });
    const input = {
      forward: 1,
      side: 0,
      sprint: false,
      jump: false,
      brake: false,
    };
    for (let i = 0; i < 30; i++) sim.update(1 / 60, input);
    const before = { ...sim.state.player.position };
    sim.update(1 / 60, { ...input, jump: true });
    expect(
      sim.locomotion.vaultProgress,
      JSON.stringify({
        before,
        after: sim.state.player.position,
        grounded: sim.grounded,
        velocity: sim.locomotion.velocity,
      }),
    ).toBe(0);
    expect(sim.state.player.position).toEqual(before);
    for (let i = 0; i < 15; i++) sim.update(1 / 60, { ...input, jump: true });
    expect(sim.state.player.position.y).toBeGreaterThan(0);
    expect(sim.state.player.position.y).toBeLessThan(1.05);
    for (let i = 0; i < 30; i++) sim.update(1 / 60, { ...input, forward: 0 });
    expect(sim.state.player.position.y).toBeCloseTo(1, 1);
  });
});

describe("第二阶段：镜头与动作混合", () => {
  it("临界阻尼弹簧在不同帧率下响应一致，目标切换不会产生位置跳跃", () => {
    const results = [30, 60, 144].map((hz) => {
      const spring = new MotionSpring();
      for (let i = 0; i < hz; i++) spring.step(1, 16, 1 / hz);
      return spring.value;
    });
    expect(results[0]).toBeCloseTo(results[1]!, 10);
    expect(results[1]).toBeCloseTo(results[2]!, 10);
    const spring = new MotionSpring(1);
    const next = spring.step(0, 16, 1 / 60);
    expect(next).toBeGreaterThan(0.9);
    expect(next).toBeLessThan(1);
  });
  it("改变姿态时眼高平滑过渡，最终高度与碰撞姿态一致", () => {
    const sim = new Simulation(createWorld("posture")),
      motion = new FirstPersonMotionController();
    motion.update(1 / 60, sim, DEFAULT_SETTINGS, false, 0);
    sim.state.player.stance = "crouch";
    const first = motion.update(1 / 60, sim, DEFAULT_SETTINGS, false, 0).height;
    expect(first).toBeGreaterThan(1.5);
    expect(first).toBeLessThan(1.68);
    for (let i = 0; i < 45; i++)
      motion.update(1 / 60, sim, DEFAULT_SETTINGS, false, 0);
    expect(motion.pose.height).toBeCloseTo(1.06, 3);
  });
  it("鼠标惯性仅改变武器，不写回玩家视线", () => {
    const sim = new Simulation(createWorld("view")),
      motion = new FirstPersonMotionController();
    sim.state.player.yaw = 1.2;
    sim.state.player.pitch = 0.3;
    motion.mouse(100, 30);
    motion.update(1 / 60, sim, DEFAULT_SETTINGS, false, 0);
    expect(sim.state.player.yaw).toBe(1.2);
    expect(sim.state.player.pitch).toBe(0.3);
    expect(motion.pose.weaponPosition.x).not.toBe(0.23);
  });
  it("ADS 位置与 FOV 共享平滑权重，手枪举枪比长枪快", () => {
    const ads = (id: string) => {
      const sim = new Simulation(createWorld(id)),
        motion = new FirstPersonMotionController();
      addItem(sim.state.player.inventory, id);
      sim.actions.use(
        sim.state.player.inventory.items.find((i) => i.id === id)!.uid,
      );
      const pose = motion.update(1 / 60, sim, DEFAULT_SETTINGS, true, 0);
      expect(pose.ads).toBeGreaterThan(0);
      expect(pose.ads).toBeLessThan(1);
      expect(pose.fov).toBeLessThan(DEFAULT_SETTINGS.fov);
      expect(pose.fov).toBeGreaterThan(DEFAULT_SETTINGS.fov * 0.72);
      return pose.ads;
    };
    expect(ads("pistol")).toBeGreaterThan(ads("rifle"));
  });
  it("关闭晃动时不再存在步态相机位移，状态混合权重保持归一", () => {
    const sim = new Simulation(createWorld("comfort")),
      motion = new FirstPersonMotionController();
    sim.speed = 3.7;
    sim.locomotion.gait = "jog";
    const settings = { ...DEFAULT_SETTINGS, headBob: 0, reducedMotion: true };
    for (let i = 0; i < 60; i++) {
      sim.locomotion.phase += 0.1;
      const pose = motion.update(1 / 60, sim, settings, false, 0);
      expect(pose.offset).toEqual({ x: 0, y: 0, z: 0 });
      expect(pose.roll).toBe(0);
      expect(
        Object.values(motion.weights).reduce((a, b) => a + b, 0),
      ).toBeCloseTo(1, 8);
    }
  });
});

describe("第二阶段：身体 IK", () => {
  it("可达目标保持骨长和脚部接触点，不可达目标不拉长肢体", () => {
    const root = { x: 0.13, y: 0.7, z: 0 };
    const target = { x: 0.13, y: 0.08, z: 0.15 };
    const result = solveTwoBone(root, target, { x: 0, y: 0, z: 1 }, 0.41, 0.4);
    const length = (a: typeof root, b: typeof root) =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(length(root, result.joint)).toBeCloseTo(0.41, 7);
    expect(length(result.joint, result.end)).toBeCloseTo(0.4, 7);
    expect(length(result.end, target)).toBeLessThan(1e-7);
    const far = solveTwoBone(
      root,
      { x: 100, y: 0, z: 100 },
      { x: 0, y: 0, z: 1 },
      0.41,
      0.4,
    );
    expect(length(root, far.end)).toBeLessThanOrEqual(0.81);
  });
  it("根与目标重合时仍输出有限姿态", () => {
    const zero = { x: 0, y: 0, z: 0 };
    const result = solveTwoBone(zero, zero, { x: 0, y: -1, z: 0 }, 0.4, 0.4);
    expect(
      [...Object.values(result.joint), ...Object.values(result.end)].every(
        Number.isFinite,
      ),
    ).toBe(true);
  });
});
