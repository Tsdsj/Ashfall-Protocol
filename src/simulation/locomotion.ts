import { clamp } from "../core/types";

export type Gait =
  "idle" | "walk" | "jog" | "sprint" | "crouch" | "prone" | "swim";
export interface GaitProfile {
  speed: number;
  acceleration: number;
  braking: number;
  stride: number;
  camera: number;
  weapon: number;
  stamina: number;
}
export const GAITS: Record<Gait, GaitProfile> = {
  idle: {
    speed: 0,
    acceleration: 24,
    braking: 27,
    stride: 1.6,
    camera: 0,
    weapon: 0,
    stamina: 0,
  },
  walk: {
    speed: 2.1,
    acceleration: 17,
    braking: 25,
    stride: 1.32,
    camera: 0.01,
    weapon: 0.022,
    stamina: 0,
  },
  jog: {
    speed: 3.7,
    acceleration: 23,
    braking: 28,
    stride: 1.75,
    camera: 0.014,
    weapon: 0.035,
    stamina: 0.5,
  },
  sprint: {
    speed: 6.3,
    acceleration: 18,
    braking: 27,
    stride: 2.15,
    camera: 0.018,
    weapon: 0.055,
    stamina: 9,
  },
  crouch: {
    speed: 1.65,
    acceleration: 13,
    braking: 22,
    stride: 1.16,
    camera: 0.007,
    weapon: 0.024,
    stamina: 0.3,
  },
  prone: {
    speed: 0.9,
    acceleration: 7,
    braking: 15,
    stride: 0.8,
    camera: 0.005,
    weapon: 0.028,
    stamina: 1.2,
  },
  swim: {
    speed: 2.3,
    acceleration: 5,
    braking: 4,
    stride: 1.9,
    camera: 0.012,
    weapon: 0.035,
    stamina: 3,
  },
};
export interface LocomotionRequest {
  forward: number;
  side: number;
  yaw: number;
  stance: "stand" | "crouch" | "prone";
  sprint: boolean;
  walk: boolean;
  aiming: boolean;
  swimming: boolean;
  weight: number;
  stamina: number;
  fracture: boolean;
  temperature: number;
  grounded: boolean;
}

export class LocomotionController {
  velocity = { x: 0, z: 0 };
  acceleration = { x: 0, z: 0 };
  localVelocity = { forward: 0, side: 0 };
  gait: Gait = "idle";
  speed = 0;
  targetSpeed = 0;
  phase = 0;
  stepIndex = 0;
  landingSpeed = 0;
  airborneTime = 0;
  vaultProgress = -1;
  reset() {
    this.velocity.x = this.velocity.z = this.speed = this.targetSpeed = 0;
    this.acceleration.x = this.acceleration.z = 0;
    this.localVelocity.forward = this.localVelocity.side = 0;
    this.landingSpeed = this.airborneTime = 0;
    this.vaultProgress = -1;
    this.gait = "idle";
  }
  step(dt: number, request: LocomotionRequest): { dx: number; dz: number } {
    const r = request,
      amount = Math.min(1, Math.hypot(r.forward, r.side));
    const sprint =
      r.sprint &&
      r.forward > 0 &&
      !r.aiming &&
      r.stance === "stand" &&
      r.stamina > 3 &&
      r.weight < 38 &&
      !r.fracture;
    this.gait = r.swimming
      ? "swim"
      : r.stance !== "stand"
        ? r.stance
        : sprint
          ? "sprint"
          : r.walk
            ? "walk"
            : "jog";
    const profile = GAITS[this.gait];
    const directionPenalty =
      r.forward < 0 ? 0.72 : Math.abs(r.side) > Math.abs(r.forward) ? 0.86 : 1;
    const aimPenalty = r.aiming ? 0.53 : 1;
    this.targetSpeed =
      profile.speed *
      amount *
      directionPenalty *
      aimPenalty *
      Math.max(0.4, 1 - Math.max(0, r.weight - 22) / 65) *
      (r.fracture ? 0.5 : 1) *
      (r.temperature < 34 ? 0.65 : 1);
    const length = Math.hypot(r.forward, r.side) || 1;
    const x =
      ((Math.sin(r.yaw) * r.forward + Math.cos(r.yaw) * r.side) / length) *
      this.targetSpeed;
    const z =
      ((Math.cos(r.yaw) * r.forward - Math.sin(r.yaw) * r.side) / length) *
      this.targetSpeed;
    const dx = x - this.velocity.x,
      dz = z - this.velocity.z,
      delta = Math.hypot(dx, dz);
    const reversing = this.velocity.x * x + this.velocity.z * z < 0;
    const stopping = amount === 0 || reversing || this.targetSpeed < this.speed;
    const curve = stopping
      ? 1
      : 0.8 +
        0.2 * (1 - clamp(this.speed / Math.max(0.1, profile.speed), 0, 1)) ** 2;
    const control = r.grounded || r.swimming ? 1 : 0.22;
    const maxDelta =
      (stopping ? profile.braking : profile.acceleration) *
      curve *
      control *
      dt;
    const factor = delta > 0 ? Math.min(1, maxDelta / delta) : 0;
    this.acceleration.x = dt > 0 ? (dx * factor) / dt : 0;
    this.acceleration.z = dt > 0 ? (dz * factor) / dt : 0;
    this.velocity.x += dx * factor;
    this.velocity.z += dz * factor;
    if (amount === 0 && Math.hypot(this.velocity.x, this.velocity.z) < 0.005)
      this.velocity.x = this.velocity.z = 0;
    this.localVelocity.forward =
      this.velocity.x * Math.sin(r.yaw) + this.velocity.z * Math.cos(r.yaw);
    this.localVelocity.side =
      this.velocity.x * Math.cos(r.yaw) - this.velocity.z * Math.sin(r.yaw);
    return { dx: this.velocity.x * dt, dz: this.velocity.z * dt };
  }
  travelled(dx: number, dz: number, dt: number, grounded: boolean): boolean {
    const distance = Math.hypot(dx, dz);
    this.speed = dt > 0 ? distance / dt : 0;
    if (!grounded) {
      this.airborneTime += dt;
      return false;
    }
    this.airborneTime = 0;
    this.phase += (distance / GAITS[this.gait].stride) * Math.PI;
    const index = Math.floor(this.phase / Math.PI);
    const stepped = index !== this.stepIndex;
    this.stepIndex = index;
    if (this.speed < 0.005) this.gait = "idle";
    return stepped;
  }
}
