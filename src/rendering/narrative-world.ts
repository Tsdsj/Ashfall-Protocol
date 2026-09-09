import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Simulation } from "../simulation/simulation";
import type { Interaction } from "../core/types";
import { NARRATIVE_INTERACTIONS, type SequenceCueEvent } from "../narrative";
import { FACILITY, facilityOrigin } from "../world/facility";
import { storyShelfPose } from "../world/story-geometry";
import { ModelBatch } from "./geometry";
import type { MaterialFactory } from "./materials";
import type { LightingManager } from "./environment";
import type { CharacterAssetLibrary, AnimatedRig } from "./animated-assets";
import { damp, dampAngle } from "../core/motion";

export class NarrativeWorldRenderer {
  private facility: TransformNode;
  private lift: TransformNode;
  private facilityDoors = new Map<string, Mesh>();
  private props = new Map<string, { root: TransformNode; meshes: Mesh[] }>();
  private npcs = new Map<string, AnimatedRig>();
  private lights = new Map<
    string,
    { light: PointLight; target: number; life: number }
  >();
  private fallenShelf: TransformNode | null = null;
  private liftOffset = 0;
  private clock = 0;
  private timer = 0;
  constructor(
    private scene: Scene,
    private mats: MaterialFactory,
    private sim: Simulation,
    private assets: CharacterAssetLibrary,
    private lighting: LightingManager,
    private sign: (a: string, b?: string, c?: string, d?: string) => Material,
  ) {
    this.facility = new TransformNode("research-basement", scene);
    const p = facilityOrigin(sim.gen);
    this.facility.position.set(p.x, p.y, p.z);
    const batch = new ModelBatch(scene, "facility"),
      wall = mats.surface("metal", "#8b9b91"),
      metal = mats.surface("metal", "#a3aaa4"),
      dark = mats.surface("plastic", "#535b58");
    wall.metallic = 0.12;
    wall.roughness = 0.88;
    batch.box(
      "floor",
      [11, 0.3, 16.5],
      [0, -0.15, 2.75],
      mats.surface("stone", "#6e7976"),
    );
    batch.box("ceiling", [11, 0.3, 16.5], [0, 3.5, 2.75], wall);
    batch.box("north", [11, 3.4, 0.3], [0, 1.7, 11], wall);
    batch.box("south", [11, 3.4, 0.3], [0, 1.7, -5.5], wall);
    for (let x = -5; x <= 5; x++)
      batch.box("floor-joint", [0.015, 0.006, 16.2], [x, 0.006, 2.75], dark);
    for (let z = -5; z <= 11; z++)
      batch.box("floor-joint", [10.6, 0.006, 0.015], [0, 0.007, z], dark);
    for (const side of [-1, 1]) {
      batch.box("side", [0.3, 3.4, 16.5], [side * 5.4, 1.7, 2.75], wall);
      batch.box(
        "wall-band",
        [0.04, 0.22, 16.1],
        [side * 5.22, 1.2, 2.75],
        mats.simple("facility-band", "#3e5d54"),
      );
      for (let z = -5; z < 11; z += 1.5)
        batch.box(
          "panel-joint",
          [0.04, 3.2, 0.025],
          [side * 5.22, 1.7, z],
          dark,
        );
      batch.box(
        "vault-partition",
        [4.3, 3.4, 0.18],
        [side * 3.3, 1.7, 5],
        wall,
      );
      for (let z = -4; z < 11; z += 2) {
        batch.cylinder("pipe", 2, 0.09, [side * 5.05, 2.95, z], metal, [
          Math.PI / 2,
          0,
          0,
        ]);
        batch.box(
          "pipe-bracket",
          [0.24, 0.17, 0.05],
          [side * 5.05, 2.95, z + 0.8],
          dark,
        );
      }
      for (const z of [7.2, 9.5]) {
        batch.beveledBox(
          "adaptation-chamber",
          [1.2, 2.4, 1.7],
          [side * 3.7, 1.2, z],
          metal,
        );
        batch.box(
          "inspection-glass",
          [0.92, 1.6, 0.035],
          [side * 3.7, 1.35, z - 0.87],
          mats.simple("chamber-glass", "#253a35", 0.08),
        );
        batch.box(
          "human-outline",
          [0.25, 1.25, 0.025],
          [side * 3.7, 1.35, z - 0.897],
          mats.simple("specimen-shadow", "#18201d"),
        );
        batch.box(
          "serial",
          [0.78, 0.15, 0.015],
          [side * 3.7, 0.28, z - 0.88],
          sign(
            "R-07 / " + (side > 0 ? "18" : "12"),
            "受试者 · 请保留姓名",
            "#d2d8ca",
            "#36423e",
          ),
        );
      }
    }
    for (let z = -4; z < 10; z += 3) {
      batch.box("ceiling-fixture", [1.8, 0.1, 0.16], [0, 3.27, z], metal);
      batch.box(
        "strip",
        [1.7, 0.025, 0.14],
        [0, 3.21, z],
        mats.simple("facility-strip", "#a7c3b6", 2),
      );
    }
    batch.box(
      "orientation",
      [2.8, 0.6, 0.03],
      [0, 2.5, 4.88],
      sign("第七研究站", "R-07 / 适应性观察区", "#c4d4c9", "#283f3b"),
    );
    batch.box(
      "district-map",
      [2.2, 1.1, 0.03],
      [-3.3, 2.1, -5.32],
      sign("26 / 0", "已登记受试者 / 获准撤离", "#becabd", "#34453e"),
    );
    for (const [id, z] of [
      ["facility-lift", -4.8],
      ["facility-vault", 5],
    ] as const) {
      const leaf = batch.box(id, [2.3, 2.7, 0.1], [0, 1.35, z], metal);
      batch.take(leaf);
      leaf.setPivotPoint(new Vector3(-1.15, 0, 0));
      leaf.parent = this.facility;
      leaf.unfreezeWorldMatrix();
      this.facilityDoors.set(id, leaf);
      lighting.addCaster(leaf);
    }
    this.lift = new TransformNode("facility-lift-platform", scene);
    this.lift.parent = this.facility;
    this.lift.position.z = -3;
    const lb = new ModelBatch(scene, "lift");
    lb.box("platform", [2.6, 0.12, 2.6], [0, 0.04, 0], metal);
    for (const side of [-1, 1])
      lb.box("rail", [0.05, 0.95, 2.6], [side * 1.25, 0.6, 0], metal);
    lb.finish(this.lift);
    for (const m of batch.finish(this.facility)) {
      m.isPickable = true;
      lighting.addCaster(m);
    }
    this.facility.setEnabled(false);
    this.createShelf();
  }
  update(dt: number, focus: Vector3) {
    this.clock += dt;
    this.timer -= dt;
    const origin = facilityOrigin(this.sim.gen),
      near = Math.hypot(focus.x - origin.x, focus.z - origin.z) < 170;
    this.facility.setEnabled(near);
    for (const [id, mesh] of this.facilityDoors) {
      const data = this.sim.doors.get(id);
      if (data) mesh.rotation.y = data.progress * 1.48;
    }
    this.liftOffset = damp(this.liftOffset, 0, 2.3, dt);
    this.lift.position.y = this.liftOffset;
    if (near && !this.lights.has("facility-ambient")) {
      const light = new PointLight(
        "facility-ambient",
        new Vector3(origin.x, origin.y + 2.65, origin.z + 1),
        this.scene,
      );
      light.diffuse = Color3.FromHexString("#98b2aa");
      light.range = 18;
      light.intensity = 2.2;
      this.lights.set("facility-ambient", {
        light,
        target: 2.2,
        life: Infinity,
      });
    }
    for (const [id, item] of this.lights) {
      if (item.life !== Infinity) item.life -= dt;
      item.light.intensity = damp(
        item.light.intensity,
        item.life <= 0 ? 0 : item.target,
        5,
        dt,
      );
      if (id === "facility-ambient") item.light.setEnabled(near);
      if (item.life <= 0 && item.light.intensity < 0.01) {
        item.light.dispose();
        this.lights.delete(id);
      }
    }
    if (this.fallenShelf) {
      this.updateShelf();
    }
    for (const rig of this.npcs.values()) {
      const p = this.sim.state.player.position,
        nearby =
          Math.hypot(p.x - rig.root.position.x, p.z - rig.root.position.z) < 5;
      rig.animator.sample(
        [
          {
            clip: nearby ? "Idle_Talking_Loop" : "Idle_Loop",
            phase: this.clock / 3,
            weight: 1,
          },
        ],
        dt,
      );
      if (nearby)
        rig.root.rotation.y = dampAngle(
          rig.root.rotation.y,
          Math.atan2(p.x - rig.root.position.x, p.z - rig.root.position.z),
          5,
          dt,
        );
    }
    if (this.timer > 0) return;
    this.timer = 0.4;
    const wanted = new Set<string>(),
      npcWanted = new Set<string>();
    const active = new Set(this.sim.narrative.interactions().map((i) => i.id));
    for (const definition of NARRATIVE_INTERACTIONS) {
      if (definition.kind === "choice") continue;
      const pos = this.sim.narrative.resolveAnchor(definition.anchor);
      if (Math.hypot(pos.x - focus.x, pos.z - focus.z) > 125) continue;
      if (definition.kind === "npc") {
        const name = definition.npc!;
        if (name === "米拉") continue;
        npcWanted.add(name);
        let rig = this.npcs.get(name);
        if (!rig) {
          const female = ["许禾", "陈娅", "许弥", "乔榆"].includes(name);
          rig =
            this.assets.instantiate(
              "npc:" + name,
              female ? "female" : "male",
              "high",
              "npc",
            ) ?? undefined;
          if (!rig) continue;
          this.npcs.set(name, rig);
          rig.root.position.set(pos.x, pos.y, pos.z);
          for (const m of rig.meshes) {
            m.metadata = {
              interaction: {
                id: "conversation:" + name,
                type: "npc",
                name,
                position: { ...pos, y: pos.y + 1.3 },
              },
            };
            this.lighting.addCaster(m);
          }
        }
        continue;
      }
      wanted.add(definition.id);
      if (!this.props.has(definition.id)) {
        const root = new TransformNode(
          "narrative:" + definition.id,
          this.scene,
        );
        root.position.set(pos.x, pos.y, pos.z);
        const b = new ModelBatch(this.scene, definition.id),
          metal = this.mats.surface("metal", "#818f88");
        if (definition.kind === "shelter") {
          b.box(
            "bedroll",
            [0.85, 0.12, 1.6],
            [0, 0.08, 0],
            this.mats.surface("cloth", "#8d936e"),
          );
          b.box(
            "safety-card",
            [0.5, 0.25, 0.03],
            [0, 0.32, 0],
            this.sign("安全点", "先检查附近威胁"),
          );
        } else if (definition.kind === "supplies") {
          b.box(
            "food-crate",
            [0.7, 0.46, 0.6],
            [0, 0.25, 0],
            this.mats.surface("wood"),
          );
          b.box(
            "label",
            [0.5, 0.19, 0.025],
            [0, 0.3, -0.32],
            this.sign("留下的补给", "食物 / 饮水"),
          );
        } else if (definition.kind === "lift") {
          b.box("lift-post", [0.15, 1.3, 0.15], [0.45, 0.65, 0], metal);
          b.box("lift-control", [0.5, 0.4, 0.2], [0.45, 1.2, 0], metal);
          b.box(
            "lift-display",
            [0.44, 0.28, 0.015],
            [0.45, 1.22, -0.11],
            this.sign(
              definition.id === "facility-enter" ? "↓ -8 m" : "↑ 地面",
              "升降平台",
              "#b9d6b4",
              "#233a32",
            ),
          );
        } else {
          b.box("terminal-base", [0.8, 0.85, 0.48], [0, 0.43, 0], metal);
          b.beveledBox(
            "terminal",
            [0.82, 0.44, 0.18],
            [0, 1.03, 0.05],
            metal,
            [-0.16, 0, 0],
          );
          b.box(
            "terminal-screen",
            [0.73, 0.33, 0.02],
            [0, 1.06, -0.055],
            this.sign(
              definition.kind === "radio"
                ? "07.03 MHz"
                : definition.title.slice(0, 9),
              definition.kind === "radio"
                ? "接收机 / 紧急频段"
                : "原始记录 / 按 E 操作",
              "#b6c9b0",
              "#1e332d",
            ),
            [-0.16, 0, 0],
          );
          b.box(
            "keyboard",
            [0.63, 0.03, 0.22],
            [0, 0.86, -0.18],
            this.mats.surface("plastic"),
          );
        }
        const meshes = b.finish(root);
        for (const m of meshes) {
          m.isPickable = true;
          this.lighting.addCaster(m);
        }
        this.props.set(definition.id, { root, meshes });
      }
      const item = this.props.get(definition.id)!;
      const it = this.sim.narrative
        .interactions()
        .find((i) => i.id === "narrative:" + definition.id);
      for (const m of item.meshes)
        m.metadata =
          active.has("narrative:" + definition.id) && it
            ? {
                interaction: {
                  ...it,
                  position: {
                    ...pos,
                    y: pos.y + (definition.kind === "shelter" ? 0.3 : 1),
                  },
                },
              }
            : null;
    }
    for (const [id, item] of this.props)
      if (!wanted.has(id)) {
        item.meshes.forEach((m) => this.lighting.removeCaster(m));
        item.root.dispose(false);
        this.props.delete(id);
      }
    for (const [id, rig] of this.npcs)
      if (!npcWanted.has(id)) {
        rig.meshes.forEach((m) => this.lighting.removeCaster(m));
        rig.dispose();
        this.npcs.delete(id);
      }
  }
  target(origin: Vector3, direction: Vector3): Interaction | null {
    let best: Interaction | null = null,
      alignment = Infinity;
    for (const interaction of this.sim.narrative.interactions()) {
      if (interaction.id.includes("choice-")) continue;
      const position = {
        ...interaction.position,
        y:
          interaction.position.y +
          (interaction.id.includes("shelter") ? 0.3 : 1.2),
      };
      const delta = new Vector3(
          position.x - origin.x,
          position.y - origin.y,
          position.z - origin.z,
        ),
        along = Vector3.Dot(delta, direction);
      const off = delta.subtract(direction.scale(along)).length(),
        score = off / Math.max(0.65, along);
      if (
        along < 0.65 ||
        along > 3.5 ||
        off > 0.58 ||
        score > alignment ||
        !this.sim.collision.visible(origin, position)
      )
        continue;
      best =
        interaction.type === "npc"
          ? {
              ...interaction,
              id:
                "conversation:" +
                NARRATIVE_INTERACTIONS.find(
                  (d) => "narrative:" + d.id === interaction.id,
                )!.npc,
              position,
            }
          : { ...interaction, position };
      alignment = score;
    }
    return best;
  }
  cue(event: SequenceCueEvent): boolean {
    const cue = event.payload;
    if (cue.type === "lighting") {
      const position = this.sim.narrative.resolveAnchor(
        cue.anchor ?? { poiId: "lab-0", offset: { x: 0, y: -5.5, z: 0 } },
      );
      let item = this.lights.get(cue.target);
      if (!item) {
        const light = new PointLight(
          "sequence-light:" + cue.target,
          new Vector3(position.x, position.y, position.z),
          this.scene,
        );
        light.range = 16;
        item = { light, target: 0, life: Infinity };
        this.lights.set(cue.target, item);
      }
      item.light.diffuse = Color3.FromHexString(cue.color);
      item.target = cue.intensity * 4;
      item.life = event.requiresAck ? Infinity : Math.max(1, cue.duration);
      return true;
    }
    if (cue.type === "animation") {
      if (cue.animation === "lift-down")
        this.liftOffset =
          event.skipped || event.replay
            ? 0
            : Math.min(2, FACILITY.height - 0.5);
      if (cue.animation === "lift-up")
        this.liftOffset = event.skipped || event.replay ? 0 : -1;
      if (cue.animation === "shelf-fall") {
        this.updateShelf();
      }
      return true;
    }
    return false;
  }
  private createShelf() {
    const pos = this.sim.narrative.resolveAnchor({
      poiId: "pine-3",
      offset: { x: -5, y: 0, z: 1 },
    });
    const root = new TransformNode("fallen-supermarket-shelf", this.scene);
    root.position.set(pos.x, pos.y, pos.z);
    const b = new ModelBatch(this.scene, "falling-shelf"),
      metal = this.mats.surface("rust");
    for (const side of [-1, 1])
      b.box("upright", [0.07, 2, 0.07], [side * 0.7, 1, 0], metal);
    for (let n = 0; n < 4; n++) {
      b.box("shelf", [1.5, 0.045, 0.5], [0, 0.2 + n * 0.5, 0], metal);
      b.box(
        "remaining-carton",
        [0.25, 0.25, 0.25],
        [n % 2 ? 0.4 : -0.4, 0.34 + n * 0.5, 0],
        this.mats.surface("wood"),
      );
    }
    for (const m of b.finish(root)) {
      m.unfreezeWorldMatrix();
      this.lighting.addCaster(m);
    }
    this.fallenShelf = root;
    this.updateShelf();
  }
  private updateShelf() {
    if (!this.fallenShelf) return;
    const pose = storyShelfPose(this.sim.gen, this.sim.state);
    this.fallenShelf.position.set(
      pose.position.x,
      pose.position.y,
      pose.position.z,
    );
    this.fallenShelf.rotation.set(pose.angle, 0, 0);
  }
  dispose() {
    for (const rig of this.npcs.values()) rig.dispose();
    for (const item of this.lights.values()) item.light.dispose();
    for (const item of this.props.values()) item.root.dispose(false);
    this.fallenShelf?.dispose(false);
    this.facility.dispose(false);
  }
}
