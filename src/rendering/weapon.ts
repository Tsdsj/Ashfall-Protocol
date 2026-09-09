import { FirstPersonArms } from "./view-arms";
import { smoothstep } from "../core/motion";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { type Camera } from "@babylonjs/core/Cameras/camera";
import { type Mesh } from "@babylonjs/core/Meshes/mesh";
import { type Scene } from "@babylonjs/core/scene";
import { ModelBatch } from "./geometry";
import { ITEMS } from "../data/items";
import type { MaterialFactory } from "./materials";
import type { Simulation } from "../simulation/simulation";
import type { GameSettings } from "../core/types";
import type { FirstPersonMotionController } from "./first-person-motion";
import type { CharacterAssetLibrary } from "./animated-assets";
import { WeaponAssetLibrary, type WeaponAssetInstance } from "./weapon-assets";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { countItem } from "../simulation/inventory";
export class WeaponRenderer {
  readonly root: TransformNode;
  private model: TransformNode | null = null;
  private last = "";
  private shot = 0;
  private inspectTime = 0;
  private meshes: Mesh[] = [];
  private flash: Mesh | null = null;
  private arms: FirstPersonArms | null = null;
  private external: WeaponAssetInstance | null = null;
  private wetness = 0;
  readonly weaponAssets: WeaponAssetLibrary;
  private mechanics: {
    mesh: Mesh;
    x: number;
    y: number;
    z: number;
    rz: number;
    magazine: boolean;
  }[] = [];
  constructor(
    private scene: Scene,
    private mats: MaterialFactory,
    camera: Camera,
    private sim: Simulation,
    private motion: FirstPersonMotionController,
    private assets: CharacterAssetLibrary,
  ) {
    this.weaponAssets = new WeaponAssetLibrary(scene);
    this.root = new TransformNode("first-person-arms", scene);
    this.root.parent = camera;
    this.root.scaling.setAll(0.68);
  }
  preload() {
    return this.weaponAssets.preload();
  }
  private rebuild(id: string) {
    this.external?.dispose();
    this.external = null;
    this.arms?.dispose();
    this.model?.dispose(false);
    this.flash = null;
    this.arms = null;
    this.mechanics = [];
    this.model = new TransformNode("held-" + id, this.scene);
    this.model.parent = this.root;
    const b = new ModelBatch(this.scene, "viewmodel"),
      steel = this.mats.surface("metal", "#8f9d95"),
      black = this.mats.surface("plastic"),
      wood = this.mats.surface("wood"),
      glove = this.mats.surface("cloth", "#8c9b86");
    const firearm = !!ITEMS[id]?.weapon?.ammo && id !== "bow",
      long = firearm && !["pistol", "pistol45"].includes(id);
    if (id === "hands") {
      // Hands and the active consumable are provided by the articulated arm rig.
    } else if (firearm && this.weaponAssets.ready(id)) {
      this.external = this.weaponAssets.instantiate(
        id,
        this.model,
        "held-asset-" + id,
        this.sim.combat.equipped()?.attachments,
      );
      if (this.sim.combat.equipped()?.attachments.includes("suppressor")) {
        const muzzle = this.external!.info.anchors.muzzle;
        b.cylinder(
          "suppressor",
          0.24,
          0.052,
          [muzzle[0]!, muzzle[1]!, muzzle[2]! + 0.12],
          black,
          [Math.PI / 2, 0, 0],
        );
      }
    } else if (firearm) {
      b.beveledBox(
        "receiver",
        [0.11, 0.16, long ? 0.52 : 0.3],
        [0, 0.045, long ? 0.32 : 0.22],
        steel,
      );
      b.beveledBox(
        "slide",
        [0.115, 0.066, long ? 0.55 : 0.33],
        [0, 0.15, long ? 0.33 : 0.23],
        steel,
      );
      b.beveledBox(
        "grip",
        [0.1, 0.23, 0.11],
        [0.005, -0.13, 0.13],
        black,
        [0.22, 0, 0],
      );
      b.beveledBox(
        "trigger-guard",
        [0.095, 0.022, 0.14],
        [0, -0.052, 0.26],
        steel,
      );
      b.beveledBox("trigger", [0.024, 0.075, 0.018], [0, -0.015, 0.27], steel);
      b.cylinder(
        "barrel",
        long ? 0.48 : 0.2,
        long ? 0.035 : 0.027,
        [0, 0.105, long ? 0.77 : 0.45],
        steel,
        [Math.PI / 2, 0, 0],
      );
      b.cylinder("muzzle", 0.06, 0.045, [0, 0.105, long ? 1.03 : 0.57], black, [
        Math.PI / 2,
        0,
        0,
      ]);
      b.beveledBox(
        "rear-sight-base",
        [0.11, 0.016, 0.032],
        [0, 0.188, 0.09],
        black,
      );
      for (const side of [-1, 1]) {
        b.beveledBox(
          "rear-sight-post",
          [0.029, 0.034, 0.032],
          [side * 0.041, 0.205, 0.09],
          black,
        );
        b.sphere(
          "sight-dot",
          [0.008, 0.008, 0.005],
          [side * 0.042, 0.208, 0.072],
          this.mats.simple("sight-inset", "#b4bdae"),
          6,
        );
      }
      b.beveledBox(
        "front-sight",
        [0.025, 0.035, 0.03],
        [0, 0.203, long ? 0.87 : 0.43],
        black,
      );
      if (long) {
        b.beveledBox(
          "stock",
          [0.11, 0.19, 0.4],
          [0, -0.005, -0.14],
          id === "rifle" ? wood : black,
          [0.03, 0, 0],
        );
        b.beveledBox(
          "magazine",
          [0.095, 0.28, 0.14],
          [0, -0.17, 0.37],
          black,
          [0.06, 0, 0],
        );
        b.cylinder(
          "handguard",
          0.34,
          0.12,
          [0, 0.09, 0.64],
          id === "rifle" ? wood : black,
          [Math.PI / 2, 0, 0],
        );
        for (let n = 0; n < 7; n++)
          b.beveledBox(
            "rail",
            [0.13, 0.014, 0.012],
            [0, 0.192, 0.39 + n * 0.05],
            steel,
          );
      }
      if (!long)
        b.beveledBox(
          "magazine",
          [0.072, 0.2, 0.094],
          [0.005, -0.165, 0.13],
          black,
          [0.22, 0, 0],
        );
      if (this.sim.combat.equipped()?.attachments.includes("scope")) {
        b.cylinder("scope", 0.32, 0.09, [0, 0.29, 0.32], black, [
          Math.PI / 2,
          0,
          0,
        ]);
        b.cylinder(
          "scope-glass",
          0.008,
          0.072,
          [0, 0.29, 0.153],
          this.mats.simple("scopeglass", "#70867c"),
          [Math.PI / 2, 0, 0],
        );
      }
      if (this.sim.combat.equipped()?.attachments.includes("suppressor"))
        b.cylinder(
          "suppressor",
          0.3,
          0.065,
          [0, 0.105, long ? 1.18 : 0.7],
          black,
          [Math.PI / 2, 0, 0],
        );
    } else if (id === "hatchet") {
      b.cylinder("handle", 0.7, 0.055, [0, 0.12, 0.26], wood, [0.45, 0, 0]);
      b.beveledBox(
        "axe-head",
        [0.24, 0.19, 0.065],
        [-0.06, 0.42, 0.41],
        steel,
        [0, 0, -0.2],
      );
    } else if (id === "pickaxe") {
      b.cylinder(
        "pickaxe-handle",
        0.72,
        0.03,
        [0, 0.12, 0.26],
        wood,
        [0.45, 0, 0],
      );
      b.beveledBox(
        "pickaxe-head",
        [0.4, 0.07, 0.07],
        [0, 0.44, 0.41],
        steel,
        [0, 0, -0.15],
      );
      b.beveledBox(
        "pickaxe-tip",
        [0.15, 0.035, 0.05],
        [0.23, 0.4, 0.41],
        steel,
        [0, 0, -0.45],
      );
    } else if (id === "spear") {
      b.cylinder(
        "shaft",
        1.55,
        0.05,
        [0, 0.04, 0.75],
        wood,
        [Math.PI / 2, 0, 0],
        0.035,
      );
      b.cylinder(
        "point",
        0.22,
        0.05,
        [0, 0.04, 1.64],
        steel,
        [Math.PI / 2, 0, 0],
        0,
      );
    } else if (id === "crowbar") {
      b.cylinder(
        "shaft",
        0.65,
        0.028,
        [0, 0.17, 0.34],
        this.mats.surface("rust"),
        [-0.3, 0, 0],
      );
      b.beveledBox("hook", [0.03, 0.07, 0.12], [0, 0.5, 0.42], steel);
    } else if (id === "bow") {
      b.cylinder(
        "bow-upper",
        0.6,
        0.04,
        [-0.04, 0.34, 0.34],
        wood,
        [0.35, 0, 0.1],
      );
      b.cylinder(
        "bow-lower",
        0.6,
        0.04,
        [-0.04, -0.2, 0.34],
        wood,
        [-0.35, 0, -0.1],
      );
      b.cylinder(
        "string",
        1,
        0.005,
        [0, 0.07, 0.1],
        this.mats.simple("string", "#a3a69b"),
      );
      b.cylinder("arrow", 0.7, 0.012, [0, 0.08, 0.45], wood, [
        Math.PI / 2,
        0,
        0,
      ]);
    } else if (id === "torch") {
      b.cylinder(
        "torch-handle",
        0.7,
        0.055,
        [0, 0.13, 0.31],
        wood,
        [-0.35, 0, 0],
      );
      b.cylinder(
        "wrapped-cloth",
        0.18,
        0.11,
        [0, 0.46, 0.43],
        glove,
        [-0.35, 0, 0],
      );
      b.cylinder(
        "torch-flame",
        0.2,
        0.07,
        [0, 0.63, 0.49],
        this.mats.simple("torch-flame", "#ffad43", 3),
        [0, 0, 0],
        0,
      );
    } else if (id === "fishingrod") {
      b.cylinder(
        "rod",
        1.7,
        0.027,
        [0, 0.12, 0.94],
        wood,
        [Math.PI / 2 - 0.13, 0, 0],
        0.006,
      );
      b.cylinder("reel", 0.05, 0.085, [0.055, 0.07, 0.27], steel, [
        0,
        0,
        Math.PI / 2,
      ]);
      b.cylinder(
        "line",
        1.35,
        0.0015,
        [0, 0.24, 1.8],
        this.mats.simple("fishing-line", "#b7bba7"),
        [0, 0, 0],
      );
    } else if (id === "hammer") {
      b.cylinder("handle", 0.45, 0.04, [0, 0.11, 0.26], wood, [-0.2, 0, 0]);
      b.beveledBox("hammer-head", [0.23, 0.09, 0.09], [0, 0.34, 0.31], steel);
    } else if (id === "wrench") {
      b.beveledBox(
        "wrench-shaft",
        [0.045, 0.035, 0.48],
        [0, 0.11, 0.41],
        steel,
      );
      b.beveledBox("jaw-base", [0.13, 0.035, 0.09], [0, 0.11, 0.68], steel);
      for (const side of [-1, 1])
        b.beveledBox(
          "jaw",
          [0.035, 0.035, 0.1],
          [side * 0.055, 0.11, 0.76],
          steel,
        );
    } else if (id === "shovel") {
      b.cylinder("shaft", 0.9, 0.04, [0, 0.08, 0.6], wood, [
        Math.PI / 2 - 0.2,
        0,
        0,
      ]);
      b.beveledBox(
        "spade",
        [0.22, 0.018, 0.3],
        [0, 0.21, 1.17],
        steel,
        [0.2, 0, 0],
      );
    } else if (id === "grenade") {
      b.sphere(
        "grenade-body",
        [0.13, 0.2, 0.13],
        [0, 0.1, 0.25],
        this.mats.surface("metal", "#a3b08f"),
      );
      b.beveledBox(
        "grenade-lever",
        [0.035, 0.14, 0.04],
        [0.065, 0.17, 0.25],
        steel,
        [0, 0, 0.15],
      );
      b.cylinder("fuse", 0.065, 0.045, [0, 0.23, 0.25], steel);
    } else {
      b.beveledBox(
        "knife-handle",
        [0.024, 0.026, 0.17],
        [0, 0.077, 0.24],
        wood,
        [0, 0, 0],
      );
      b.beveledBox(
        "knife-guard",
        [0.09, 0.018, 0.025],
        [0, 0.077, 0.325],
        steel,
      );
      const blade = this.mats.simple("knife-blade", "#a3aaa3");
      blade.metallic = 0.85;
      blade.roughness = 0.3;
      b.beveledBox(
        "blade",
        [0.045, 0.009, 0.3],
        [0, 0.077, 0.4875],
        blade,
        [0, 0, 0],
      );
      b.cylinder(
        "blade-tip",
        0.11,
        0.045,
        [0, 0.077, 0.6925],
        blade,
        [Math.PI / 2, 0, 0],
        0,
        3,
      );
    }
    if (firearm) {
      const mat = this.mats.simple("muzzle-flash", "#ffd071", 6, 0.8);
      this.flash = b.cylinder(
        "muzzle-flash",
        0.2,
        0.1,
        [0, 0.105, long ? 1.12 : 0.66],
        mat,
        [Math.PI / 2, 0, 0],
        0,
        5,
      );
      b.take(this.flash);
      this.flash.parent = this.model;
      this.flash.renderingGroupId = 1;
      this.flash.isPickable = false;
      this.flash.setEnabled(false);
      if (this.external) {
        const point = this.external.info.anchors.muzzle;
        this.flash.position.set(point[0]!, point[1]!, point[2]! + 0.06);
      }
    }
    for (const mesh of [...b.meshes]) {
      if (
        /(?:slide|rear-sight-base|rear-sight-post|sight-dot|magazine)$/.test(
          mesh.name,
        )
      ) {
        b.take(mesh);
        mesh.parent = this.model;
        this.mechanics.push({
          mesh,
          x: mesh.position.x,
          y: mesh.position.y,
          z: mesh.position.z,
          rz: mesh.rotation.z,
          magazine: mesh.name.endsWith("magazine"),
        });
      }
    }
    this.arms = new FirstPersonArms(
      this.scene,
      this.mats,
      this.model,
      long,
      id,
      this.assets,
      this.external?.info.anchors,
    );
    this.meshes = [
      ...b.finish(this.model),
      ...this.mechanics.map((m) => m.mesh),
      ...(this.external?.meshes ?? []),
    ];
    for (const m of this.meshes) {
      m.unfreezeWorldMatrix();
      m.renderingGroupId = 1;
      m.isPickable = false;
      m.receiveShadows = false;
    }
  }
  kick() {
    this.shot = 1;
  }
  inspect() {
    this.inspectTime = 2.2;
  }
  mouse(dx: number, dy: number) {
    this.motion.mouse(dx, dy);
  }
  update(
    dt: number,
    _time: number,
    _aiming: boolean,
    settings: GameSettings,
    visible: boolean,
  ) {
    const equipped = this.sim.combat.equipped(),
      id =
        equipped && ["weapon", "tool"].includes(ITEMS[equipped.id]!.category)
          ? equipped.id
          : "hands";
    const key = id + ":" + equipped?.attachments.join(",");
    if (key !== this.last) {
      this.last = key;
      this.rebuild(id);
    }
    this.root.setEnabled(
      visible &&
        !this.sim.state.player.vehicle &&
        !(
          equipped?.attachments.includes("scope") && this.motion.pose.ads > 0.92
        ) &&
        (id !== "hands" || this.motion.pose.interaction > 0.005),
    );
    this.shot = Math.max(0, this.shot - dt * 5);
    this.inspectTime = Math.max(0, this.inspectTime - dt);
    const pose = this.motion.pose;
    if (id === "grenade")
      for (const mesh of this.meshes)
        mesh.setEnabled(this.sim.combat.throwRemaining <= 0);
    const wetTarget =
      !this.sim.indoors && ["rain", "storm"].includes(this.sim.state.weather)
        ? 1
        : 0;
    this.wetness += (wetTarget - this.wetness) * (1 - Math.exp(-dt * 0.12));
    for (const mesh of this.external?.meshes ?? []) {
      const material = mesh.material as PBRMaterial;
      if (material?.clearCoat)
        material.clearCoat.intensity = this.wetness * 0.38;
    }
    this.root.position.set(
      pose.weaponPosition.x,
      pose.weaponPosition.y,
      pose.weaponPosition.z,
    );
    this.root.rotation.set(
      pose.weaponRotation.x,
      pose.weaponRotation.y,
      pose.weaponRotation.z,
    );
    if (this.external) {
      const rear = this.external.info.anchors.rearSight,
        front = this.external.info.anchors.frontSight;
      const slope = Math.atan2(front[1]! - rear[1]!, front[2]! - rear[2]!);
      this.root.rotation.x += pose.ads * slope;
      const sightHeight =
        rear[1]! * Math.cos(slope) - rear[2]! * Math.sin(slope);
      this.root.position.y += pose.ads * (0.142 - sightHeight * 0.68);
    }
    const reloading = this.sim.combat.reloadRemaining > 0;
    const clearing = reloading && this.sim.combat.reloadMode === "clear";
    this.arms?.update(
      pose,
      reloading,
      dt,
      clearing,
      Math.max(
        1,
        Math.min(
          (ITEMS[id]?.weapon?.magazine ?? 1) - (equipped?.ammo ?? 0),
          countItem(
            this.sim.state.player.inventory,
            ITEMS[id]?.weapon?.ammo ?? "",
          ),
        ),
      ),
    );
    if (this.external) {
      const rig = this.external;
      rig.resetParts();
      const magazine = rig.parts.magazine,
        r = pose.reload;
      const pull =
        !reloading || clearing
          ? 0
          : r < 0.35
            ? smoothstep((r - 0.14) / 0.21)
            : r < 0.46
              ? 1
              : 1 - smoothstep((r - 0.46) / 0.26);
      if (magazine) {
        magazine.position.y -= pull * rig.info.magazineTravel;
        magazine.position.x -= pull * 0.12;
        magazine.rotation.z = pull * 0.15;
        magazine.setEnabled(!reloading || clearing || r < 0.38 || r > 0.5);
      }
      const rack = reloading
        ? Math.sin(
            smoothstep(
              (r - (clearing ? 0.3 : 0.76)) / (clearing ? 0.25 : 0.1),
            ) * Math.PI,
          )
        : 0;
      if (rig.parts.slide)
        rig.parts.slide.position.z += (this.shot + rack) * rig.info.slideTravel;
      if (rig.parts.bolt) {
        rig.parts.bolt.rotation.z = rack * 0.65;
        rig.parts.bolt.position.z += rack * rig.info.slideTravel;
      }
      if (rig.parts.pump)
        rig.parts.pump.position.z +=
          (rack + Math.sin((1 - this.shot) * Math.PI) * this.shot) *
          rig.info.slideTravel;
    }
    for (const part of this.mechanics) {
      if (part.magazine) {
        const r = pose.reload;
        const pull =
          !reloading || clearing
            ? 0
            : r < 0.35
              ? smoothstep((r - 0.14) / 0.21)
              : r < 0.46
                ? 1
                : 1 - smoothstep((r - 0.46) / 0.26);
        part.mesh.position.set(
          part.x - pull * 0.12,
          part.y - pull * 0.35,
          part.z,
        );
        part.mesh.rotation.z = part.rz + pull * 0.15;
        part.mesh.setEnabled(!reloading || clearing || r < 0.38 || r > 0.5);
      } else {
        const rack = reloading
          ? Math.sin(
              smoothstep(
                (pose.reload - (clearing ? 0.3 : 0.76)) /
                  (clearing ? 0.25 : 0.1),
              ) * Math.PI,
            )
          : 0;
        part.mesh.position.z = part.z - this.shot * 0.035 - rack * 0.045;
      }
    }
    if (this.flash) this.flash.setEnabled(this.shot > 0.7);
    if (id === "torch")
      this.meshes
        .filter((m) => m.material?.name === "torch-flame")
        .forEach((m) => m.setEnabled((equipped?.durability ?? 0) > 0));
    if (!ITEMS[id]?.weapon?.ammo && this.sim.combat.melee) {
      const job = this.sim.combat.melee;
      const windup = smoothstep(job.elapsed / job.hitTime);
      const strike = smoothstep((job.elapsed - job.hitTime + 0.06) / 0.12);
      const recover = smoothstep(
        (job.elapsed - job.hitTime - 0.1) /
          Math.max(0.1, job.duration - job.hitTime - 0.1),
      );
      this.root.rotation.x += (-0.28 * windup + strike * 0.83) * (1 - recover);
      this.root.rotation.y += (0.3 * windup - strike * 0.75) * (1 - recover);
      this.root.position.z +=
        (strike * 0.13 - windup * (1 - strike) * 0.07) * (1 - recover);
    }
    if (this.inspectTime > 0 && !settings.reducedMotion) {
      const t = Math.sin((this.inspectTime / 2.2) * Math.PI);
      this.root.rotation.y += t * 0.75;
      this.root.rotation.z -= t * 0.35;
    }
  }
  dispose() {
    this.arms?.dispose();
    this.external?.dispose();
    this.weaponAssets.dispose();
    this.root.dispose(false);
  }
}
