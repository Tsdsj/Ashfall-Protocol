import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { type Mesh } from "@babylonjs/core/Meshes/mesh";
import { type Scene } from "@babylonjs/core/scene";
import { ENEMIES } from "../data/enemies";
import { distance, type ActorData } from "../core/types";
import { ModelBatch } from "./geometry";
import type { MaterialFactory } from "./materials";
import type { Simulation } from "../simulation/simulation";
export interface CharacterRig {
  root: TransformNode;
  limbs: TransformNode[];
  head: TransformNode;
  meshes: Mesh[];
}
export function characterRig(
  scene: Scene,
  mats: MaterialFactory,
  name: string,
  kind: string,
): CharacterRig {
  const root = new TransformNode(name, scene),
    limbs: TransformNode[] = [],
    meshes: Mesh[] = [];
  const isAnimal = ["deer", "boar", "wolf"].includes(kind),
    def = ENEMIES[kind as keyof typeof ENEMIES];
  const cloth = mats.surface("cloth", def?.color ?? "#b9bb9c");
  const skin = mats.surface(
    "skin",
    kind === "raider" || kind === "npc" ? "#e6c9ad" : "#b4b69b",
  );
  const boots = mats.surface("leather");
  const body = new ModelBatch(scene, name + ":body");
  const head = new TransformNode(name + ":head", scene);
  head.parent = root;
  if (isAnimal) {
    const deer = kind === "deer",
      wolf = kind === "wolf";
    body.sphere("body", [0.75, 0.85, 1.65], [0, 0.9, 0], cloth, 12);
    body.sphere("shoulder", [0.7, 0.9, 0.6], [0, 1.05, 0.48], cloth, 10);
    head.position.set(0, deer ? 1.4 : 1.1, 0.8);
    const hb = new ModelBatch(scene, name + ":head");
    hb.sphere("skull", [0.38, 0.5, 0.58], [0, 0.12, 0.08], cloth);
    hb.sphere("snout", [0.27, 0.25, 0.45], [0, -0.02, 0.39], cloth);
    for (const side of [-1, 1]) {
      hb.cylinder(
        "ear",
        0.24,
        0.14,
        [side * 0.19, 0.38, 0],
        cloth,
        [side * 0.3, 0, 0],
        0.01,
      );
      hb.sphere(
        "eye",
        [0.05, 0.055, 0.04],
        [side * 0.17, 0.19, 0.25],
        mats.simple("animal-eye", "#191d14"),
        6,
      );
      if (deer) {
        hb.pipe(
          "antler",
          [side * 0.12, 0.4, 0],
          [side * 0.35, 1.15, -0.18],
          0.055,
          mats.surface("wood"),
        );
        for (let n = 0; n < 3; n++)
          hb.pipe(
            "tine",
            [side * (0.18 + n * 0.06), 0.58 + n * 0.16, -0.04 - n * 0.06],
            [side * (0.37 + n * 0.04), 0.85 + n * 0.16, 0.03],
            0.03,
            mats.surface("wood"),
          );
      }
    }
    meshes.push(...hb.finish(head));
    body.cylinder(
      "tail",
      wolf ? 0.6 : 0.23,
      0.12,
      [0, 1, -0.9],
      cloth,
      [0.9, 0, 0],
      0.04,
    );
    for (const side of [-1, 1])
      for (const z of [-0.52, 0.54]) {
        const joint = new TransformNode(name + ":leg", scene);
        joint.parent = root;
        joint.position.set(side * 0.26, 0.85, z);
        const b = new ModelBatch(scene, name + ":leg");
        b.cylinder("upper", 0.43, 0.19, [0, -0.2, 0], cloth, [0, 0, 0], 0.14);
        b.cylinder(
          "shin",
          0.5,
          0.1,
          [0, -0.65, 0.04],
          cloth,
          [0.12, 0, 0],
          0.07,
        );
        b.sphere("hoof", [0.15, 0.12, 0.24], [0, -0.88, 0.08], boots, 6);
        meshes.push(...b.finish(joint));
        limbs.push(joint);
      }
  } else {
    body.beveledBox("torso", [0.45, 0.6, 0.27], [0, 1.2, 0], cloth);
    body.box("belt", [0.43, 0.075, 0.3], [0, 0.88, 0], boots);
    body.sphere("hips", [0.4, 0.23, 0.29], [0, 0.81, 0], cloth);
    body.cylinder("neck", 0.15, 0.12, [0, 1.56, 0], skin);
    head.position.set(0, 1.67, 0.025);
    head.rotation.x = kind === "npc" ? 0.02 : 0.15;
    const hb = new ModelBatch(scene, name + ":head");
    hb.sphere("head", [0.245, 0.32, 0.25], [0, 0, 0], skin, 12);
    hb.beveledBox("nose", [0.045, 0.065, 0.045], [0, -0.018, 0.125], skin);
    hb.box(
      "mouth",
      [0.063, 0.015, 0.012],
      [0, -0.075, 0.119],
      mats.simple("mouth", "#493f32"),
    );
    for (const side of [-1, 1]) {
      hb.sphere("ear", [0.042, 0.076, 0.06], [side * 0.13, -0.015, 0], skin, 6);
      hb.box(
        "eye",
        [0.041, 0.018, 0.022],
        [side * 0.061, 0.034, 0.119],
        mats.simple("eyes", "#282f25"),
      );
    }
    if (kind === "armored" || kind === "raider") {
      hb.sphere(
        "helmet",
        [0.28, 0.22, 0.3],
        [0, 0.105, -0.02],
        mats.surface("metal", "#778571"),
      );
      body.box(
        "plate",
        [0.48, 0.48, 0.1],
        [0, 1.25, 0.19],
        mats.surface("cloth", "#747d62"),
      );
      for (const side of [-1, 1])
        body.box("pouch", [0.14, 0.19, 0.13], [side * 0.13, 1.08, 0.27], boots);
    } else {
      hb.sphere(
        "hair",
        [0.25, 0.17, 0.24],
        [0, 0.12, -0.022],
        mats.simple("hair", "#47463b"),
        8,
      );
    }
    meshes.push(...hb.finish(head));
    for (const side of [-1, 1]) {
      const leg = new TransformNode(name + ":leg", scene);
      leg.parent = root;
      leg.position.set(side * 0.135, 0.83, 0);
      const b = new ModelBatch(scene, name + ":leg");
      b.cylinder("thigh", 0.42, 0.2, [0, -0.19, 0], cloth, [0, 0, 0], 0.16);
      b.cylinder("shin", 0.38, 0.15, [0, -0.59, 0.015], cloth, [0, 0, 0], 0.12);
      b.box("boot", [0.18, 0.15, 0.3], [0, -0.77, 0.06], boots);
      meshes.push(...b.finish(leg));
      limbs.push(leg);
      const arm = new TransformNode(name + ":arm", scene);
      arm.parent = root;
      arm.position.set(side * 0.285, 1.42, 0);
      const ab = new ModelBatch(scene, name + ":arm");
      ab.cylinder(
        "sleeve",
        0.3,
        0.19,
        [side * 0.02, -0.15, 0],
        cloth,
        [0, 0, side * 0.08],
        0.15,
      );
      ab.cylinder(
        "forearm",
        0.3,
        0.13,
        [side * 0.04, -0.42, 0.04],
        kind === "npc" ? cloth : skin,
        [0.18, 0, 0],
        0.09,
      );
      ab.sphere(
        "hand",
        [0.1, 0.15, 0.085],
        [side * 0.04, -0.59, 0.09],
        skin,
        8,
      );
      if (kind === "raider" && side === 1) {
        ab.box(
          "firearm",
          [0.07, 0.12, 0.4],
          [side * 0.04, -0.58, 0.26],
          mats.surface("metal"),
        );
        ab.cylinder(
          "barrel",
          0.18,
          0.035,
          [side * 0.04, -0.55, 0.52],
          mats.surface("metal"),
          [Math.PI / 2, 0, 0],
        );
      }
      meshes.push(...ab.finish(arm));
      limbs.push(arm);
    }
  }
  meshes.push(...body.finish(root));
  for (const mesh of meshes) {
    mesh.unfreezeWorldMatrix();
    mesh.receiveShadows = true;
    mesh.metadata = { actorId: name };
  }
  return { root, limbs, head, meshes };
}
export class CharacterRenderer {
  readonly rigs = new Map<string, CharacterRig>();
  constructor(
    private scene: Scene,
    private mats: MaterialFactory,
    private sim: Simulation,
    private shadow: (mesh: Mesh) => void,
  ) {}
  update(time: number): void {
    const p = this.sim.state.player.position;
    const visible = Object.values(this.sim.state.actors)
      .filter((a) => distance(a.position, p) < 115 && !a.harvested)
      .sort((a, b) => distance(a.position, p) - distance(b.position, p))
      .slice(0, 36);
    const ids = new Set(visible.map((a) => a.id));
    for (const [id, rig] of this.rigs)
      if (!ids.has(id)) {
        rig.root.dispose(false);
        this.rigs.delete(id);
      }
    for (const a of visible) {
      let rig = this.rigs.get(a.id);
      if (!rig) {
        rig = characterRig(this.scene, this.mats, a.id, a.kind);
        this.rigs.set(a.id, rig);
        rig.meshes.forEach(this.shadow);
      }
      this.animate(rig, a, time);
      for (const m of rig.meshes)
        m.visibility = Math.min(
          1,
          Math.max(0, (115 - distance(a.position, p)) / 15),
        );
    }
  }
  private animate(rig: CharacterRig, a: ActorData, time: number): void {
    const def = ENEMIES[a.kind],
      active = [
        "chase",
        "wander",
        "flee",
        "investigate",
        "search",
        "cover",
      ].includes(a.state);
    rig.root.position.set(a.position.x, a.position.y, a.position.z);
    rig.root.rotation.y = a.yaw;
    rig.root.scaling.setAll(def.size);
    if (a.health <= 0) {
      rig.root.rotation.z = 1.5;
      rig.root.position.y += 0.2;
      rig.root.rotation.x = 0.22;
      rig.limbs.forEach((l, i) => (l.rotation.x = i % 2 ? 0.5 : -0.4));
      return;
    }
    rig.root.rotation.z = 0;
    rig.root.rotation.x = 0;
    const speed = a.state === "wander" ? 2.7 : a.state === "flee" ? 10 : 6;
    const swing = active
      ? Math.sin(time * speed + a.phase) * 0.48
      : Math.sin(time * 0.9 + a.phase) * 0.025;
    rig.limbs.forEach((limb, i) => {
      limb.rotation.x =
        swing *
        (def.animal
          ? i === 0 || i === 3
            ? 1
            : -1
          : i === 0 || i === 3
            ? -1
            : 1);
      if (!def.animal && i % 2 === 1 && ["chase", "attack"].includes(a.state))
        limb.rotation.x = -0.9 + Math.sin(time * 4 + a.phase) * 0.16;
      if (a.state === "attack") limb.rotation.x += Math.sin(time * 8) * 0.35;
    });
    rig.head.rotation.y = Math.sin(time * 0.6 + a.phase) * 0.08;
    rig.root.position.y += active
      ? Math.abs(Math.sin(time * speed + a.phase)) * 0.035
      : 0;
  }
  dispose() {
    for (const r of this.rigs.values()) r.root.dispose(false);
    this.rigs.clear();
  }
}
