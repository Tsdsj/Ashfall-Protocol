import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { type Scene } from "@babylonjs/core/scene";
import type { POI, Interaction } from "../core/types";
import { random } from "../core/random";
import { ModelBatch } from "./geometry";
import type { MaterialFactory } from "./materials";
import type { Simulation } from "../simulation/simulation";
export interface SceneInteractable {
  mesh: Mesh;
  interaction: Interaction;
}
export class BuildingLibrary {
  private signs = new Map<string, PBRMaterial>();
  constructor(
    private scene: Scene,
    private mats: MaterialFactory,
  ) {}
  sign(
    text: string,
    subtext = "",
    color = "#d9d7b7",
    bg = "#23352e",
  ): PBRMaterial {
    const key = text + subtext;
    const existing = this.signs.get(key);
    if (existing) return existing;
    const texture = new DynamicTexture(
      key,
      { width: 1024, height: 256 },
      this.scene,
      true,
    );
    const c = texture.getContext() as CanvasRenderingContext2D;
    c.fillStyle = bg;
    c.fillRect(0, 0, 1024, 256);
    c.strokeStyle = color;
    c.lineWidth = 4;
    c.strokeRect(12, 12, 1000, 232);
    c.fillStyle = color;
    c.textAlign = "center";
    c.font = "600 90px sans-serif";
    c.fillText(text, 512, 130);
    c.font = "28px monospace";
    c.fillText(subtext, 512, 205);
    texture.update();
    const mat = new PBRMaterial(key, this.scene);
    mat.albedoTexture = texture;
    mat.roughness = 0.82;
    mat.metallic = 0.15;
    mat.emissiveColor.set(0.06, 0.07, 0.05);
    this.signs.set(key, mat);
    return mat;
  }
  createPOI(
    p: POI,
    sim: Simulation,
    batch: ModelBatch,
  ): { meshes: Mesh[]; interactions: SceneInteractable[]; door?: Mesh } {
    const x = p.x,
      z = p.z,
      y = sim.gen.poiHeight(p),
      w = p.width / 2,
      d = p.depth / 2;
    const rng = random(sim.state.seed + p.id);
    const interactions: SceneInteractable[] = [];
    const dynamic: Mesh[] = [];
    const concrete = this.mats.surface("concrete"),
      metal = this.mats.surface("metal"),
      wood = this.mats.surface("wood");
    const plaster = this.mats.surface(
      p.kind === "industrial" || p.kind === "warehouse" ? "brick" : "plaster",
      p.region === "fort"
        ? "#9eae95"
        : p.region === "city"
          ? "#c4bba9"
          : "#bbc4ad",
    );
    if (p.kind === "extraction") {
      for (let k = 0; k < 4; k++)
        batch.box(
          "landingmarker",
          [10, 0.03, 0.4],
          [x, y + 0.06, z - 4 + k * 2.5],
          this.mats.simple("landing paint", "#b7ab6e"),
        );
      const beacon = batch.cylinder(
        "beacon",
        1,
        0.12,
        [x + 6, y + 0.5, z],
        this.mats.simple("signal", "#dd6747", 1),
      );
      batch.take(beacon);
      dynamic.push(beacon);
      interactions.push({
        mesh: beacon,
        interaction: {
          id: p.id,
          type: "extraction",
          name: "接应信号",
          position: { x: x + 6, y: y + 0.8, z },
        },
      });
      return { meshes: dynamic, interactions };
    }
    batch.box(
      "foundation",
      [p.width + 0.5, 0.35, p.depth + 0.5],
      [x, y - 0.15, z],
      concrete,
    );
    batch.box(
      "interior-floor",
      [p.width, 0.08, p.depth],
      [x, y + 0.045, z],
      this.mats.surface("wood", "#c7c5ac"),
    );
    batch.box(
      "wall-back",
      [p.width, 3.45, 0.32],
      [x, y + 1.72, z + d],
      plaster,
    );
    for (const side of [-1, 1]) {
      const sx = x + side * w;
      batch.box("side-low", [0.3, 0.95, p.depth], [sx, y + 0.48, z], plaster);
      batch.box("side-high", [0.3, 0.85, p.depth], [sx, y + 3.04, z], plaster);
      const edgeWidth = d - d * 0.46 - 1.05,
        middleWidth = 2 * (d * 0.46 - 1.05);
      for (let n = 0; n < 3; n++)
        batch.box(
          "side-pier",
          [0.3, 1.68, n === 1 ? middleWidth : edgeWidth],
          [sx, y + 1.79, z + (n - 1) * (d - edgeWidth / 2)],
          plaster,
        );
      for (const wz of [z - d * 0.46, z + d * 0.46]) {
        const glass = batch.box(
          "glass",
          [0.055, 1.55, 2.1],
          [sx, y + 1.79, wz],
          this.mats.simple("dirtyglass", "#537165", 0, 0.37),
        );
        batch.take(glass);
        dynamic.push(glass);
        const id = p.id + ":glass:" + side + ":" + wz;
        interactions.push({
          mesh: glass,
          interaction: {
            id,
            type: "glass",
            name: "蒙尘玻璃",
            position: { x: sx, y: y + 1.7, z: wz },
          },
        });
        batch.box(
          "window-sill",
          [0.65, 0.13, 2.45],
          [sx, y + 0.95, wz],
          concrete,
        );
        batch.box(
          "window-mullion",
          [0.12, 1.7, 0.055],
          [sx + side * 0.18, y + 1.8, wz],
          wood,
        );
      }
      batch.box(
        "front",
        [w - 1, 3.45, 0.3],
        [x + (side * (w + 1)) / 2, y + 1.72, z - d],
        plaster,
      );
      batch.box(
        "corner-post",
        [0.22, 3.5, 0.3],
        [sx, y + 1.75, z - d - 0.08],
        wood,
      );
    }
    batch.box("lintel", [2, 1.05, 0.35], [x, y + 2.92, z - d], plaster);
    batch.box(
      "front-step",
      [3, 0.15, 1.25],
      [x, y + 0.075, z - d - 0.7],
      concrete,
    );
    const door = MeshBuilder.CreateBox(
      p.id + ":door",
      { width: 1.88, height: 2.4, depth: 0.13 },
      this.scene,
    );
    door.material = this.mats.surface("wood", "#6c8078");
    door.position.set(x - 0.94, y + 1.2, z - d);
    door.setPivotPoint(new Vector3(-0.94, 0, 0));
    door.position.x = x;
    dynamic.push(door);
    interactions.push({
      mesh: door,
      interaction: {
        id: p.id,
        type: "door",
        name: p.id === "lab-0" ? "研究站安全门" : "木门",
        position: { x, y: y + 1.2, z: z - d },
      },
    });
    batch.box(
      "door-header",
      [2.25, 0.15, 0.2],
      [x, y + 2.48, z - d - 0.08],
      wood,
    );
    batch.box(
      "interior-ceiling",
      [p.width, 0.12, p.depth],
      [x, y + 3.43, z],
      plaster,
    );
    const roofMat = this.mats.surface(
      "metal",
      p.region === "fort" ? "#a8ad93" : "#9ca6a0",
    );
    if (["lab", "office"].includes(p.kind) || p.region === "city") {
      batch.box(
        "flat-roof",
        [p.width + 1, 0.3, p.depth + 1],
        [x, y + 3.6, z],
        concrete,
      );
      for (let n = 0; n < 3; n++)
        batch.box(
          "roof-vent",
          [1, 0.7, 1.4],
          [x - w + 2 + n * 2.2, y + 4.1, z + 2],
          metal,
        );
    } else {
      const slope = 0.36,
        half = (d + 0.65) / Math.cos(slope);
      for (const side of [-1, 1]) {
        batch.box(
          "roof",
          [p.width + 1.2, 0.18, half],
          [
            x,
            y + 3.45 + ((d + 0.65) * Math.tan(slope)) / 2,
            z + (side * (d + 0.65)) / 2,
          ],
          roofMat,
          [side * slope, 0, 0],
        );
        for (let k = 0; k < p.width + 1; k++)
          batch.box(
            "roof-seam",
            [0.025, 0.06, half],
            [
              x - w - 0.4 + k,
              y + 3.52 + ((d + 0.65) * Math.tan(slope)) / 2,
              z + (side * (d + 0.65)) / 2,
            ],
            metal,
            [side * slope, 0, 0],
          );
      }
      batch.cylinder(
        "ridge",
        p.width + 1.3,
        0.14,
        [x, y + 3.45 + (d + 0.65) * Math.tan(slope), z],
        metal,
        [0, 0, Math.PI / 2],
      );
    }
    if (p.region === "city") {
      const floors = 2 + Math.floor(rng() * 3),
        glassMat = this.mats.simple("city-window", "#3e5750", 0, 0.65);
      for (let floor = 0; floor < floors; floor++) {
        const fy = y + 3.65 + floor * 3.1;
        batch.box(
          "upper-slab",
          [p.width + 0.3, 0.2, p.depth + 0.3],
          [x, fy, z],
          concrete,
        );
        for (const side of [-1, 1]) {
          batch.box(
            "upper-side",
            [0.3, 2.9, p.depth],
            [x + side * w, fy + 1.5, z],
            plaster,
          );
          batch.box(
            "upper-front-band",
            [p.width, 0.8, 0.3],
            [x, fy + 0.5, z + side * d],
            plaster,
          );
          for (let k = 0; k < 4; k++) {
            const px = x - w + 1.5 + (k * (p.width - 3)) / 3;
            batch.box(
              "upper-pier",
              [0.48, 2.9, 0.34],
              [px, fy + 1.5, z + side * d],
              concrete,
            );
            if (k < 3)
              batch.box(
                "upper-glass",
                [(p.width - 3) / 3 - 0.55, 1.55, 0.045],
                [px + (p.width - 3) / 6, fy + 1.8, z + side * (d + 0.04)],
                glassMat,
              );
          }
        }
      }
      batch.box(
        "city-roof",
        [p.width + 0.7, 0.22, p.depth + 0.7],
        [x, y + 3.65 + floors * 3.1, z],
        concrete,
      );
      batch.box(
        "rooftop-plant",
        [2.1, 1.1, 1.6],
        [x + 2, y + 4.2 + floors * 3.1, z + 2],
        metal,
      );
    }
    if (p.region === "fort") {
      for (let n = 0; n < 8; n++) {
        const fz = z - d + n * 2;
        batch.cylinder(
          "fence-post",
          2.6,
          0.06,
          [x + w + 6, y + 1.3, fz],
          metal,
        );
        for (const h of [0.7, 1.5, 2.2])
          batch.pipe(
            "security-wire",
            [x + w + 6, y + h, fz],
            [x + w + 6, y + h, fz + 2],
            0.014,
            metal,
          );
      }
    }
    batch.box(
      "fascia",
      [p.width + 1.2, 0.24, 0.2],
      [x, y + 3.45, z - d - 0.7],
      wood,
    );
    batch.box(
      "nameplate",
      [Math.min(p.width - 2, 7), 0.98, 0.12],
      [x, y + 3.04, z - d - 0.25],
      this.sign(
        p.name,
        p.region === "pine"
          ? "GREYVALE FORESTRY · SECTOR 03"
          : "GREYVALE · RESTRICTED AREA",
      ),
    );
    // Shelves, chairs, cupboards, fixtures, and small clutter remain after the loot is removed.
    const shelfX = x - w + 0.75;
    for (let level = 0; level < 4; level++)
      batch.box(
        "shelf",
        [0.85, 0.09, d + 1],
        [shelfX, y + 0.4 + level * 0.55, z + 1],
        wood,
      );
    for (const sz of [z - 1, z + d - 0.8])
      for (const sx of [shelfX - 0.3, shelfX + 0.3])
        batch.box("shelf-upright", [0.07, 2.1, 0.07], [sx, y + 1.1, sz], metal);
    batch.box("tabletop", [2.3, 0.12, 1.5], [x + 3, y + 0.86, z + 1.8], wood);
    for (const dx of [-0.9, 0.9])
      for (const dz of [-0.55, 0.55])
        batch.box(
          "tableleg",
          [0.12, 0.8, 0.12],
          [x + 3 + dx, y + 0.4, z + 1.8 + dz],
          metal,
        );
    for (let n = 0; n < 2; n++) {
      batch.box(
        "seat",
        [0.7, 0.12, 0.7],
        [x + 3 + n * 0.9, y + 0.44, z + 0.55],
        wood,
      );
      batch.box(
        "seatback",
        [0.7, 0.85, 0.08],
        [x + 3 + n * 0.9, y + 0.9, z + 0.2],
        wood,
      );
      for (const dx of [-0.26, 0.26])
        for (const dz of [-0.26, 0.26])
          batch.box(
            "chairleg",
            [0.055, 0.45, 0.055],
            [x + 3 + n * 0.9 + dx, y + 0.22, z + 0.55 + dz],
            metal,
          );
    }
    if (p.kind === "medical" || p.kind === "lab") {
      batch.box("bed-frame", [2.1, 0.2, 1.05], [x + 1, y + 0.5, z + 3], metal);
      batch.box(
        "mattress",
        [1.96, 0.2, 0.93],
        [x + 1, y + 0.69, z + 3],
        this.mats.surface("cloth", "#c8c9b7"),
      );
      batch.box(
        "pillow",
        [0.45, 0.13, 0.7],
        [x + 0.3, y + 0.86, z + 3],
        this.mats.surface("cloth", "#dedccd"),
      );
      batch.cylinder("IV-stand", 2, 0.04, [x + 2.4, y + 1, z + 3.6], metal);
      batch.box(
        "medicine-poster",
        [1.2, 1.45, 0.015],
        [x - 2, y + 2, z + d - 0.18],
        this.sign("医 疗", "TRIAGE / KEEP QUIET", "#ab6c60", "#c7c9b5"),
      );
    } else {
      batch.box("cot", [2.2, 0.23, 1.1], [x + 1, y + 0.35, z + 3], wood);
      batch.box(
        "blanket",
        [1.65, 0.16, 1.04],
        [x + 1.2, y + 0.55, z + 3],
        this.mats.surface("cloth", "#a8ac91"),
      );
      batch.box(
        "pillow",
        [0.5, 0.18, 0.85],
        [x + 0.2, y + 0.55, z + 3],
        this.mats.surface("cloth"),
      );
    }
    for (let n = 0; n < 26; n++) {
      const px = x + (rng() - 0.5) * (p.width - 2),
        pz = z + (rng() - 0.5) * (p.depth - 2);
      if (n % 4 === 0)
        batch.box(
          "paper",
          [0.2 + rng() * 0.3, 0.004, 0.25],
          [px, y + 0.1, pz],
          this.mats.simple("papers", "#b5b29b"),
          [0, rng() * 6.28, 0],
        );
      else if (n % 3 === 0)
        batch.cylinder(
          "bottle",
          0.22,
          0.075,
          [shelfX, y + 0.57 + (n % 3) * 0.55, z - 1 + rng() * (d + 0.5)],
          this.mats.simple("bottle", "#65705b"),
        );
      else
        batch.box(
          "books",
          [0.12 + rng() * 0.25, 0.18, 0.15],
          [shelfX, y + 0.55 + (n % 3) * 0.55, z - 1 + rng() * (d + 0.4)],
          this.mats.surface("cloth", n % 2 ? "#897869" : "#9d9f8b"),
        );
    }
    batch.box(
      "switch",
      [0.12, 0.2, 0.025],
      [x + 1.2, y + 1.4, z - d + 0.2],
      this.mats.simple("switch", "#959b8c"),
    );
    batch.box(
      "ceiling-lamp",
      [1.1, 0.06, 0.12],
      [x, y + 3.33, z],
      this.mats.simple("unlit-fixture", "#acb3a4"),
    );
    for (let n = 0; n < 3; n++) {
      const c = sim.state.containers[p.id + ":" + n];
      if (!c) continue;
      const cp = c.position;
      const container = batch.box(
        "container",
        [n === 1 ? 1.05 : 0.9, 0.62, 0.7],
        [cp.x, cp.y, cp.z],
        this.mats.surface(
          n === 1 ? "metal" : "wood",
          n === 1 ? "#899781" : "#c2b194",
        ),
      );
      batch.take(container);
      dynamic.push(container);
      interactions.push({
        mesh: container,
        interaction: {
          id: c.id,
          type: "container",
          name: c.name,
          position: { ...cp },
        },
      });
      for (const side of [-1, 1])
        batch.box(
          "crate-band",
          [0.045, 0.66, 0.73],
          [cp.x + side * 0.3, cp.y, cp.z],
          metal,
        );
      batch.box(
        "crate-label",
        [0.34, 0.16, 0.01],
        [cp.x, cp.y + 0.05, cp.z - 0.36],
        this.sign(n === 1 ? "AP" : "物资", n === 1 ? "SUPPLY" : "FIELD KIT"),
      );
    }
    if (p.story && p.id !== "broadcast") {
      const page = batch.box(
        "story-paper",
        [0.4, 0.02, 0.32],
        [x + 3, y + 0.945, z + 1.7],
        this.sign("记录", "FIELD LOG", "#333d34", "#c5c1a8"),
      );
      batch.take(page);
      dynamic.push(page);
      interactions.push({
        mesh: page,
        interaction: {
          id: p.story,
          type: "story",
          name: "遗留记录",
          position: { x: x + 3, y: y + 0.95, z: z + 1.7 },
        },
      });
    }
    if (p.id === "broadcast") {
      batch.box("transmitter", [2, 0.85, 0.65], [x, y + 1.4, z + 2], metal);
      const radio = batch.box(
        "radio",
        [0.8, 0.5, 0.16],
        [x, y + 1.5, z + 1.61],
        this.sign("7.03", "EMERGENCY BAND", "#bee9a0", "#16211b"),
      );
      batch.take(radio);
      dynamic.push(radio);
      interactions.push({
        mesh: radio,
        interaction: {
          id: "broadcast",
          type: "radio",
          name: "应急广播终端",
          position: { x, y: y + 1.5, z: z + 1.6 },
        },
      });
      this.tower(batch, x + 10, y, z + 3, 28);
    }
    if (p.id === "pine-0") {
      this.tower(batch, x + 11, y, z + 4, 17);
      batch.box(
        "notice",
        [1.5, 1.1, 0.04],
        [x + 3, y + 1.8, z - d - 0.18],
        this.sign("禁止通行", "CONTAINMENT ZONE", "#d6c696", "#6a392b"),
      );
    }
    if (p.kind === "industrial") {
      for (let n = 0; n < 3; n++)
        batch.cylinder(
          "tank",
          4.5,
          2.1,
          [x + w + 3, y + 2.3, z - d + 2 + n * 2.7],
          this.mats.surface("rust"),
        );
    }
    for (let n = 0; n < 4; n++) {
      const px = x - w - 1.5 + n * 1.4;
      batch.box(
        "debris",
        [0.5 + rng(), 0.15, 0.4],
        [px, y + 0.1, z - d - 1.5],
        concrete,
        [rng() * 0.2, rng() * 6, 0],
      );
    }
    return { meshes: dynamic, interactions, door };
  }
  tower(batch: ModelBatch, x: number, y: number, z: number, h: number) {
    const steel = this.mats.surface("rust", "#aba99b");
    for (const dx of [-1, 1])
      for (const dz of [-1, 1])
        batch.pipe(
          "tower-leg",
          [x + dx * 1.8, y, z + dz * 1.8],
          [x + dx * 0.5, y + h, z + dz * 0.5],
          0.15,
          steel,
        );
    for (let n = 0; n < h / 3; n++) {
      const v = n * 3,
        w = 1.8 - (v / h) * 1.3;
      for (const side of [-1, 1]) {
        batch.pipe(
          "brace",
          [x - w, y + v, z + side * w],
          [x + w - 0.15, y + v + 3, z + side * (w - 0.15)],
          0.06,
          steel,
        );
        batch.pipe(
          "brace",
          [x + w, y + v, z + side * w],
          [x - w + 0.15, y + v + 3, z + side * (w - 0.15)],
          0.06,
          steel,
        );
      }
    }
    batch.cylinder("antenna", 5, 0.06, [x, y + h + 2.5, z], steel);
    batch.sphere(
      "beacon",
      [0.25, 0.25, 0.25],
      [x, y + h + 5, z],
      this.mats.simple("beacon-red", "#db5847", 3),
    );
  }
}
