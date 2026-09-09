import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { damp, solveTwoBone } from "../core/motion";
import {
  createWorldMatrixReader,
  rotateBoneToward,
  setBoneWorldRotation,
  type ClipSample,
} from "./rig-animation";
import type { AnimatedRig, CharacterAssetLibrary } from "./animated-assets";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { type Mesh } from "@babylonjs/core/Meshes/mesh";
import { type Scene } from "@babylonjs/core/scene";
import { ENEMIES } from "../data/enemies";
import { distance, type ActorData } from "../core/types";
import { ModelBatch } from "./geometry";
import type { MaterialFactory } from "./materials";
import type { Simulation } from "../simulation/simulation";
import type { HitZone } from "../simulation/hit-zones";
import {
  AnimalAssetLibrary,
  updateAnimalAnimation,
  type AnimalRig,
  type AnimalKind,
} from "./animal-assets";
export interface CharacterRig {
  root: TransformNode;
  limbs: TransformNode[];
  head: TransformNode;
  meshes: Mesh[];
  skin?: AnimatedRig;
  animal?: AnimalRig;
  lod?: "high" | "low";
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
  readonly animals: AnimalAssetLibrary;
  private previousTime = 0;
  private observer: ReturnType<Scene["onAfterAnimationsObservable"]["add"]>;
  constructor(
    private scene: Scene,
    private mats: MaterialFactory,
    private sim: Simulation,
    private shadow: (mesh: Mesh) => void,
    private removeShadow: (mesh: Mesh) => void,
    private assets: CharacterAssetLibrary,
    private quality: string,
  ) {
    this.animals = new AnimalAssetLibrary(scene);
    this.observer = scene.onAfterAnimationsObservable.add(() => {
      for (const [id, rig] of this.rigs) {
        const actor = this.sim.state.actors[id];
        if (actor && rig.skin?.animator.sampled)
          this.procedural(rig.skin, actor);
        if (actor && rig.skin) this.syncHitZones(rig.skin, actor);
        if (actor && rig.animal) this.syncAnimalHitZones(rig.animal, actor);
      }
    });
  }
  private remove(id: string, rig: CharacterRig) {
    this.sim.combat.hitZones.delete(id);
    rig.meshes.forEach(this.removeShadow);
    if (rig.skin) rig.skin.dispose();
    else if (rig.animal) rig.animal.dispose();
    else rig.root.dispose(false);
    this.rigs.delete(id);
  }
  async preload() {
    const kinds = new Set(
      Object.values(this.sim.state.actors)
        .filter(
          (a) =>
            ENEMIES[a.kind].animal &&
            distance(a.position, this.sim.state.player.position) < 140,
        )
        .map((a) => a.kind as AnimalKind),
    );
    await Promise.all(
      [...kinds].map((k) =>
        this.animals.preload(k, this.quality === "low" ? "low" : "high"),
      ),
    );
  }
  update(time: number): void {
    const dt = Math.min(0.05, Math.max(0, time - this.previousTime));
    this.previousTime = time;
    const p = this.sim.state.player.position;
    const limit =
      this.quality === "low"
        ? 24
        : this.quality === "medium"
          ? 36
          : this.quality === "ultra"
            ? 64
            : 48;
    const visible = Object.values(this.sim.state.actors)
      .filter((a) => distance(a.position, p) < 140 && !a.harvested)
      .sort((a, b) => distance(a.position, p) - distance(b.position, p))
      .slice(0, limit);
    const ids = new Set(visible.map((a) => a.id));
    for (const [id, rig] of this.rigs) if (!ids.has(id)) this.remove(id, rig);
    for (const actor of visible) {
      let rig = this.rigs.get(actor.id);
      const dist = distance(actor.position, p),
        animal = ENEMIES[actor.kind].animal;
      const lod =
        this.quality === "low" || (rig?.lod === "low" ? dist > 60 : dist > 85)
          ? "low"
          : "high";
      if (animal && !this.animals.ready(actor.kind as AnimalKind, lod))
        void this.animals
          .preload(actor.kind as AnimalKind, lod)
          .catch(() => {});
      if (
        rig &&
        !animal &&
        this.assets.ready("male", lod) &&
        (!rig.skin || rig.lod !== lod)
      ) {
        this.remove(actor.id, rig);
        rig = undefined;
      }
      if (
        rig &&
        animal &&
        this.animals.ready(actor.kind as AnimalKind, lod) &&
        (!rig.animal || rig.lod !== lod)
      ) {
        this.remove(actor.id, rig);
        rig = undefined;
      }
      if (!rig) {
        const skin = !animal
          ? this.assets.instantiate(actor.id, "male", lod, actor.kind)
          : null;
        if (skin) this.equipment(skin, actor.kind);
        const quadruped = animal
          ? this.animals.instantiate(actor.id, actor.kind as AnimalKind, lod)
          : null;
        rig = quadruped
          ? {
              root: quadruped.root,
              head: quadruped.head,
              limbs: [],
              meshes: quadruped.meshes,
              animal: quadruped,
              lod,
            }
          : skin
            ? {
                root: skin.root,
                head: skin.nodes.get("Head")!,
                limbs: [],
                meshes: skin.meshes,
                skin,
                lod,
              }
            : characterRig(this.scene, this.mats, actor.id, actor.kind);
        this.rigs.set(actor.id, rig);
        rig.meshes.forEach(this.shadow);
      }
      if (rig.animal) {
        rig.root.position.set(
          actor.position.x,
          actor.position.y,
          actor.position.z,
        );
        rig.root.rotation.y = actor.yaw;
        updateAnimalAnimation(
          rig.animal,
          actor,
          this.sim.state.elapsed,
          dt,
          dist,
        );
        if (actor.health > 0) {
          const forward = {
              x: Math.sin(actor.yaw) * 0.55,
              z: Math.cos(actor.yaw) * 0.55,
            },
            side = {
              x: Math.cos(actor.yaw) * 0.24,
              z: -Math.sin(actor.yaw) * 0.24,
            };
          const ground = (x: number, z: number) =>
            this.sim.collision.ground(
              actor.position.x + x,
              actor.position.z + z,
              actor.position.y,
            );
          rig.root.rotation.x = damp(
            rig.root.rotation.x,
            Math.max(
              -0.3,
              Math.min(
                0.3,
                Math.atan2(
                  ground(-forward.x, -forward.z) - ground(forward.x, forward.z),
                  1.1,
                ),
              ),
            ),
            9,
            dt,
          );
          rig.root.rotation.z = damp(
            rig.root.rotation.z,
            Math.max(
              -0.22,
              Math.min(
                0.22,
                Math.atan2(
                  ground(side.x, side.z) - ground(-side.x, -side.z),
                  0.48,
                ),
              ),
            ),
            9,
            dt,
          );
        }
      } else if (rig.skin) this.animateSkin(rig.skin, actor, dt, dist);
      else this.animateAnimal(rig, actor, dt);
      for (const mesh of rig.meshes)
        mesh.visibility = Math.min(1, Math.max(0, (140 - dist) / 20));
    }
  }
  private syncAnimalHitZones(rig: AnimalRig, actor: ActorData) {
    if (actor.health <= 0) {
      this.sim.combat.hitZones.delete(actor.id);
      return;
    }
    const readWorld = createWorldMatrixReader();
    readWorld(rig.head);
    const head = rig.head.getAbsolutePosition(),
      body = rig.nodes.get(rig.profile.bones.body);
    if (body) readWorld(body);
    const center = (body?.getAbsolutePosition() ?? head).clone(),
      forward = new Vector3(Math.sin(actor.yaw), 0, Math.cos(actor.yaw));
    // Quaternius Body is the locomotion root at hoof height; the boar Hips is anatomical.
    if (actor.kind === "deer") center.y += 1;
    if (actor.kind === "wolf") center.y += 0.5;
    const zones: HitZone[] = [
      {
        part: "head",
        a: { x: head.x, y: head.y + 0.07, z: head.z },
        b: {
          x: head.x + forward.x * 0.23,
          y: head.y + 0.03,
          z: head.z + forward.z * 0.23,
        },
        radius: actor.kind === "boar" ? 0.18 : 0.145,
      },
      {
        part: "chest",
        a: {
          x: center.x - forward.x * 0.32,
          y: center.y,
          z: center.z - forward.z * 0.32,
        },
        b: {
          x: center.x + forward.x * 0.42,
          y: center.y,
          z: center.z + forward.z * 0.42,
        },
        radius: actor.kind === "wolf" ? 0.24 : 0.34,
      },
    ];
    for (const foot of rig.feet) {
      readWorld(foot);
      const p = foot.getAbsolutePosition();
      zones.push({
        part: "leg",
        a: { x: p.x, y: p.y, z: p.z },
        b: { x: p.x, y: actor.position.y + 0.07, z: p.z },
        radius: 0.075,
      });
    }
    this.sim.combat.hitZones.set(actor.id, zones);
  }
  private equipment(rig: AnimatedRig, kind: string) {
    if (kind !== "armored" && kind !== "raider") return;
    const fabric = this.mats.surface("cloth", "#6a6c4f"),
      metal = this.mats.surface("metal", "#656c5b");
    const attach = (bone: string, build: (batch: ModelBatch) => void) => {
      const node = rig.nodes.get(bone);
      if (!node) return;
      const batch = new ModelBatch(this.scene, rig.root.name + ":gear:" + bone);
      build(batch);
      for (const mesh of batch.finish(node)) {
        mesh.unfreezeWorldMatrix();
        mesh.receiveShadows = true;
        mesh.metadata = { actorId: rig.root.name.replace(":animated-rig", "") };
        rig.meshes.push(mesh);
      }
    };
    attach("Head", (b) => {
      b.sphere("helmet", [0.31, 0.21, 0.33], [0, 0.16, 0], metal, 14);
      b.box("rim", [0.32, 0.025, 0.34], [0, 0.085, 0], metal);
    });
    attach("spine_03", (b) => {
      b.beveledBox("front-plate", [0.4, 0.4, 0.07], [0, -0.06, 0.155], fabric);
      b.beveledBox("back-plate", [0.4, 0.4, 0.07], [0, -0.06, -0.17], fabric);
      for (const side of [-1, 1]) {
        b.box("strap", [0.06, 0.45, 0.34], [side * 0.15, -0.05, 0], fabric);
        b.beveledBox(
          "mag-pouch",
          [0.115, 0.16, 0.09],
          [side * 0.12, -0.17, 0.22],
          fabric,
        );
      }
    });
    if (kind === "raider")
      attach("hand_r", (b) => {
        b.beveledBox(
          "pistol-slide",
          [0.065, 0.085, 0.27],
          [0, 0.115, 0.1],
          metal,
        );
        b.beveledBox(
          "pistol-grip",
          [0.055, 0.125, 0.075],
          [0, 0.055, 0.01],
          this.mats.surface("plastic"),
        );
        b.cylinder("barrel", 0.08, 0.028, [0, 0.11, 0.27], metal, [
          Math.PI / 2,
          0,
          0,
        ]);
      });
  }
  private samples(rig: AnimatedRig, a: ActorData): ClipSample[] {
    const elapsed = this.sim.state.elapsed;
    const loop = (clip: string, weight = 1): ClipSample => ({
      clip,
      phase: (elapsed + a.phase) / rig.animator.duration(clip),
      weight,
    });
    if (a.health <= 0) {
      const t = Math.min(1, Math.max(0, elapsed - a.deathTime) / 1.05);
      if (a.deathStyle === 1)
        return [{ clip: "LayToIdle", phase: 1 - t, weight: 1, loop: false }];
      if (a.deathStyle === 4)
        return [
          {
            clip: "Fixing_Kneeling",
            phase: Math.min(1, t * 2),
            weight: Math.max(0, 1 - t * 1.6),
            loop: false,
          },
          {
            clip: "Death01",
            phase: t,
            weight: Math.min(1, t * 1.6),
            loop: false,
          },
        ];
      if (a.deathStyle === 5)
        return [
          {
            clip: "Hit_Knockback",
            phase: Math.min(1, t * 1.8),
            weight: Math.max(0, 1 - t * 1.7),
            loop: false,
          },
          {
            clip: "Death01",
            phase: t,
            weight: Math.min(1, t * 1.7),
            loop: false,
          },
        ];
      return [{ clip: "Death01", phase: t, weight: 1, loop: false }];
    }
    if (a.attack) {
      const attack = a.attack;
      const contact = a.kind === "raider" ? 0.15 : 0.4;
      const phase =
        attack.elapsed < attack.hitTime
          ? (attack.elapsed / attack.hitTime) * contact
          : contact +
            ((attack.elapsed - attack.hitTime) /
              (attack.duration - attack.hitTime)) *
              (1 - contact);
      return [
        {
          clip: a.kind === "raider" ? "Pistol_Shoot" : "Melee_Hook",
          phase,
          weight: 1,
          loop: false,
        },
      ];
    }
    if (a.state === "knockdown")
      return [
        {
          clip: "Hit_Knockback",
          phase: Math.min(1, a.stateAge / 0.5),
          weight: Math.max(0, 1 - a.stateAge * 2.5),
          loop: false,
        },
        {
          clip: "Death01",
          phase: Math.min(1, a.stateAge / 0.75),
          weight: Math.min(1, a.stateAge * 2.5),
          loop: false,
        },
      ];
    if (a.state === "getup")
      return [
        { clip: "LayToIdle", phase: a.stateAge / 1.05, weight: 1, loop: false },
      ];
    if (a.state === "stagger")
      return [
        {
          clip: a.reaction?.part === "head" ? "Hit_Head" : "Hit_Chest",
          phase: a.stateAge / 0.38,
          weight: 1,
          loop: false,
        },
      ];
    if (a.traversal)
      return [
        {
          clip: "ClimbUp_1m",
          phase: a.traversal.elapsed / a.traversal.duration,
          weight: 1,
          loop: false,
        },
      ];
    if (a.speed > 0.08) {
      const run = Math.max(0, Math.min(1, (a.speed - 2) / 2.5));
      const walk = a.kind === "raider" ? "Walk_Loop" : "Zombie_Walk_Fwd_Loop";
      const phase = a.gaitPhase / (Math.PI * 2);
      return [
        { clip: walk, phase, weight: 1 - run },
        {
          clip: a.kind === "runner" ? "Sprint_Loop" : "Jog_Fwd_Loop",
          phase,
          weight: run,
        },
      ];
    }
    if (a.behavior === "sitting") return [loop("Sitting_Idle_Loop")];
    if (a.behavior === "lying")
      return [{ clip: "Death01", phase: 0.999, weight: 1, loop: false }];
    if (a.behavior === "feeding") return [loop("Fixing_Kneeling")];
    if (a.behavior === "wallLean") return [loop("Idle_Rail_Loop")];
    if (a.behavior === "twitch") return [loop("Zombie_Scratch")];
    return [
      loop(a.kind === "raider" ? "Pistol_Idle_Loop" : "Zombie_Idle_Loop"),
    ];
  }
  private syncHitZones(rig: AnimatedRig, actor: ActorData) {
    if (actor.health <= 0) {
      this.sim.combat.hitZones.delete(actor.id);
      return;
    }
    const readWorld = createWorldMatrixReader();
    const point = (name: string, offset?: Vector3) => {
      const node = rig.nodes.get(name);
      if (!node) return null;
      const matrix = readWorld(node);
      const p = offset
        ? Vector3.TransformCoordinates(offset, matrix)
        : node.getAbsolutePosition();
      return { x: p.x, y: p.y, z: p.z };
    };
    const zones: HitZone[] = [],
      scale = ENEMIES[actor.kind].size;
    const head = point("Head", new Vector3(0, 0.09, 0));
    if (head)
      zones.push({ part: "head", a: head, b: head, radius: 0.155 * scale });
    const pair = (
      part: HitZone["part"],
      a: string,
      b: string,
      radius: number,
    ) => {
      const from = point(a),
        to = point(b);
      if (from && to)
        zones.push({ part, a: from, b: to, radius: radius * scale });
    };
    pair("chest", "pelvis", "spine_02", 0.22);
    pair("chest", "spine_02", "spine_03", 0.19);
    for (const side of ["l", "r"]) {
      pair("arm", "upperarm_" + side, "lowerarm_" + side, 0.09);
      pair("arm", "lowerarm_" + side, "hand_" + side, 0.075);
      pair("leg", "thigh_" + side, "calf_" + side, 0.115);
      pair("leg", "calf_" + side, "foot_" + side, 0.085);
    }
    this.sim.combat.hitZones.set(actor.id, zones);
  }
  private animateSkin(
    rig: AnimatedRig,
    a: ActorData,
    dt: number,
    dist: number,
  ) {
    rig.root.position.set(a.position.x, a.position.y + 0.015, a.position.z);
    rig.root.rotation.y = a.yaw;
    rig.root.scaling.setAll(ENEMIES[a.kind].size);
    rig.animator.sample(
      this.samples(rig, a),
      dt,
      dist < 30 ? 0 : dist < 80 ? 1 / 15 : 1 / 6,
      a.attack ? 23 : 17,
    );
  }
  private procedural(rig: AnimatedRig, a: ActorData) {
    const animator = rig.animator,
      spine = rig.nodes.get("spine_02"),
      head = rig.nodes.get("Head");
    if (a.health > 0 && !["knockdown", "getup", "vault"].includes(a.state)) {
      const target = a.target,
        dx = target.x - a.position.x,
        dz = target.z - a.position.z;
      const look =
        a.lastSeen < 2
          ? Math.atan2(
              Math.sin(Math.atan2(dx, dz) - a.yaw),
              Math.cos(Math.atan2(dx, dz) - a.yaw),
            ) * 0.35
          : Math.sin(this.sim.state.elapsed * 0.5 + a.phase) * 0.1;
      animator.offset(
        head,
        Math.sin(this.sim.state.elapsed * 1.1 + a.phase) * 0.015,
        Math.max(-0.38, Math.min(0.38, look)),
        0,
      );
      animator.offset(
        spine,
        a.kind === "raider" ? 0 : 0.09,
        0,
        Math.sin(a.gaitPhase) * a.legDamage * 0.0015,
      );
    }
    if (a.reaction && a.health > 0) {
      const reaction = a.reaction,
        t = Math.min(1, reaction.elapsed / reaction.duration),
        amount = Math.sin(Math.min(1, t * 3) * Math.PI) * reaction.strength;
      const side =
        reaction.side === "left" ? -1 : reaction.side === "right" ? 1 : 0;
      animator.offset(
        reaction.part === "head" ? head : spine,
        amount * (reaction.side === "back" ? -0.17 : 0.17),
        amount * side * 0.1,
        amount * side * 0.2,
      );
      if (reaction.part === "arm")
        animator.offset(
          rig.nodes.get(side > 0 ? "upperarm_r" : "upperarm_l"),
          amount * 0.22,
          0,
          amount * 0.15,
        );
    }
    if (a.health <= 0) {
      const t = Math.min(1, (this.sim.state.elapsed - a.deathTime) / 0.8),
        side = a.deathStyle === 2 ? -1 : a.deathStyle === 3 ? 1 : 0;
      animator.offset(rig.nodes.get("pelvis"), 0, 0, side * t * 0.22);
      const settle =
        Math.exp(-Math.max(0, this.sim.state.elapsed - a.deathTime) * 3.5) *
        Math.sin((this.sim.state.elapsed - a.deathTime) * 15);
      animator.offset(head, settle * 0.1, 0, side * settle * 0.08);
      return;
    }
    if (
      distance(a.position, this.sim.state.player.position) > 30 ||
      a.traversal ||
      ["knockdown", "getup"].includes(a.state)
    )
      return;
    for (const side of ["l", "r"]) {
      const thigh = rig.nodes.get("thigh_" + side),
        calf = rig.nodes.get("calf_" + side),
        foot = rig.nodes.get("foot_" + side);
      if (!thigh || !calf || !foot) continue;
      thigh.computeWorldMatrix(true);
      calf.computeWorldMatrix(true);
      foot.computeWorldMatrix(true);
      const hip = thigh.getAbsolutePosition().clone(),
        knee = calf.getAbsolutePosition().clone(),
        ankle = foot.getAbsolutePosition().clone();
      if (ankle.y - a.position.y > 0.22) continue;
      const height =
        this.sim.collision.ground(ankle.x, ankle.z, a.position.y) + 0.075;
      const correction = Math.max(-0.16, Math.min(0.2, height - ankle.y));
      if (Math.abs(correction) < 0.01) continue;
      const target = ankle.add(new Vector3(0, correction, 0));
      const pole = { x: Math.sin(a.yaw), y: 0.05, z: Math.cos(a.yaw) };
      const solved = solveTwoBone(
        hip,
        target,
        pole,
        Vector3.Distance(hip, knee),
        Vector3.Distance(knee, ankle),
      );
      animator.preserve(thigh);
      animator.preserve(calf);
      animator.preserve(foot);
      const footOrientation = foot.getWorldMatrix().clone();
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
      setBoneWorldRotation(foot, footOrientation);
    }
  }
  private animateAnimal(rig: CharacterRig, a: ActorData, dt: number) {
    const def = ENEMIES[a.kind],
      time = this.sim.state.elapsed;
    rig.root.position.set(a.position.x, a.position.y, a.position.z);
    rig.root.rotation.y = a.yaw;
    rig.root.scaling.setAll(def.size);
    const death = a.health <= 0 ? Math.min(1, (time - a.deathTime) / 0.8) : 0;
    rig.root.rotation.z = damp(
      rig.root.rotation.z,
      death * (a.deathStyle % 2 ? 1.42 : -1.42),
      12,
      dt,
    );
    rig.root.position.y += death * 0.2;
    const movement = Math.min(1, a.speed / Math.max(1, def.speed));
    rig.limbs.forEach((limb, i) => {
      let angle =
        Math.sin(a.gaitPhase + (i === 0 || i === 3 ? 0 : Math.PI)) *
        0.48 *
        movement;
      if (a.attack) {
        const p = a.attack.elapsed / a.attack.duration;
        angle += Math.sin(Math.PI * p) * 0.25;
      }
      if (death) angle = (i % 2 ? 0.5 : -0.4) * death;
      limb.rotation.x = damp(limb.rotation.x, angle, 18, dt);
    });
    rig.head.rotation.x = damp(
      rig.head.rotation.x,
      a.attack ? -0.2 : 0,
      15,
      dt,
    );
    rig.head.rotation.y = Math.sin(time * 0.6 + a.phase) * 0.06;
  }
  dispose() {
    this.scene.onAfterAnimationsObservable.remove(this.observer);
    for (const [id, rig] of this.rigs) this.remove(id, rig);
    this.animals.dispose();
  }
}
