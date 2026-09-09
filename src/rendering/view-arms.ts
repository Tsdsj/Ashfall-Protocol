import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AnimatedRig, CharacterAssetLibrary } from "./animated-assets";
import { rotateBoneToward, setBoneWorldRotation } from "./rig-animation";
import { smoothstep, solveTwoBone } from "../core/motion";
import { type Vec3 } from "../core/types";
import { alignSegment } from "./player-body";
import { ModelBatch } from "./geometry";
import type { MaterialFactory } from "./materials";
import type { FirstPersonPose } from "./first-person-motion";

const blend = (a: Vec3, b: Vec3, weight: number): Vec3 => {
  const t = smoothstep(weight);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
};
export function reloadHandTarget(
  progress: number,
  grip: Vec3,
  long: boolean,
  clearing = false,
): Vec3 {
  if (clearing) {
    const bolt = { x: -0.035, y: 0.18, z: long ? 0.28 : 0.2 };
    const pull = { ...bolt, z: bolt.z - 0.07 };
    if (progress < 0.3) return blend(grip, bolt, progress / 0.3);
    if (progress < 0.55) return blend(bolt, pull, (progress - 0.3) / 0.25);
    return blend(pull, grip, (progress - 0.55) / 0.45);
  }
  const mag = { x: -0.02, y: -0.17, z: long ? 0.37 : 0.13 };
  const out = { x: -0.14, y: -0.48, z: mag.z };
  const pouch = { x: -0.32, y: -0.64, z: 0.08 };
  const bolt = { x: -0.035, y: 0.18, z: long ? 0.28 : 0.2 };
  if (progress < 0.14) return blend(grip, mag, progress / 0.14);
  if (progress < 0.35) return blend(mag, out, (progress - 0.14) / 0.21);
  if (progress < 0.46) return blend(out, pouch, (progress - 0.35) / 0.11);
  if (progress < 0.72) return blend(pouch, mag, (progress - 0.46) / 0.26);
  if (progress < 0.83) return blend(mag, bolt, (progress - 0.72) / 0.11);
  return blend(bolt, grip, (progress - 0.83) / 0.17);
}

export class FirstPersonArms {
  readonly meshes: Mesh[] = [];
  private props: { root: TransformNode; kind: string }[] = [];
  private skin: AnimatedRig | null = null;
  private targets = new Map<number, Vec3>();
  private observer: ReturnType<Scene["onAfterAnimationsObservable"]["add"]> =
    null;
  private arms: {
    side: number;
    upper: Mesh;
    lower: Mesh;
    hand: TransformNode;
  }[] = [];
  constructor(
    scene: Scene,
    mats: MaterialFactory,
    private parent: TransformNode,
    private long: boolean,
    private item: string,
    assets?: CharacterAssetLibrary,
    private gripAnchors?: Record<string, number[]>,
  ) {
    const cloth = mats.surface("cloth", "#788574"),
      glove = mats.surface("leather", "#6e7768");
    for (const side of [-1, 1]) {
      const upper = MeshBuilder.CreateCylinder(
        "view-upper-arm",
        {
          height: 1,
          diameterTop: 0.15,
          diameterBottom: 0.12,
          tessellation: 14,
        },
        scene,
      );
      const lower = MeshBuilder.CreateCylinder(
        "view-forearm",
        {
          height: 1,
          diameterTop: 0.12,
          diameterBottom: 0.085,
          tessellation: 14,
        },
        scene,
      );
      upper.parent = lower.parent = parent;
      upper.material = lower.material = cloth;
      this.meshes.push(upper, lower);
      const hand = new TransformNode("view-hand-" + side, scene);
      hand.parent = parent;
      const batch = new ModelBatch(scene, "view-hand-" + side);
      batch.sphere("palm", [0.08, 0.115, 0.06], [0, 0, 0], glove, 12);
      batch.beveledBox(
        "knuckle-pad",
        [0.075, 0.045, 0.015],
        [side * 0.006, 0.025, -0.025],
        cloth,
      );
      for (let finger = 0; finger < 4; finger++) {
        const y = 0.043 - finger * 0.026;
        batch.cylinder(
          "finger-base",
          0.04,
          0.019,
          [-side * 0.035, y, 0.025],
          glove,
          [0, 0, side * 1.1],
          0.016,
          8,
        );
        batch.cylinder(
          "finger-curl",
          0.039,
          0.017,
          [-side * 0.054, y - 0.008, 0.045],
          glove,
          [1.3, 0, side * 0.3],
          0.014,
          8,
        );
      }
      batch.cylinder(
        "thumb",
        0.065,
        0.025,
        [side * 0.028, 0.055, 0.005],
        glove,
        [0.5, 0, side * -0.6],
        0.019,
        10,
      );
      batch.cylinder(
        "wrist-cuff",
        0.07,
        0.092,
        [0, -0.08, 0],
        cloth,
        [0, 0, 0],
        0.088,
        14,
      );
      this.meshes.push(...batch.finish(hand));
      if (side === -1) {
        for (const kind of ["drink", "eat", "heal", "reload-round"]) {
          const root = new TransformNode("held-consumable-" + kind, scene);
          root.parent = hand;
          const props = new ModelBatch(scene, "held-consumable-" + kind);
          if (kind === "reload-round") {
            const brass = mats.simple("held-brass-round", "#b4a16a");
            brass.metallic = 0.75;
            brass.roughness = 0.3;
            props.cylinder(
              "cartridge",
              item === "shotgun" ? 0.07 : 0.09,
              item === "shotgun" ? 0.024 : 0.014,
              [0, 0.05, 0.04],
              brass,
              [Math.PI / 2, 0, 0],
              undefined,
              10,
            );
          } else if (kind === "drink") {
            const plastic = mats.surface("plastic", "#a9b6a4");
            props.cylinder(
              "bottle",
              0.18,
              0.066,
              [0, 0.1, 0.04],
              plastic,
              [0, 0, 0],
              0.061,
              14,
            );
            props.cylinder(
              "bottle-shoulder",
              0.045,
              0.061,
              [0, 0.21, 0.04],
              plastic,
              [0, 0, 0],
              0.027,
              14,
            );
            props.cylinder(
              "cap",
              0.026,
              0.03,
              [0, 0.243, 0.04],
              mats.surface("plastic", "#43644f"),
              [0, 0, 0],
              0.03,
              12,
            );
          } else if (kind === "heal") {
            props.cylinder(
              "bandage-roll",
              0.06,
              0.065,
              [0, 0.045, 0.04],
              mats.surface("cloth", "#e1dfc9"),
              [Math.PI / 2, 0, 0],
              0.065,
              14,
            );
            props.box(
              "loose-gauze",
              [0.05, 0.005, 0.15],
              [0, 0.01, 0.11],
              mats.surface("cloth", "#e1dfc9"),
            );
          } else {
            props.cylinder(
              "ration-tin",
              0.075,
              0.085,
              [0, 0.055, 0.04],
              mats.surface("metal", "#9ba388"),
              [0, 0, 0],
              0.085,
              16,
            );
            props.cylinder(
              "tin-label",
              0.046,
              0.087,
              [0, 0.052, 0.04],
              mats.surface("cloth", "#9b8963"),
              [0, 0, 0],
              0.087,
              16,
            );
          }
          this.meshes.push(...props.finish(root));
          root.setEnabled(false);
          this.props.push({ root, kind });
        }
      }
      this.arms.push({ side, upper, lower, hand });
    }
    for (const m of this.meshes) {
      m.unfreezeWorldMatrix();
      m.renderingGroupId = 1;
      m.isPickable = false;
      m.receiveShadows = false;
    }
    if (assets) {
      this.skin = assets.instantiate(
        "view-arms-" + scene.getUniqueId(),
        "male",
        "arms",
        "player",
      );
      if (this.skin) {
        this.skin.root.parent = parent;
        this.skin.root.position.set(0, -1.72, 0.2);
        for (const mesh of this.meshes)
          if (!mesh.name.startsWith("held-consumable")) mesh.setEnabled(false);
        for (const mesh of this.skin.meshes) {
          mesh.renderingGroupId = 1;
          mesh.isPickable = false;
          mesh.receiveShadows = false;
        }
        this.meshes.push(...this.skin.meshes);
        this.observer = scene.onAfterAnimationsObservable.add(() =>
          this.solveSkin(),
        );
      }
    }
  }
  update(
    pose: FirstPersonPose,
    reloading: boolean,
    dt = 1 / 60,
    clearing = false,
    rounds = 3,
  ) {
    for (const prop of this.props)
      prop.root.setEnabled(
        prop.kind === "reload-round"
          ? reloading &&
              !clearing &&
              ["rifle", "shotgun"].includes(this.item) &&
              pose.reload > 0.14 &&
              pose.reload < 0.78
          : pose.interactionKind === prop.kind && pose.interaction > 0.02,
      );
    const firearm = [
      "pistol",
      "pistol45",
      "rifle",
      "military",
      "shotgun",
      "smg",
    ].includes(this.item);
    if (this.skin) {
      const consuming =
        ["eat", "drink", "heal"].includes(pose.interactionKind) &&
        pose.interaction > 0.01;
      const clip = consuming
        ? "Consume"
        : reloading && firearm
          ? "Pistol_Reload"
          : firearm
            ? "Pistol_Idle_Loop"
            : "Punch_Jab";
      this.skin.animator.sample(
        [
          {
            clip,
            phase: consuming
              ? pose.interactionPhase
              : reloading
                ? pose.reload
                : 0.03,
            weight: 1,
            loop: false,
          },
        ],
        dt,
        0,
        24,
      );
    }
    for (const arm of this.arms) {
      const right = arm.side === 1;
      const shoulder = right
        ? { x: 0.33, y: -0.34, z: -0.19 }
        : { x: -0.36, y: -0.3, z: this.long ? 0.05 : -0.19 };
      const toolGrip: Record<string, Vec3> = {
        knife: { x: 0.045, y: 0.06, z: 0.24 },
        machete: { x: 0.045, y: 0.06, z: 0.24 },
        hatchet: { x: 0.045, y: -0.06, z: 0.34 },
        crowbar: { x: 0.045, y: -0.08, z: 0.4 },
        spear: { x: 0.045, y: 0.04, z: 0.28 },
        hammer: { x: 0.045, y: -0.025, z: 0.29 },
        torch: { x: 0.045, y: -0.1, z: 0.395 },
        fishingrod: { x: 0.045, y: 0.075, z: 0.25 },
        shovel: { x: 0.045, y: 0.03, z: 0.3 },
        wrench: { x: 0.045, y: 0.11, z: 0.28 },
        grenade: { x: 0.045, y: 0.03, z: 0.24 },
        bow: { x: 0.04, y: 0.07, z: 0.12 },
      };
      const anchor = this.gripAnchors?.[right ? "rightGrip" : "leftGrip"];
      const grip = anchor
        ? { x: anchor[0]!, y: anchor[1]!, z: anchor[2]! }
        : right
          ? (toolGrip[this.item] ?? { x: 0.07, y: -0.08, z: 0.145 })
          : this.long
            ? { x: -0.037, y: -0.008, z: 0.57 }
            : { x: -0.058, y: -0.09, z: 0.145 };
      let target = grip;
      if (!right && reloading && firearm) {
        if (!clearing && ["rifle", "shotgun"].includes(this.item)) {
          const a = this.gripAnchors?.magazine ?? [0, 0.04, 0.3],
            port = { x: -0.05, y: a[1]! + 0.02, z: a[2]! },
            pouch = { x: -0.28, y: -0.44, z: 0.06 };
          const r = pose.reload,
            cycle = (((r - 0.12) / 0.66) * Math.max(1, rounds)) % 1;
          target =
            r < 0.12
              ? blend(grip, port, r / 0.12)
              : r < 0.78
                ? blend(port, pouch, Math.sin(Math.max(0, cycle) * Math.PI))
                : reloadHandTarget(r, grip, this.long, true);
        } else
          target = reloadHandTarget(pose.reload, grip, this.long, clearing);
      } else if (!right && pose.interaction > 0) {
        const healing = ["heal", "medical"].includes(pose.interactionKind);
        const drinking = ["drink", "eat"].includes(pose.interactionKind);
        target = blend(
          grip,
          healing
            ? { x: 0.2, y: -0.19, z: 0.06 }
            : drinking
              ? { x: -0.09, y: 0.28, z: 0.1 }
              : { x: -0.16, y: 0.12, z: 0.61 },
          pose.interaction,
        );
      } else if (!right && !firearm) target = { x: -0.32, y: -0.34, z: 0.12 };
      if (pose.interactionKind === "vault" || pose.interactionKind === "climb")
        target = blend(
          grip,
          { x: arm.side * 0.25, y: 0.08, z: 0.68 },
          pose.interaction,
        );
      const ik = solveTwoBone(
        shoulder,
        target,
        { x: arm.side * 0.8, y: -0.65, z: -0.2 },
        0.34,
        this.long && !right ? 0.39 : 0.33,
      );
      this.targets.set(arm.side, ik.end);
      alignSegment(arm.upper, shoulder, ik.joint);
      alignSegment(arm.lower, ik.joint, ik.end);
      arm.hand.position.set(ik.end.x, ik.end.y, ik.end.z);
      arm.hand.rotation.set(
        this.long && !right ? -0.45 : 0.05,
        right ? -0.05 : 0.05,
        right ? 0.08 : -0.08,
      );
    }
  }
  private solveSkin() {
    const rig = this.skin;
    if (!rig?.animator.sampled) return;
    this.parent.computeWorldMatrix(true);
    for (const side of [-1, 1]) {
      const suffix = side === 1 ? "r" : "l",
        upper = rig.nodes.get("upperarm_" + suffix),
        lower = rig.nodes.get("lowerarm_" + suffix),
        hand = rig.nodes.get("hand_" + suffix),
        target = this.targets.get(side);
      if (!upper || !lower || !hand || !target) continue;
      upper.computeWorldMatrix(true);
      lower.computeWorldMatrix(true);
      hand.computeWorldMatrix(true);
      const shoulder = upper.getAbsolutePosition().clone(),
        elbow = lower.getAbsolutePosition().clone(),
        wrist = hand.getAbsolutePosition().clone();
      let orientation = hand.getWorldMatrix().clone();
      if (this.long && side === -1) {
        orientation = orientation
          .multiply(Matrix.Invert(this.parent.getWorldMatrix()))
          .multiply(Matrix.RotationZ(-Math.PI / 2))
          .multiply(this.parent.getWorldMatrix());
      }
      const point = Vector3.TransformCoordinates(
        new Vector3(target.x, target.y, target.z),
        this.parent.getWorldMatrix(),
      );
      point.subtractInPlace(
        Vector3.TransformNormal(new Vector3(0, 0.065, 0), orientation),
      );
      const pole = Vector3.TransformNormal(
        new Vector3(side * 0.8, -0.65, -0.2),
        this.parent.getWorldMatrix(),
      ).normalize();
      const solved = solveTwoBone(
        shoulder,
        point,
        pole,
        Vector3.Distance(shoulder, elbow),
        Vector3.Distance(elbow, wrist),
      );
      rig.animator.preserve(upper);
      rig.animator.preserve(lower);
      rig.animator.preserve(hand);
      rotateBoneToward(
        upper,
        lower,
        new Vector3(solved.joint.x, solved.joint.y, solved.joint.z),
      );
      rotateBoneToward(
        lower,
        hand,
        new Vector3(solved.end.x, solved.end.y, solved.end.z),
      );
      setBoneWorldRotation(hand, orientation);
    }
  }
  dispose() {
    if (this.observer)
      this.parent.getScene().onAfterAnimationsObservable.remove(this.observer);
    this.skin?.dispose();
    this.skin = null;
  }
}
