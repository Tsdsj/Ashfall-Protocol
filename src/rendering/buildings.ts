import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { type Scene } from "@babylonjs/core/scene";
import type { POI, Interaction } from "../core/types";
import { random } from "../core/random";
import { ModelBatch } from "./geometry";
import type { MaterialFactory } from "./materials";
import type { Simulation } from "../simulation/simulation";
import { vehicleModel } from "./objects";
import { OPENING_WRECK } from "./environment-props";
export interface SceneInteractable {
  mesh: Mesh;
  interaction: Interaction;
}
export class BuildingLibrary {
  private signs = new Map<string, PBRMaterial>();
  private details = new Map<string, PBRMaterial>();
  constructor(
    private scene: Scene,
    private mats: MaterialFactory,
  ) {}
  createOpeningWreck(parent: TransformNode, batch: ModelBatch): Mesh[] {
    const { position, yaw, roll, luggage } = OPENING_WRECK;
    const vehicle = vehicleModel(this.scene, this.mats, {
      id: "opening-evacuation-truck",
      kind: "pickup",
      position,
      yaw,
      speed: 0,
      fuel: 0,
      health: 0,
      battery: 0,
      tires: 0,
      engine: 0,
      inventory: { width: 1, height: 1, items: [] },
    });
    vehicle.root.parent = parent;
    vehicle.root.rotation.z = roll;
    const shell = new ModelBatch(this.scene, "opening-civilian-transport"),
      paint = this.mats.surface("metal", "#a4aea0"),
      metal = this.mats.surface("rust", "#8b8e79"),
      canvas = this.mats.surface("cloth", "#969c83"),
      rubber = this.mats.simple("wreck-interior", "#27342c");
    shell.beveledBox(
      "extended-chassis",
      [2.12, 0.25, 4.2],
      [0, 0.56, -3.42],
      metal,
    );
    shell.box(
      "empty-passenger-floor",
      [2.15, 0.13, 4.65],
      [0, 0.88, -3.17],
      rubber,
    );
    shell.beveledBox(
      "canvas-roof",
      [2.25, 0.15, 4.7],
      [0, 2.83, -3.16],
      canvas,
      [0.025, 0, 0.045],
    );
    for (const side of [-1, 1]) {
      shell.box(
        "lower-transport-side",
        [0.11, 0.7, 4.62],
        [side * 1.08, 1.29, -3.17],
        paint,
      );
      shell.box(
        "upper-canvas-band",
        [0.085, 0.24, 4.7],
        [side * 1.08, 2.69, -3.16],
        canvas,
      );
      for (let row = 0; row < 5; row++) {
        const z = -1.05 - row * 1.08;
        shell.box(
          "window-frame",
          [0.085, 1.18, 0.09],
          [side * 1.08, 2.04, z],
          paint,
        );
        if (row < 4 && row !== 1)
          shell.box(
            "torn-window-remnant",
            [0.025, 0.36, 0.71],
            [side * 1.087, 2.45, z - 0.52],
            this.mats.simple("shattered-transport-glass", "#6d857b", 0, 0.28),
            [row * 0.03, 0, 0],
          );
      }
      shell.box(
        "empty-bench-seat",
        [0.44, 0.14, 3.65],
        [side * 0.72, 1.19, -3.15],
        canvas,
      );
      shell.box(
        "empty-bench-back",
        [0.1, 0.47, 3.65],
        [side * 0.95, 1.49, -3.15],
        canvas,
        [0, 0, -side * 0.08],
      );
      for (let n = 0; n < 6; n++)
        shell.box(
          "bench-seat-seam",
          [0.45, 0.006, 0.012],
          [side * 0.72, 1.266, -1.57 - n * 0.61],
          metal,
        );
      for (const z of [-1.4, -3, -4.8])
        shell.pipe(
          "cargo-hoop",
          [side * 1.1, 0.9, z],
          [side * 1.1, 2.82, z],
          0.05,
          metal,
        );
      shell.box(
        "evacuation-side-label",
        [0.023, 0.43, 2.5],
        [side * 1.143, 1.33, -3.17],
        this.sign(
          "疏散转运",
          "GV-26 / CIVILIAN TRANSFER",
          "#293b30",
          "#bfc6b3",
        ),
      );
      shell.box(
        "transport-reflector",
        [0.025, 0.1, 0.25],
        [side * 1.15, 1.7, -5.35],
        this.mats.simple("old-reflector", "#c0a465", 0.15),
      );
      const rearWheel = vehicle.wheels[side < 0 ? 0 : 2]!.clone(
        "transport-extra-axle:" + side,
        vehicle.root,
      )!;
      rearWheel.position.set(side * 1.05, 0.45, -4.42);
    }
    shell.box("rear-exit-jamb", [2.2, 0.15, 0.12], [0, 0.98, -5.52], metal);
    shell.box(
      "rear-door-displaced",
      [0.85, 1.67, 0.07],
      [0.78, 1.79, -5.6],
      paint,
      [0, 0.98, 0],
    );
    shell.box(
      "rear-exit-sign",
      [1.2, 0.27, 0.02],
      [0, 2.69, -5.55],
      this.sign("应急出口", "EMERGENCY RELEASE", "#c5ccae", "#3b5847"),
    );
    for (const z of [-1.4, -3, -4.8])
      shell.pipe(
        "canvas-hoop-roof",
        [-1.1, 2.82, z],
        [1.1, 2.82, z],
        0.05,
        metal,
      );
    for (const mesh of shell.finish(vehicle.root)) mesh.unfreezeWorldMatrix();
    const meshes = vehicle.root
      .getChildMeshes()
      .filter((mesh): mesh is Mesh => mesh instanceof Mesh);
    for (const mesh of meshes) {
      mesh.metadata = { environmentStory: "opening-evacuation" };
      mesh.isPickable = true;
      mesh.receiveShadows = true;
    }
    const rng = random("opening-crash-detail");
    for (const side of [-1, 1])
      for (let n = 0; n < 13; n++) {
        const z = -35 + n * 0.82,
          x = -9.8 + side * 0.76 + Math.sin(n * 0.11) * 0.75;
        batch.box(
          "skidmark",
          [0.2, 0.008, 0.85],
          [x, 0.076, z],
          this.mats.simple("crash-rubber-skid", "#202720", 0, 0.65),
          [0, 0.12 + n * 0.01, 0],
        );
      }
    for (let n = 0; n < 55; n++)
      batch.cylinder(
        "fallen-safety-glass",
        0.006,
        0.025 + rng() * 0.09,
        [-13.1 + (rng() - 0.5) * 3, 0.087, -24.8 + rng() * 4.8],
        this.mats.simple("fallen-safety-glass", "#86a497", 0, 0.66),
        [0, rng() * 6.28, 0],
        undefined,
        3,
      );
    luggage.forEach((item, i) => {
      const mat = this.mats.surface(
        i === 1 ? "leather" : "cloth",
        i === 1 ? "#837a64" : "#77877d",
      );
      batch.beveledBox(
        "lost-luggage",
        [item.width, item.height, item.depth],
        [item.x, item.y, item.z],
        mat,
        [0, item.yaw, 0.07],
      );
      for (const side of [-1, 1])
        batch.box(
          "luggage-binding",
          [0.034, item.height + 0.014, item.depth + 0.018],
          [item.x + side * item.width * 0.31, item.y, item.z],
          rubber,
          [0, item.yaw, 0],
        );
      batch.box(
        "luggage-handle",
        [0.18, 0.05, 0.045],
        [item.x, item.y + item.height * 0.5 + 0.027, item.z],
        metal,
        [0, item.yaw, 0],
      );
      batch.box(
        "passenger-tag",
        [0.11, 0.004, 0.15],
        [item.x - 0.1, item.y + item.height * 0.5 + 0.018, item.z - 0.06],
        this.sign("26", "PASSENGER / GV", "#354536", "#b8baa0"),
        [0, item.yaw, 0],
      );
    });
    return meshes;
  }
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
    const palette =
      p.region === "city"
        ? ["#c4bba9", "#b3beb0", "#b9b2a1", "#aab6ae"]
        : ["#bbc4ad", "#aebbad", "#b8b9a7", "#a8b5ad"];
    const facade =
      palette[Math.floor(random(p.id + ":facade")() * palette.length)]!;
    const plaster = this.mats.surface(
      p.kind === "industrial" || p.kind === "warehouse" ? "brick" : "plaster",
      p.region === "fort" ? "#9eae95" : facade,
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
    const doorData = sim.doors.get(p.id)!;
    door.material = this.mats.surface(
      doorData.kind === "wood" ? "wood" : "metal",
      doorData.kind === "wood" ? "#6c8078" : "#76867c",
    );
    door.position.set(x - 0.94, y + 1.2, z - d);
    door.setPivotPoint(new Vector3(-0.94, 0, 0));
    door.position.x = x;
    const handle = MeshBuilder.CreateBox(
      p.id + ":door-handle",
      { width: 0.18, height: 0.032, depth: 0.045 },
      this.scene,
    );
    handle.material = metal;
    handle.parent = door;
    handle.position.set(0.63, 0, -0.095);
    handle.setPivotPoint(new Vector3(-0.08, 0, 0));
    door.metadata = { handle, baseY: y + 1.2 };
    dynamic.push(door);
    interactions.push({
      mesh: door,
      interaction: {
        id: p.id,
        type: "door",
        name:
          doorData.kind === "security"
            ? "研究站安全门"
            : doorData.kind === "wood"
              ? "木门"
              : "金属门",
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
    if (p.id !== "pine-3")
      for (let level = 0; level < 4; level++)
        batch.box(
          "shelf",
          [0.85, 0.09, d + 1],
          [shelfX, y + 0.4 + level * 0.55, z + 1],
          wood,
        );
    if (p.id !== "pine-3")
      for (const sz of [z - 1, z + d - 0.8])
        for (const sx of [shelfX - 0.3, shelfX + 0.3])
          batch.box(
            "shelf-upright",
            [0.07, 2.1, 0.07],
            [sx, y + 1.1, sz],
            metal,
          );
    // Table and chairs are photographed CC0 meshes, placed by the shared environment layout.
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
      else if (p.id !== "pine-3" && n % 3 === 0)
        batch.cylinder(
          "bottle",
          0.22,
          0.075,
          [shelfX, y + 0.57 + (n % 3) * 0.55, z - 1 + rng() * (d + 0.5)],
          this.mats.simple("bottle", "#65705b"),
        );
      else if (p.id !== "pine-3")
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
      const crateMaterial = this.mats.surface(
        n === 1 ? "metal" : "wood",
        n === 1 ? "#899781" : "#c2b194",
      );
      const crateWidth = n === 1 ? 1.05 : 0.9;
      const shell = new ModelBatch(this.scene, "container-shell:" + c.id);
      shell.box(
        "bottom",
        [crateWidth, 0.06, 0.7],
        [cp.x, cp.y - 0.28, cp.z],
        crateMaterial,
      );
      for (const side of [-1, 1]) {
        shell.box(
          "side",
          [0.055, 0.56, 0.7],
          [cp.x + side * (crateWidth / 2 - 0.025), cp.y, cp.z],
          crateMaterial,
        );
        shell.box(
          "end",
          [crateWidth, 0.56, 0.055],
          [cp.x, cp.y, cp.z + side * 0.325],
          crateMaterial,
        );
      }
      const container = shell.finish()[0]!;
      const lid = batch.box(
        "container-lid",
        [crateWidth, 0.065, 0.7],
        [cp.x, cp.y + 0.315, cp.z],
        crateMaterial,
      );
      batch.take(lid);
      lid.setPivotPoint(new Vector3(0, 0, 0.35));
      lid.metadata = { containerId: c.id };
      dynamic.push(lid);
      container.metadata = { lid };
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
    dynamic.push(...this.dressPOI(batch, p, y));
    return { meshes: dynamic, interactions, door };
  }
  private detailMaterial(
    kind: "paper" | "blood" | "grime" | "oil",
  ): PBRMaterial {
    const previous = this.details.get(kind);
    if (previous) return previous;
    const texture = new DynamicTexture(
      "surface-decal:" + kind,
      { width: 512, height: 512 },
      this.scene,
      true,
    );
    const c = texture.getContext() as CanvasRenderingContext2D,
      rng = random("greyvale-detail:" + kind);
    c.clearRect(0, 0, 512, 512);
    if (kind === "paper") {
      c.fillStyle = "#acae99";
      c.fillRect(18, 8, 464, 486);
      c.fillStyle = "#4b5950";
      c.font = "bold 27px sans-serif";
      c.fillText("GREYVALE / EVACUATION", 39, 56);
      c.fillStyle = "#763d32";
      c.fillRect(39, 80, 418, 8);
      c.font = "15px monospace";
      c.fillStyle = "#49584e";
      c.fillText("REGISTER  03  /  TRANSFER STATUS", 39, 116);
      for (let n = 0; n < 18; n++) {
        c.fillStyle = n % 5 === 0 ? "#798272" : "#687260";
        c.fillRect(39, 138 + n * 16, 150 + rng() * 260, 3);
      }
      c.strokeStyle = "#794a3d";
      c.lineWidth = 3;
      c.strokeRect(235, 411, 203, 48);
      c.font = "19px monospace";
      c.fillStyle = "#794a3d";
      c.fillText("NOT CLEARED", 256, 444);
    } else {
      const color =
        kind === "blood"
          ? "61,20,13"
          : kind === "oil"
            ? "12,18,15"
            : "42,48,35";
      for (let n = 0; n < 200; n++) {
        const x = 256 + (rng() - 0.5) * 400,
          y = kind === "grime" ? rng() * 512 : 256 + (rng() - 0.5) * 270,
          r = 5 + rng() * 74;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${color},${0.025 + rng() * 0.1})`);
        g.addColorStop(1, `rgba(${color},0)`);
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      if (kind === "blood")
        for (let n = 0; n < 34; n++) {
          c.fillStyle = `rgba(${color},${0.12 + rng() * 0.2})`;
          c.beginPath();
          c.ellipse(
            40 + rng() * 430,
            45 + rng() * 420,
            1 + rng() * 9,
            1 + rng() * 5,
            rng() * 6,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      if (kind === "grime")
        for (let n = 0; n < 25; n++) {
          c.fillStyle = `rgba(${color},.12)`;
          c.fillRect(rng() * 512, 0, 2 + rng() * 8, 80 + rng() * 420);
        }
    }
    texture.hasAlpha = true;
    texture.update();
    const material = new PBRMaterial("surface-decal:" + kind, this.scene);
    material.albedoTexture = texture;
    material.useAlphaFromAlbedoTexture = true;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.metallic = 0;
    material.roughness = kind === "oil" ? 0.38 : 1;
    material.zOffset = -1;
    this.details.set(kind, material);
    return material;
  }
  /** Architecture provides readable big shapes; retained objects explain how each room was abandoned. */
  private dressPOI(batch: ModelBatch, p: POI, y: number): Mesh[] {
    const { x, z } = p,
      w = p.width / 2,
      d = p.depth / 2,
      rng = random("room-story:" + p.id),
      dynamic: Mesh[] = [];
    const medical = ["medical", "lab"].includes(p.kind),
      industrial = ["industrial", "warehouse"].includes(p.kind),
      military = p.region === "fort";
    const metal = this.mats.surface("metal", "#929b91"),
      wood = this.mats.surface("wood", "#a6a48b");
    const dado = this.mats.surface(
      industrial ? "concrete" : "plaster",
      medical
        ? "#788f88"
        : military
          ? "#727c67"
          : p.region === "city"
            ? "#9b998b"
            : "#8c9180",
    );
    for (const side of [-1, 1]) {
      batch.box(
        "wall-base-course",
        [0.32, 0.43, p.depth],
        [x + side * w, y + 0.22, z],
        dado,
      );
      batch.box(
        "interior-skirting",
        [0.055, 0.13, p.depth - 0.25],
        [x + side * (w - 0.19), y + 0.16, z],
        wood,
      );
      batch.box(
        "painted-service-band",
        [0.015, 0.09, p.depth - 0.4],
        [x + side * (w - 0.17), y + 1.12, z],
        dado,
      );
      batch.box(
        "front-weathered-plinth",
        [w - 1, 0.45, 0.035],
        [x + (side * (w + 1)) / 2, y + 0.25, z - d - 0.18],
        dado,
      );
      const drainX = x + side * (w - 0.35),
        drainZ = z + d + 0.23;
      batch.pipe(
        "rainwater-pipe",
        [drainX, y + 0.15, drainZ],
        [drainX, y + 3.5, drainZ],
        0.08,
        metal,
      );
      for (const h of [0.5, 1.9, 3.2])
        batch.box(
          "drain-bracket",
          [0.16, 0.05, 0.1],
          [drainX, y + h, drainZ],
          metal,
        );
      for (let n = 0; n < 3; n++) {
        const plane = MeshBuilder.CreatePlane(
          "weather-runoff-decal",
          { width: 1.1, height: 2.9, sideOrientation: Mesh.DOUBLESIDE },
          this.scene,
        );
        plane.position.set(
          x + side * (w + 0.163),
          y + 1.6,
          z - d + 1.4 + (n * (p.depth - 2.8)) / 2,
        );
        plane.rotation.y = Math.PI / 2;
        plane.material = this.detailMaterial("grime");
        batch.meshes.push(plane);
      }
    }
    batch.box(
      "back-skirting",
      [p.width - 0.4, 0.13, 0.055],
      [x, y + 0.16, z + d - 0.19],
      wood,
    );
    batch.box(
      "back-lower-paint",
      [p.width - 0.4, 0.95, 0.025],
      [x, y + 0.55, z + d - 0.175],
      dado,
    );
    // Boarding has a clear cause: a forced window beside discarded evacuation supplies.
    const boardedZ = z + d * 0.46;
    for (let n = 0; n < (medical ? 1 : 3); n++)
      batch.box(
        "splintered-window-board",
        [0.11, 0.12, 2.38],
        [x - w - 0.2, y + 1.18 + n * 0.42, boardedZ],
        wood,
        [0, 0, (n - 1) * 0.07],
      );
    for (const dz of [-0.8, 0.8])
      for (const h of [1.2, 1.6, 2])
        batch.cylinder(
          "board-nail",
          0.014,
          0.018,
          [x - w - 0.265, y + h, boardedZ + dz],
          metal,
          [0, 0, Math.PI / 2],
          undefined,
          5,
        );
    // Flat documents and residue never add invisible navigation obstacles.
    for (let n = 0; n < 8; n++) {
      const page = MeshBuilder.CreatePlane(
        "evacuation-document",
        {
          width: 0.24 + rng() * 0.08,
          height: 0.32 + rng() * 0.05,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        this.scene,
      );
      page.position.set(
        x + (rng() - 0.5) * (p.width - 2),
        y + 0.092 + n * 0.0003,
        z + (rng() - 0.5) * (p.depth - 2),
      );
      page.rotation.set(Math.PI / 2, rng() * 6.28, 0);
      page.material = this.detailMaterial("paper");
      batch.meshes.push(page);
    }
    const residue = MeshBuilder.CreatePlane(
      "abandonment-residue",
      {
        width: medical ? 2.25 : 1.65,
        height: medical ? 2.9 : 1.4,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      this.scene,
    );
    residue.position.set(
      x + (medical ? 1.6 : w + 1.7),
      y + 0.095,
      z + (medical ? 2.3 : d - 2),
    );
    residue.rotation.set(Math.PI / 2, 0.4, 0);
    residue.material = this.detailMaterial(medical ? "blood" : "oil");
    batch.meshes.push(residue);
    for (let n = 0; n < 3; n++) {
      const shade = n % 2 ? "#a4ab96" : "#758577";
      batch.beveledBox(
        "supply-wrapped-pack",
        [0.24, 0.12, 0.18],
        [x - w + 0.72, y + 0.55 + n * 0.55, z + 0.15 + n * 0.8],
        this.mats.surface("cloth", shade),
        [0, rng() * 0.25, 0],
      );
      batch.box(
        "inventory-tag",
        [0.012, 0.06, 0.16],
        [x - w + 1.16, y + 0.43 + n * 0.55, z + 0.2],
        this.sign(
          medical ? "03 医疗" : industrial ? "维护" : "转运",
          "GREYVALE / STORES",
          "#4b574b",
          "#b5b6a0",
        ),
      );
    }
    if (medical) {
      for (const dx of [-0.83, 0.83])
        for (const dz of [-0.38, 0.38]) {
          batch.pipe(
            "gurney-leg",
            [x + 1 + dx, y + 0.15, z + 3 + dz],
            [x + 1 + dx, y + 0.49, z + 3 + dz],
            0.045,
            metal,
          );
          batch.cylinder(
            "gurney-caster",
            0.055,
            0.1,
            [x + 1 + dx, y + 0.15, z + 3 + dz],
            this.mats.simple("rubber-caster", "#29332d"),
            [Math.PI / 2, 0, 0],
            undefined,
            10,
          );
        }
      for (const dz of [-0.54, 0.54])
        batch.pipe(
          "bed-safety-rail",
          [x + 0.15, y + 0.94, z + 3 + dz],
          [x + 1.85, y + 0.94, z + 3 + dz],
          0.035,
          metal,
        );
      batch.beveledBox(
        "discarded-iv-bag",
        [0.13, 0.24, 0.045],
        [x + 2.36, y + 1.7, z + 3.6],
        this.mats.simple("iv-plastic", "#a0b5ad", 0, 0.65),
      );
      batch.pipe(
        "iv-line",
        [x + 2.36, y + 1.56, z + 3.6],
        [x + 1.7, y + 0.77, z + 3.45],
        0.008,
        this.mats.simple("iv-line", "#a3b1a4"),
      );
      for (let n = 0; n < 4; n++)
        batch.beveledBox(
          "discarded-dressing",
          [0.15, 0.012, 0.075],
          [x + 1.9 + rng() * 0.5, y + 0.104, z + 2 + rng() * 0.6],
          this.mats.surface("cloth", "#9e9a87"),
          [0, rng() * 6.28, 0],
        );
      batch.box(
        "triage-instructions",
        [1.3, 0.58, 0.016],
        [x - 1.5, y + 2.2, z + d - 0.19],
        this.sign("转运已停止", "DO NOT MOVE PATIENTS", "#704d42", "#c2c3ad"),
      );
    } else if (industrial || military) {
      batch.beveledBox(
        "electrical-distribution",
        [0.6, 0.85, 0.12],
        [x + 2.4, y + 1.7, z + d - 0.23],
        metal,
      );
      for (let row = 0; row < 3; row++)
        for (let n = 0; n < 4; n++)
          batch.box(
            "distribution-switch",
            [0.05, 0.09, 0.035],
            [x + 2.23 + n * 0.1, y + 1.43 + row * 0.18, z + d - 0.315],
            this.mats.simple("electrical-switch", "#293b31"),
          );
      batch.box(
        "lockout-warning",
        [1.3, 0.38, 0.02],
        [x - 0.5, y + 1.95, z + d - 0.18],
        this.sign(
          military ? "隔离检查" : "设备断电",
          military ? "CLEAN / HOLD / TRANSFER" : "LOCKOUT / DO NOT ENERGIZE",
          "#b8ac77",
          "#343e30",
        ),
      );
      batch.pipe(
        "service-pipe",
        [x + w - 0.35, y + 2.8, z - d + 1],
        [x + w - 0.35, y + 2.8, z + d - 1],
        0.12,
        this.mats.surface("rust"),
      );
      for (let k = 0; k < 3; k++)
        batch.box(
          "service-pipe-clamp",
          [0.1, 0.24, 0.07],
          [x + w - 0.35, y + 2.8, z - d + 1.5 + (k * (p.depth - 3)) / 2],
          metal,
        );
    } else {
      for (let n = 0; n < 3; n++) {
        batch.pipe(
          "coat-hook",
          [x - 2.6 + n * 0.23, y + 1.82, z + d - 0.19],
          [x - 2.6 + n * 0.23, y + 1.72, z + d - 0.34],
          0.018,
          metal,
        );
        if (n !== 1)
          batch.box(
            "left-behind-coat",
            [0.28, 0.62, 0.05],
            [x - 2.6 + n * 0.23, y + 1.43, z + d - 0.3],
            this.mats.surface("cloth", n ? "#777d6d" : "#828e81"),
            [0, 0, n ? 0.07 : -0.06],
          );
      }
      batch.cylinder(
        "abandoned-enamel-cup",
        0.1,
        0.09,
        [x + 3.65, y + 0.977, z + 2.12],
        this.mats.simple("enamel-cup", "#a6b3a6"),
        [0, 0, 0.05],
        0.085,
        14,
      );
      batch.cylinder(
        "cup-dark-interior",
        0.003,
        0.066,
        [x + 3.65, y + 1.029, z + 2.12],
        this.mats.simple("stale-tea", "#3b463a"),
        [0, 0, 0],
        undefined,
        14,
      );
      batch.beveledBox(
        "folded-bedroll",
        [0.5, 0.24, 0.73],
        [x + 0.15, y + 0.64, z + 3],
        this.mats.surface("cloth", "#6d7865"),
      );
      for (const offset of [-0.14, 0.14])
        batch.box(
          "bedroll-strap",
          [0.035, 0.26, 0.76],
          [x + 0.15 + offset, y + 0.64, z + 3],
          this.mats.surface("leather"),
        );
    }
    // One pendulum per room, bounded to near-camera updates; the hook is the actual pivot.
    const lightBatch = new ModelBatch(this.scene, p.id + ":suspended-fixture");
    lightBatch.pipe(
      "cord",
      [0, 0, 0],
      [0, -0.43, 0],
      0.012,
      this.mats.simple("lamp-cord", "#2c3730"),
    );
    lightBatch.cylinder(
      "shade",
      0.15,
      0.33,
      [0, -0.47, 0],
      metal,
      [0, 0, 0],
      0.1,
      12,
    );
    lightBatch.sphere(
      "bulb",
      [0.055, 0.08, 0.055],
      [0, -0.55, 0],
      this.mats.simple("old-light-bulb", "#a8a783", 0.15),
      8,
    );
    const lamps = lightBatch.finish(),
      phase = rng() * 6.28;
    for (const lamp of lamps) {
      lamp.unfreezeWorldMatrix();
      lamp.position.set(x - 1.2, y + 3.25, z + 0.15);
      lamp.metadata = { environmentMotion: "pendulum", phase, baseY: y + 3.25 };
      lamp.isPickable = false;
      dynamic.push(lamp);
    }
    return dynamic;
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
