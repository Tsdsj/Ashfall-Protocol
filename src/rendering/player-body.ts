import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import { dampAngle, solveTwoBone } from "../core/motion";
import { clamp, type Vec3 } from "../core/types";
import { ModelBatch } from "./geometry";
import type { MaterialFactory } from "./materials";
import type { FirstPersonPose } from "./first-person-motion";
import type { Simulation } from "../simulation/simulation";
import type { AnimatedRig, CharacterAssetLibrary } from "./animated-assets";
import {
  rotateBoneToward,
  setBoneWorldRotation,
  type ClipSample,
} from "./rig-animation";

export function alignSegment(mesh: Mesh, from: Vec3, to: Vec3) {
  const direction = new Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
  const length = direction.length();
  mesh.position.set(
    (from.x + to.x) / 2,
    (from.y + to.y) / 2,
    (from.z + to.z) / 2,
  );
  mesh.scaling.y = length;
  mesh.rotationQuaternion ??= Quaternion.Identity();
  if (length > 0.00001)
    Quaternion.FromUnitVectorsToRef(
      Vector3.UpReadOnly,
      direction.scaleInPlace(1 / length),
      mesh.rotationQuaternion,
    );
}

export class PlayerBodyRenderer {
  readonly root: TransformNode;
  readonly meshes: Mesh[] = [];
  private torso: TransformNode;
  private hips: TransformNode;
  private legs: { upper: Mesh; lower: Mesh; boot: Mesh; side: number }[] = [];
  private arms: { upper: Mesh; lower: Mesh; glove: Mesh; side: number }[] = [];
  private initialized = false;
  private skin: AnimatedRig | null = null;
  private context: { sim: Simulation; pose: FirstPersonPose } | null = null;
  private observer: ReturnType<Scene["onAfterAnimationsObservable"]["add"]> =
    null;
  private landing = 0;
  constructor(
    scene: Scene,
    mats: MaterialFactory,
    private shadow: (mesh: Mesh) => void,
  ) {
    this.root = new TransformNode("first-person-body", scene);
    this.torso = new TransformNode("player-body-chest", scene);
    this.torso.parent = this.root;
    this.hips = new TransformNode("player-body-pelvis", scene);
    this.hips.parent = this.root;
    const jacket = mats.surface("cloth", "#81907c"),
      pants = mats.surface("cloth", "#666f61"),
      leather = mats.surface("leather", "#717068");
    const chest = new ModelBatch(scene, "player-body-chest");
    chest.sphere("jacket", [0.44, 0.54, 0.22], [0, 0, 0], jacket, 16);
    chest.sphere("shoulders", [0.5, 0.18, 0.22], [0, 0.2, 0], jacket, 12);
    chest.box("zipper", [0.012, 0.48, 0.017], [0, 0.015, 0.146], leather);
    for (const side of [-1, 1]) {
      chest.beveledBox(
        "chest-pocket",
        [0.145, 0.16, 0.028],
        [side * 0.14, 0.04, 0.132],
        jacket,
      );
      chest.box(
        "pack-strap",
        [0.047, 0.46, 0.024],
        [side * 0.19, 0.01, 0.12],
        leather,
        [0, 0, side * -0.12],
      );
      chest.box(
        "strap-buckle",
        [0.062, 0.046, 0.035],
        [side * 0.178, -0.065, 0.137],
        mats.surface("plastic"),
      );
    }
    this.meshes.push(...chest.finish(this.torso));
    const pelvis = new ModelBatch(scene, "player-body-pelvis");
    pelvis.sphere("pants", [0.41, 0.26, 0.31], [0, 0, 0], pants, 14);
    pelvis.beveledBox("belt", [0.415, 0.048, 0.31], [0, 0.1, 0], leather);
    pelvis.box(
      "buckle",
      [0.075, 0.04, 0.028],
      [0, 0.1, 0.16],
      mats.surface("metal"),
    );
    this.meshes.push(...pelvis.finish(this.hips));
    const segment = (
      name: string,
      diameter: number,
      end: number,
      material: Material,
    ) => {
      const mesh = MeshBuilder.CreateCylinder(
        name,
        {
          height: 1,
          diameterTop: diameter,
          diameterBottom: end,
          tessellation: 14,
        },
        scene,
      );
      mesh.parent = this.root;
      mesh.material = material;
      this.meshes.push(mesh);
      return mesh;
    };
    for (const side of [-1, 1]) {
      const upper = segment("player-body-thigh", 0.205, 0.165, pants),
        lower = segment("player-body-shin", 0.16, 0.12, pants);
      const boot = MeshBuilder.CreateBox(
        "player-body-boot",
        { width: 0.165, height: 0.14, depth: 0.31 },
        scene,
      );
      boot.parent = this.root;
      boot.material = leather;
      this.meshes.push(boot);
      this.legs.push({ upper, lower, boot, side });
      const arm = segment("player-body-upper-arm", 0.165, 0.13, jacket),
        forearm = segment("player-body-forearm", 0.14, 0.09, jacket);
      const glove = MeshBuilder.CreateSphere(
        "player-body-glove",
        { diameter: 1, segments: 10 },
        scene,
      );
      glove.scaling.set(0.1, 0.17, 0.1);
      glove.parent = this.root;
      glove.material = leather;
      this.meshes.push(glove);
      this.arms.push({ upper: arm, lower: forearm, glove, side });
    }
    for (const m of this.meshes) {
      m.unfreezeWorldMatrix();
      m.isPickable = false;
      m.receiveShadows = true;
      shadow(m);
    }
  }
  initialize(assets: CharacterAssetLibrary) {
    this.skin = assets.instantiate("player-presence", "male", "body", "player");
    if (!this.skin) return;
    this.skin.root.parent = this.root;
    for (const mesh of this.meshes) mesh.setEnabled(false);
    for (const mesh of this.skin.meshes) {
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      this.shadow(mesh);
    }
    this.meshes.push(...this.skin.meshes);
    this.observer = this.root
      .getScene()
      .onAfterAnimationsObservable.add(() => this.poseSkin());
  }
  update(dt: number, sim: Simulation, pose: FirstPersonPose, visible: boolean) {
    const p = sim.state.player;
    this.root.setEnabled(visible && !p.vehicle);
    if (!visible || p.vehicle) return;
    if (!this.initialized) {
      this.root.rotation.y = p.yaw;
      this.initialized = true;
    }
    this.root.rotation.y = dampAngle(
      this.root.rotation.y,
      p.yaw,
      sim.moving ? 20 : 11,
      dt,
    );
    const yaw = this.root.rotation.y;
    this.root.position.set(
      p.position.x - Math.sin(yaw) * 0.24,
      p.position.y,
      p.position.z - Math.cos(yaw) * 0.24,
    );
    if (this.skin) {
      this.context = { sim, pose };
      if (sim.locomotion.landingSpeed > 0) this.landing = 0.35;
      else this.landing = Math.max(0, this.landing - dt);
      const phase = sim.locomotion.phase / (Math.PI * 2);
      let samples: ClipSample[];
      if (sim.locomotion.vaultProgress >= 0)
        samples = [
          {
            clip: "ClimbUp_1m",
            phase: sim.locomotion.vaultProgress,
            weight: 1,
            loop: false,
          },
        ];
      else if (!sim.grounded)
        samples = [
          {
            clip: sim.verticalVelocity > 0 ? "Jump_Start" : "Jump_Loop",
            phase: Math.min(0.99, sim.locomotion.airborneTime / 0.4),
            weight: 1,
            loop: false,
          },
        ];
      else if (this.landing > 0)
        samples = [
          {
            clip: "Jump_Land",
            phase: 1 - this.landing / 0.35,
            weight: 1,
            loop: false,
          },
        ];
      else if (p.stance === "crouch")
        samples = [
          { clip: "Crouch_Fwd_Loop", phase, weight: pose.gait },
          {
            clip: "Crouch_Idle_Loop",
            phase: sim.state.elapsed / 3,
            weight: 1 - pose.gait,
          },
        ];
      else
        samples = [
          {
            clip:
              sim.locomotion.gait === "walk"
                ? "Walk_Loop"
                : sim.sprinting
                  ? "Sprint_Loop"
                  : "Jog_Fwd_Loop",
            phase,
            weight: p.stance === "prone" ? 0 : pose.gait,
          },
          {
            clip: "Idle_Loop",
            phase: sim.state.elapsed / 3,
            weight: p.stance === "prone" ? 1 : 1 - pose.gait,
          },
        ];
      this.skin.animator.sample(samples, dt, 0, 18);
      return;
    }
    const crouch = pose.crouch,
      prone = pose.prone;
    const pelvisY = 0.86 - crouch * 0.31 - prone * 0.58;
    this.hips.position.set(0, pelvisY, -prone * 0.37 - crouch * 0.045);
    this.torso.position.set(
      0,
      1.15 - crouch * 0.33 - prone * 0.83,
      prone * 0.025 + crouch * 0.06,
    );
    this.torso.rotation.x =
      prone * 1.38 +
      crouch * 0.13 +
      pose.sprint * 0.1 +
      (p.stats.health < 35 ? 0.08 : 0);
    this.torso.rotation.z = pose.roll * 0.35;
    const stride = sim.locomotion.phase;
    for (const leg of this.legs) {
      const phase = stride + (leg.side === 1 ? Math.PI : 0);
      const swing =
        Math.sin(phase) *
        pose.gait *
        (0.22 + pose.sprint * 0.12) *
        (1 - prone * 0.5);
      const lift = Math.max(0, Math.cos(phase)) * pose.gait * 0.1;
      const hip = {
        x: leg.side * 0.13,
        y: pelvisY,
        z: -prone * 0.37 - crouch * 0.045,
      };
      const foot = {
        x: leg.side * (0.13 + crouch * 0.025),
        y: 0.08 + lift,
        z: 0.08 + swing - prone * 1.1,
      };
      if (!sim.grounded) {
        foot.y += 0.12;
        foot.z -= 0.08;
      } else if (prone < 0.5) {
        const x =
          this.root.position.x +
          Math.cos(yaw) * foot.x +
          Math.sin(yaw) * foot.z;
        const z =
          this.root.position.z -
          Math.sin(yaw) * foot.x +
          Math.cos(yaw) * foot.z;
        foot.y += clamp(
          sim.collision.ground(x, z, p.position.y) - p.position.y,
          -0.2,
          0.22,
        );
      }
      const ik = solveTwoBone(
        hip,
        foot,
        { x: leg.side * 0.1, y: 0.05, z: 1 },
        0.41,
        0.4,
      );
      alignSegment(leg.upper, hip, ik.joint);
      alignSegment(leg.lower, ik.joint, ik.end);
      leg.boot.position.set(ik.end.x, ik.end.y - 0.035, ik.end.z + 0.06);
      leg.boot.rotation.x = -Math.max(0, -Math.cos(phase)) * pose.gait * 0.2;
    }
    const equipped = !!sim.combat.equipped();
    for (const arm of this.arms) {
      arm.upper.setEnabled(!equipped);
      arm.lower.setEnabled(!equipped);
      arm.glove.setEnabled(!equipped);
      if (equipped) continue;
      const shoulder = {
        x: arm.side * 0.27,
        y: 1.42 - crouch * 0.4 - prone * 1.08,
        z: prone * 0.1,
      };
      const hand = {
        x: arm.side * 0.31,
        y: shoulder.y - 0.52,
        z:
          Math.sin(stride + (arm.side * Math.PI) / 2) * pose.gait * 0.13 + 0.07,
      };
      if (prone > 0.5) {
        hand.y = 0.1;
        hand.z = 0.45;
      }
      const ik = solveTwoBone(
        shoulder,
        hand,
        { x: arm.side, y: 0, z: -0.3 },
        0.3,
        0.28,
      );
      alignSegment(arm.upper, shoulder, ik.joint);
      alignSegment(arm.lower, ik.joint, ik.end);
      arm.glove.position.set(ik.end.x, ik.end.y, ik.end.z);
    }
  }
  private poseSkin() {
    const rig = this.skin,
      context = this.context;
    if (!rig?.animator.sampled || !context) return;
    const { sim, pose } = context,
      p = sim.state.player,
      animator = rig.animator;
    const pelvis = rig.nodes.get("pelvis"),
      spine = rig.nodes.get("spine_01");
    if (pose.prone > 0.005 && pelvis && spine) {
      animator.preserve(pelvis);
      pelvis.computeWorldMatrix(true);
      spine.computeWorldMatrix(true);
      const current = pelvis.getAbsolutePosition().clone(),
        target = Vector3.TransformCoordinates(
          new Vector3(0, 0.28, -0.45),
          this.root.getWorldMatrix(),
        );
      const position = Vector3.Lerp(current, target, pose.prone);
      const parent = pelvis.parent as TransformNode;
      pelvis.position = Vector3.TransformCoordinates(
        position,
        Matrix.Invert(parent.computeWorldMatrix(true)),
      );
      pelvis.computeWorldMatrix(true);
      spine.computeWorldMatrix(true);
      const origin = pelvis.getAbsolutePosition(),
        length = Vector3.Distance(origin, spine.getAbsolutePosition());
      const direction = spine
        .getAbsolutePosition()
        .subtract(origin)
        .normalize();
      const forward = new Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
      const wanted = Vector3.Lerp(direction, forward, pose.prone).normalize();
      rotateBoneToward(pelvis, spine, origin.add(wanted.scale(length)));
    }
    animator.offset(
      rig.nodes.get("spine_02"),
      p.stats.health < 35 ? 0.08 : 0,
      0,
      pose.roll * 0.25,
    );
    for (const side of [-1, 1]) {
      const suffix = side === 1 ? "r" : "l",
        thigh = rig.nodes.get("thigh_" + suffix),
        calf = rig.nodes.get("calf_" + suffix),
        foot = rig.nodes.get("foot_" + suffix);
      if (!thigh || !calf || !foot) continue;
      thigh.computeWorldMatrix(true);
      calf.computeWorldMatrix(true);
      foot.computeWorldMatrix(true);
      const hip = thigh.getAbsolutePosition().clone(),
        knee = calf.getAbsolutePosition().clone(),
        ankle = foot.getAbsolutePosition().clone();
      let target = ankle.clone();
      if (pose.prone > 0.005) {
        const crawl =
          Math.sin(sim.locomotion.phase + (side * Math.PI) / 2) *
          pose.gait *
          0.04;
        const prone = Vector3.TransformCoordinates(
          new Vector3(side * 0.14, 0.09, -1.2 + crawl),
          this.root.getWorldMatrix(),
        );
        target = Vector3.Lerp(ankle, prone, pose.prone);
      } else if (sim.grounded && ankle.y - p.position.y < 0.2) {
        const floor =
          sim.collision.ground(ankle.x, ankle.z, p.position.y) + 0.075;
        target.y += clamp(floor - ankle.y, -0.16, 0.18);
      } else continue;
      const pole =
        pose.prone > 0.5
          ? { x: 0, y: -1, z: 0 }
          : { x: Math.sin(p.yaw), y: 0.05, z: Math.cos(p.yaw) };
      const solved = solveTwoBone(
        hip,
        target,
        pole,
        Vector3.Distance(hip, knee),
        Vector3.Distance(knee, ankle),
      );
      const orientation = foot.getWorldMatrix().clone();
      animator.preserve(thigh);
      animator.preserve(calf);
      animator.preserve(foot);
      rotateBoneToward(
        thigh,
        calf,
        new Vector3(solved.joint.x, solved.joint.y, solved.joint.z),
      );
      rotateBoneToward(
        calf,
        foot,
        new Vector3(solved.end.x, solved.end.y, solved.end.z),
      );
      if (pose.prone < 0.5) setBoneWorldRotation(foot, orientation);
    }
  }
  dispose() {
    if (this.observer)
      this.root.getScene().onAfterAnimationsObservable.remove(this.observer);
    this.skin?.dispose();
    this.root.dispose(false);
  }
}
