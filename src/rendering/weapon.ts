import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { type Camera } from "@babylonjs/core/Cameras/camera";
import { type Mesh } from "@babylonjs/core/Meshes/mesh";
import { type Scene } from "@babylonjs/core/scene";
import { ModelBatch } from "./geometry";
import { ITEMS } from "../data/items";
import type { MaterialFactory } from "./materials";
import type { Simulation } from "../simulation/simulation";
import type { GameSettings } from "../core/types";
export class WeaponRenderer {
  readonly root: TransformNode;
  private model: TransformNode | null = null;
  private last = "";
  private swayX = 0;
  private swayY = 0;
  private shot = 0;
  private inspectTime = 0;
  private meshes: Mesh[] = [];
  private flash: Mesh | null = null;
  constructor(
    private scene: Scene,
    private mats: MaterialFactory,
    camera: Camera,
    private sim: Simulation,
  ) {
    this.root = new TransformNode("first-person-arms", scene);
    this.root.parent = camera;
    this.root.scaling.setAll(0.68);
  }
  private rebuild(id: string) {
    this.model?.dispose(false);
    this.flash = null;
    this.model = new TransformNode("held-" + id, this.scene);
    this.model.parent = this.root;
    const b = new ModelBatch(this.scene, "viewmodel"),
      steel = this.mats.surface("metal", "#8f9d95"),
      black = this.mats.surface("plastic"),
      wood = this.mats.surface("wood"),
      glove = this.mats.surface("cloth", "#8c9b86");
    const firearm = !!ITEMS[id]?.weapon?.ammo && id !== "bow",
      long = firearm && !["pistol", "pistol45"].includes(id);
    b.cylinder(
      "right-sleeve",
      0.65,
      0.18,
      [0.17, -0.31, -0.13],
      glove,
      [-0.48, 0, -0.18],
      0.16,
    );
    b.sphere("right-glove", [0.17, 0.22, 0.19], [0.095, -0.05, 0.13], glove);
    for (let n = 0; n < 4; n++)
      b.cylinder(
        "finger",
        0.13,
        0.024,
        [0.025 + n * 0.032, -0.015, 0.23],
        glove,
        [Math.PI / 2, 0, 0],
        0.022,
        6,
      );
    if (firearm) {
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
        b.cylinder(
          "left-sleeve",
          0.7,
          0.18,
          [-0.25, -0.24, 0.23],
          glove,
          [-1, 0, 0.4],
          0.14,
        );
        b.sphere("left-hand", [0.17, 0.13, 0.22], [-0.03, -0.02, 0.59], glove);
      }
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
      b.cylinder("handle", 0.7, 0.055, [0, 0.12, 0.26], wood, [-0.45, 0, 0]);
      b.beveledBox(
        "axe-head",
        [0.24, 0.19, 0.065],
        [-0.06, 0.42, 0.41],
        steel,
        [0, 0, -0.2],
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
        [0.055, 0.075, 0.17],
        [0, 0.06, 0.24],
        wood,
        [0, 0, 0.15],
      );
      b.beveledBox("knife-guard", [0.11, 0.025, 0.025], [0, 0.11, 0.32], steel);
      const blade = this.mats.simple("knife-blade", "#a3aaa3");
      blade.metallic = 0.85;
      blade.roughness = 0.3;
      b.beveledBox(
        "blade",
        [0.045, 0.009, 0.3],
        [0, 0.13, 0.48],
        blade,
        [0, -0.025, 0.15],
      );
      b.cylinder(
        "blade-tip",
        0.11,
        0.045,
        [0, 0.13, 0.685],
        blade,
        [Math.PI / 2, 0, 0.15],
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
    }
    this.meshes = b.finish(this.model);
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
    this.swayX += dx * 0.00003;
    this.swayY += dy * 0.00003;
  }
  update(
    dt: number,
    time: number,
    aiming: boolean,
    settings: GameSettings,
    visible: boolean,
  ) {
    const equipped = this.sim.combat.equipped(),
      id = equipped?.id ?? "knife",
      key = id + ":" + equipped?.attachments.join(",");
    if (key !== this.last) {
      this.last = key;
      this.rebuild(id);
    }
    this.root.setEnabled(
      visible &&
        !this.sim.state.player.vehicle &&
        !!equipped &&
        ["weapon", "tool"].includes(ITEMS[equipped.id]!.category),
    );
    this.shot = Math.max(0, this.shot - dt * 5);
    this.inspectTime = Math.max(0, this.inspectTime - dt);
    this.swayX *= Math.exp(-dt * 8);
    this.swayY *= Math.exp(-dt * 8);
    const bob = this.sim.moving && !aiming ? settings.headBob : 0;
    const reload =
      this.sim.combat.reloadRemaining > 0
        ? Math.sin(
            (this.sim.combat.reloadRemaining / this.sim.combat.reloadTotal) *
              Math.PI,
          )
        : 0;
    const baseX = aiming ? 0 : 0.23,
      baseY = aiming ? -0.142 : -0.26,
      baseZ = aiming ? 0.44 : 0.48;
    this.root.position.x +=
      (baseX +
        Math.sin(time * 5) * 0.01 * bob -
        this.swayX -
        this.root.position.x) *
      Math.min(1, dt * 14);
    this.root.position.y +=
      (baseY +
        Math.sin(time * 10) * 0.014 * bob -
        reload * 0.22 +
        this.swayY -
        this.root.position.y) *
      Math.min(1, dt * 14);
    this.root.position.z = baseZ - this.shot * 0.055;
    if (this.flash) this.flash.setEnabled(this.shot > 0.7);
    if (id === "torch")
      this.meshes
        .filter((m) => m.material?.name === "torch-flame")
        .forEach((m) => m.setEnabled((equipped?.durability ?? 0) > 0));
    const melee = !ITEMS[id]?.weapon?.ammo;
    this.root.rotation.x =
      reload * 0.7 +
      (melee ? Math.sin(this.shot * Math.PI) * 0.55 : -this.shot * 0.13);
    this.root.rotation.z = this.sim.sprinting ? 0.14 : 0;
    this.root.rotation.y = melee ? -Math.sin(this.shot * Math.PI) * 0.45 : 0;
    if (this.inspectTime > 0) {
      const t = Math.sin((this.inspectTime / 2.2) * Math.PI);
      this.root.rotation.y += t * 0.75;
      this.root.rotation.z -= t * 0.35;
    }
  }
}
