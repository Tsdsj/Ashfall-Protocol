import { clamp, type Vec3 } from "./types";

/** Exact critically damped response; changing frame rate does not change the envelope. */
export class MotionSpring {
  velocity = 0;
  constructor(public value = 0) {}
  step(target: number, frequency: number, dt: number): number {
    const omega = Math.max(0.01, frequency);
    const offset = this.value - target;
    const decay = Math.exp(-omega * Math.max(0, dt));
    const change = (this.velocity + omega * offset) * dt;
    this.value = target + (offset + change) * decay;
    this.velocity = (this.velocity - omega * change) * decay;
    return this.value;
  }
  impulse(velocity: number) {
    this.velocity += velocity;
  }
  reset(value = 0) {
    this.value = value;
    this.velocity = 0;
  }
}

export const damp = (
  current: number,
  target: number,
  rate: number,
  dt: number,
) => target + (current - target) * Math.exp(-rate * Math.max(0, dt));
export const smoothstep = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
export const angleDelta = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const dampAngle = (
  current: number,
  target: number,
  rate: number,
  dt: number,
) => current + angleDelta(current, target) * (1 - Math.exp(-rate * dt));

/** Analytic two-bone IK in any coordinate space, with an explicit bend direction. */
export function solveTwoBone(
  root: Vec3,
  target: Vec3,
  pole: Vec3,
  upper: number,
  lower: number,
): { joint: Vec3; end: Vec3 } {
  const dx = target.x - root.x,
    dy = target.y - root.y,
    dz = target.z - root.z;
  const rawDistance = Math.hypot(dx, dy, dz);
  const distance = clamp(
    rawDistance,
    Math.abs(upper - lower) + 0.0001,
    upper + lower - 0.0001,
  );
  const n =
    rawDistance > 0.00001
      ? { x: dx / rawDistance, y: dy / rawDistance, z: dz / rawDistance }
      : { x: 0, y: -1, z: 0 };
  const along =
    (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const dot = pole.x * n.x + pole.y * n.y + pole.z * n.z;
  let bx = pole.x - dot * n.x,
    by = pole.y - dot * n.y,
    bz = pole.z - dot * n.z;
  let length = Math.hypot(bx, by, bz);
  if (length < 0.0001) {
    bx = n.y;
    by = -n.x;
    bz = 0;
    length = Math.hypot(bx, by) || 1;
  }
  return {
    joint: {
      x: root.x + n.x * along + (bx / length) * height,
      y: root.y + n.y * along + (by / length) * height,
      z: root.z + n.z * along + (bz / length) * height,
    },
    end: {
      x: root.x + n.x * distance,
      y: root.y + n.y * distance,
      z: root.z + n.z * distance,
    },
  };
}
