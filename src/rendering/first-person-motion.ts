import { DEFAULT_VERTICAL_FOV, zoomFov } from "../core/camera-settings";
import { MotionSpring, damp, smoothstep } from "../core/motion";
import {
  clamp,
  type Feedback,
  type GameSettings,
  type Vec3,
} from "../core/types";
import { ITEMS } from "../data/items";
import { GAITS } from "../simulation/locomotion";
import type { Simulation } from "../simulation/simulation";

export type CameraMotionState =
  | "idle"
  | "walk"
  | "run"
  | "sprint"
  | "crouch"
  | "prone"
  | "jump"
  | "fall"
  | "land"
  | "ads"
  | "lean"
  | "injured"
  | "lowStamina"
  | "vault"
  | "swim";
export interface FirstPersonPose {
  state: CameraMotionState;
  height: number;
  offset: Vec3;
  roll: number;
  fov: number;
  ads: number;
  sprint: number;
  crouch: number;
  prone: number;
  gait: number;
  landing: number;
  weaponPosition: Vec3;
  weaponRotation: Vec3;
  reload: number;
  interaction: number;
  interactionPhase: number;
  interactionKind: string;
  nearWall: number;
}
const states: CameraMotionState[] = [
  "idle",
  "walk",
  "run",
  "sprint",
  "crouch",
  "prone",
  "jump",
  "fall",
  "land",
  "ads",
  "lean",
  "injured",
  "lowStamina",
  "vault",
  "swim",
];
const ramp = (t: number, start: number, end: number) =>
  smoothstep((t - start) / (end - start));

/** Gameplay view is never filtered here: this controller only produces additive presentation. */
export class FirstPersonMotionController {
  readonly weights = Object.fromEntries(
    states.map((s) => [s, s === "idle" ? 1 : 0]),
  ) as Record<CameraMotionState, number>;
  readonly pose: FirstPersonPose = {
    state: "idle",
    height: 1.68,
    offset: { x: 0, y: 0, z: 0 },
    roll: 0,
    fov: DEFAULT_VERTICAL_FOV,
    ads: 0,
    sprint: 0,
    crouch: 0,
    prone: 0,
    gait: 0,
    landing: 0,
    weaponPosition: { x: 0.23, y: -0.26, z: 0.48 },
    weaponRotation: { x: 0, y: 0, z: 0 },
    reload: 0,
    interaction: 0,
    interactionPhase: 0,
    interactionKind: "",
    nearWall: 0,
  };
  private height = new MotionSpring(1.68);
  private lean = new MotionSpring();
  private landing = new MotionSpring();
  private recoil = new MotionSpring();
  private kickRoll = new MotionSpring();
  private swayX = new MotionSpring();
  private swayY = new MotionSpring();
  private turnX = 0;
  private turnY = 0;
  private equip = new MotionSpring();
  private equippedId = "";
  private clock = 0;
  private interactionTime = 0;
  private interactionTotal = 1;
  private initialized = false;
  private injury = new MotionSpring();
  mouse(dx: number, dy: number) {
    this.turnX = clamp(this.turnX + dx * 0.0006, -0.045, 0.045);
    this.turnY = clamp(this.turnY + dy * 0.0005, -0.035, 0.035);
  }
  feedback(event: Feedback) {
    if (
      event.type === "hit" &&
      event.weapon &&
      !ITEMS[event.weapon]?.weapon?.ammo
    ) {
      const hard = event.material !== "flesh";
      this.recoil.impulse(hard ? 0.42 : 0.24);
      this.kickRoll.impulse(hard ? -0.12 : -0.06);
    }
    if (
      event.type === "shot" &&
      event.kind !== "enemy" &&
      event.kind !== "explosion"
    ) {
      const force =
        event.kind === "melee"
          ? 0.4
          : clamp((event.value ?? 0.055) * 15, 0.35, 2);
      this.recoil.impulse(force * 2.1);
      this.kickRoll.impulse(
        (Math.sin(this.clock * 17) > 0 ? 1 : -1) * force * 0.23,
      );
    }
    if (event.type === "damage")
      this.injury.impulse(clamp((event.value ?? 10) / 10, 0.2, 3) * 0.5);
    if (event.type === "motion") {
      if (event.text === "land")
        this.landing.impulse(-clamp((event.value ?? 5) * 0.1, 0.2, 1.7));
      else if (event.text === "jump") this.landing.impulse(0.22);
      else if (event.text !== "vault-land") {
        this.pose.interactionKind = event.text;
        this.interactionTime = this.interactionTotal = event.value ?? 0.6;
      }
    }
  }
  update(
    dt: number,
    sim: Simulation,
    settings: GameSettings,
    aiming: boolean,
    leanInput: number,
  ): FirstPersonPose {
    this.clock += dt;
    const p = sim.state.player,
      locomotion = sim.locomotion,
      result = this.pose;
    const equipped = sim.combat.equipped(),
      id = equipped?.id ?? "";
    if (id !== this.equippedId) {
      this.equippedId = id;
      if (this.initialized) this.equip.reset(1);
    }
    const desiredHeight = p.vehicle
      ? 1.05
      : p.stance === "prone"
        ? 0.48
        : p.stance === "crouch"
          ? 1.06
          : 1.68;
    if (!this.initialized) {
      this.height.reset(desiredHeight);
      this.initialized = true;
      result.fov = settings.fov;
    }
    result.height = this.height.step(
      desiredHeight,
      p.stance === "prone" ? 13 : 21,
      dt,
    );
    const recovering = sim.combat.reloadRemaining > 0;
    const heavy = ["shotgun", "rifle", "military"].includes(id);
    const desiredAds =
      aiming &&
      !recovering &&
      !p.vehicle &&
      !!ITEMS[id]?.weapon?.ammo &&
      locomotion.vaultProgress < 0
        ? 1
        : 0;
    result.ads = damp(result.ads, desiredAds, heavy ? 13 : 19, dt);
    result.sprint = damp(
      result.sprint,
      sim.sprinting && !aiming && !recovering ? 1 : 0,
      12,
      dt,
    );
    result.crouch = damp(result.crouch, p.stance === "crouch" ? 1 : 0, 14, dt);
    result.prone = damp(result.prone, p.stance === "prone" ? 1 : 0, 10, dt);
    result.gait = damp(
      result.gait,
      sim.grounded
        ? Math.min(1, sim.speed / Math.max(0.5, GAITS[locomotion.gait].speed))
        : 0,
      16,
      dt,
    );
    const cameraMotion = settings.reducedMotion ? 0 : settings.headBob;
    const weaponMotion = settings.reducedMotion ? 0.18 : 1;
    const bobScale =
      GAITS[locomotion.gait].camera *
      result.gait *
      cameraMotion *
      (1 - result.ads * 0.88);
    const phase = locomotion.phase;
    const breathing = Math.sin(this.clock * (p.stats.stamina < 22 ? 2.9 : 1.4));
    const land = this.landing.step(0, 19, dt);
    const injury = this.injury.step(0, 18, dt);
    result.landing = land;
    const desiredLean = p.stance === "prone" || p.vehicle ? 0 : leanInput;
    const lateral = {
      x: Math.cos(p.yaw) * desiredLean,
      y: 0,
      z: -Math.sin(p.yaw) * desiredLean,
    };
    const leanHit = desiredLean
      ? sim.collision.ray(
          { x: p.position.x, y: p.position.y + result.height, z: p.position.z },
          lateral,
          0.32,
        )
      : null;
    const leanTarget = leanHit
      ? desiredLean * clamp((leanHit.distance - 0.09) / 0.22, 0, 1)
      : desiredLean;
    const lean = this.lean.step(leanTarget, 22, dt);
    result.offset.x = lean * 0.21 + Math.sin(phase) * bobScale * 0.45;
    result.offset.y =
      -(1 - Math.cos(phase * 2)) * bobScale * 0.35 +
      cameraMotion * breathing * (p.stats.stamina < 22 ? 0.007 : 0.002) +
      (settings.reducedMotion
        ? 0
        : land * settings.cameraShake + injury * settings.cameraShake * 0.25);
    result.offset.z = 0;
    result.roll =
      -lean * 0.055 +
      (settings.reducedMotion ? 0 : Math.sin(phase) * bobScale * 0.1);
    const scope = equipped?.attachments.includes("scope");
    const adsFov = scope ? zoomFov(settings.fov, 4) : settings.fov * 0.72;
    result.fov =
      settings.fov +
      (adsFov - settings.fov) * result.ads +
      (settings.reducedMotion ? 0 : result.sprint * 4);

    const cp = Math.cos(p.pitch);
    const wall = sim.collision.ray(
      { x: p.position.x, y: p.position.y + result.height, z: p.position.z },
      {
        x: Math.sin(p.yaw) * cp,
        y: -Math.sin(p.pitch),
        z: Math.cos(p.yaw) * cp,
      },
      heavy ? 1.25 : 0.85,
    );
    result.nearWall = damp(
      result.nearWall,
      wall ? clamp(1 - wall.distance / (heavy ? 1.25 : 0.85), 0, 1) : 0,
      20,
      dt,
    );
    this.turnX = damp(this.turnX, 0, 12, dt);
    this.turnY = damp(this.turnY, 0, 12, dt);
    const swayX = this.swayX.step(this.turnX, 24, dt),
      swayY = this.swayY.step(this.turnY, 24, dt);
    const shot = this.recoil.step(0, heavy ? 22 : 27, dt),
      roll = this.kickRoll.step(0, 20, dt);
    const equip = this.equip.step(0, 19, dt);
    const reload = recovering
      ? 1 - sim.combat.reloadRemaining / sim.combat.reloadTotal
      : 0;
    const reloadEnvelope = recovering
      ? ramp(reload, 0, 0.18) * (1 - ramp(reload, 0.78, 1))
      : 0;
    result.reload = reload;
    this.interactionTime = Math.max(0, this.interactionTime - dt);
    const interaction =
      this.interactionTime > 0
        ? Math.sin((1 - this.interactionTime / this.interactionTotal) * Math.PI)
        : 0;
    result.interaction = interaction;
    result.interactionPhase =
      this.interactionTime > 0
        ? 1 - this.interactionTime / this.interactionTotal
        : 0;
    const weaponBob =
      GAITS[locomotion.gait].weapon *
      result.gait *
      settings.headBob *
      weaponMotion *
      (1 - result.ads * 0.94);
    const inertia = weaponMotion * (1 - result.ads * 0.8);
    const acceleration =
      locomotion.acceleration.x * Math.sin(p.yaw) +
      locomotion.acceleration.z * Math.cos(p.yaw);
    const ads = result.ads * (1 - result.nearWall * 0.6);
    result.weaponPosition.x =
      0.23 * (1 - ads) +
      Math.sin(phase) * weaponBob -
      swayX * inertia +
      interaction * 0.06;
    result.weaponPosition.y =
      -0.26 +
      ads * 0.118 -
      Math.abs(Math.cos(phase)) * weaponBob * 0.65 +
      breathing * 0.003 * inertia +
      swayY * inertia -
      result.sprint * 0.14 -
      reloadEnvelope * 0.16 -
      equip * 0.34 +
      land * 1.4 -
      interaction * 0.17 -
      result.nearWall * 0.1;
    result.weaponPosition.z =
      0.48 -
      ads * 0.04 -
      shot * 0.46 -
      result.sprint * 0.05 -
      result.nearWall * 0.18 -
      clamp(acceleration * 0.0004, -0.015, 0.015) * inertia;
    result.weaponRotation.x =
      reloadEnvelope * 0.42 +
      result.sprint * 0.45 +
      equip * 0.55 -
      shot * 0.7 +
      result.nearWall * 0.72 -
      swayY * 0.9 * inertia -
      land * 0.8;
    result.weaponRotation.y =
      reloadEnvelope * 0.28 - swayX * 0.65 * inertia + result.nearWall * 0.14;
    result.weaponRotation.z =
      result.sprint * 0.18 +
      roll +
      Math.sin(phase) * weaponBob * 0.8 -
      locomotion.localVelocity.side * 0.009 * inertia -
      lean * 0.025 -
      reloadEnvelope * 0.26;
    let state: CameraMotionState =
      sim.speed < 0.05
        ? "idle"
        : locomotion.gait === "jog"
          ? "run"
          : locomotion.gait;
    if (!sim.grounded) state = sim.verticalVelocity > 0 ? "jump" : "fall";
    if (Math.abs(land) > 0.008 && sim.grounded) state = "land";
    if (result.ads > 0.5) state = "ads";
    if (Math.abs(lean) > 0.3) state = "lean";
    if (p.stats.health < 35 || p.stats.fracture) state = "injured";
    else if (p.stats.stamina < 20) state = "lowStamina";
    if (locomotion.vaultProgress >= 0) state = "vault";
    result.state = state;
    for (const key of states)
      this.weights[key] = damp(
        this.weights[key],
        key === state ? 1 : 0,
        13,
        dt,
      );
    return result;
  }
}
