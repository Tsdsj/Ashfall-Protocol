import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { type Mesh } from "@babylonjs/core/Meshes/mesh";
import { type Scene } from "@babylonjs/core/scene";
import { ModelBatch } from "./geometry";
import type { MaterialFactory } from "./materials";
import type { StructureData, VehicleData } from "../core/types";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { STAIRS } from "../world/building-geometry";
export function structureModel(
  scene: Scene,
  mats: MaterialFactory,
  b: StructureData,
): { root: TransformNode; meshes: Mesh[]; door?: Mesh; lid?: Mesh } {
  const root = new TransformNode(b.id, scene),
    batch = new ModelBatch(scene, b.id),
    wood = mats.surface("wood"),
    metal = mats.surface("metal"),
    cloth = mats.surface("cloth");
  let door: Mesh | undefined;
  let lid: Mesh | undefined;
  switch (b.kind) {
    case "foundation":
    case "floor": {
      batch.box("floor", [4, 0.2, 4], [0, 0.1, 0], wood);
      for (const side of [-1, 1])
        batch.box("brace", [0.15, 0.35, 4], [side * 1.7, -0.05, 0], wood);
      break;
    }
    case "wall":
    case "window": {
      if (b.kind === "wall") batch.box("wall", [4, 3, 0.16], [0, 1.5, 0], wood);
      else {
        batch.box("bottom", [4, 1, 0.16], [0, 0.5, 0], wood);
        batch.box("top", [4, 0.6, 0.16], [0, 2.7, 0], wood);
        for (const side of [-1, 1])
          batch.box("side", [1, 1.4, 0.16], [side * 1.5, 1.7, 0], wood);
      }
      for (const side of [-1, 1])
        batch.box("post", [0.18, 3.1, 0.22], [side * 1.9, 1.5, 0], wood);
      break;
    }
    case "door":
    case "gate": {
      for (const side of [-1, 1])
        batch.box("frame", [0.2, 2.8, 0.24], [side * 1.3, 1.4, 0], wood);
      batch.box("header", [2.8, 0.18, 0.24], [0, 2.8, 0], wood);
      for (const side of [-1, 1])
        batch.box("side-wall", [0.7, 2.8, 0.18], [side * 1.65, 1.4, 0], wood);
      door = batch.box("door", [2.4, 2.6, 0.1], [0, 1.3, 0], wood);
      batch.take(door);
      door.setPivotPoint(new Vector3(-1.2, 0, 0));
      door.parent = root;
      batch.box("lock", [0.12, 0.07, 0.07], [0.8, 1.3, -0.08], metal);
      break;
    }
    case "roof": {
      batch.box("roof", [4.35, 0.16, 4.35], [0, 3.12, 0], wood, [0.08, 0, 0]);
      for (const side of [-1, 1])
        batch.box(
          "rafter",
          [0.16, 0.25, 4.35],
          [side * 1.7, 3, 0],
          wood,
          [0.08, 0, 0],
        );
      break;
    }
    case "stairs":
      for (let n = 0; n < STAIRS.steps; n++)
        batch.box(
          "step",
          [
            STAIRS.width,
            ((n + 1) / STAIRS.steps) * STAIRS.rise,
            STAIRS.run / STAIRS.steps,
          ],
          [
            0,
            (((n + 1) / STAIRS.steps) * STAIRS.rise) / 2,
            -STAIRS.run / 2 + ((n + 0.5) / STAIRS.steps) * STAIRS.run,
          ],
          wood,
        );
      break;
    case "fence":
      for (let n = 0; n < 9; n++)
        batch.box("picket", [0.2, 1.5, 0.12], [-1.8 + n * 0.45, 0.75, 0], wood);
      for (const h of [0.4, 1.1])
        batch.box("rail", [4, 0.12, 0.14], [0, h, 0.08], wood);
      break;
    case "storage": {
      batch.box("bottom", [1.4, 0.06, 0.85], [0, 0.04, 0], wood);
      for (const side of [-1, 1]) {
        batch.box("side", [0.065, 0.78, 0.85], [side * 0.668, 0.42, 0], wood);
        batch.box("end", [1.4, 0.78, 0.065], [0, 0.42, side * 0.392], wood);
      }
      lid = batch.box("chest-lid", [1.4, 0.08, 0.85], [0, 0.85, 0], wood);
      batch.take(lid);
      lid.setPivotPoint(new Vector3(0, 0, 0.425));
      lid.parent = root;
      lid.metadata = { lidAxis: "x" };
      for (const side of [-1, 1])
        batch.box("band", [0.08, 0.9, 0.89], [side * 0.43, 0.43, 0], metal);
      batch.box("lock", [0.12, 0.17, 0.08], [0, 0.55, -0.46], metal);
      break;
    }
    case "workbench": {
      batch.box("top", [2.3, 0.18, 1], [0, 0.94, 0], wood);
      for (const x of [-0.9, 0.9])
        for (const z of [-0.35, 0.35])
          batch.box("leg", [0.12, 0.9, 0.12], [x, 0.45, z], wood);
      batch.box("vice", [0.34, 0.26, 0.3], [0.65, 1.13, 0.1], metal);
      batch.cylinder("vice-handle", 0.42, 0.03, [0.85, 1.05, -0.1], metal, [
        Math.PI / 2,
        0,
        0,
      ]);
      batch.box(
        "tool",
        [0.08, 0.04, 0.38],
        [-0.5, 1.05, 0.1],
        metal,
        [0, 0.4, 0],
      );
      break;
    }
    case "bed": {
      batch.box("roll", [1.05, 0.15, 2.05], [0, 0.1, 0], cloth);
      batch.cylinder("pillow", 0.85, 0.3, [0, 0.23, 0.74], cloth, [
        0,
        0,
        Math.PI / 2,
      ]);
      break;
    }
    case "campfire": {
      for (let n = 0; n < 12; n++) {
        const a = (n / 12) * 6.28;
        batch.sphere(
          "stone",
          [0.3, 0.23, 0.25],
          [Math.sin(a) * 0.62, 0.09, Math.cos(a) * 0.62],
          mats.surface("stone"),
          6,
        );
      }
      for (let n = 0; n < 5; n++) {
        const a = (n / 5) * 6.28;
        batch.cylinder(
          "log",
          0.9,
          0.15,
          [Math.sin(a) * 0.14, 0.16, Math.cos(a) * 0.14],
          mats.surface("bark"),
          [Math.PI / 2, 0, a],
        );
      }
      batch.sphere(
        "embers",
        [0.75, 0.04, 0.75],
        [0, 0.16, 0],
        mats.simple("coal", "#b83915", b.active ? 2 : 0),
      );
      break;
    }
    case "generator": {
      batch.box(
        "engine",
        [1, 0.64, 0.65],
        [0, 0.47, 0],
        mats.surface("metal", "#b9a375"),
      );
      batch.box("tank", [0.8, 0.21, 0.55], [0, 0.89, 0], mats.surface("rust"));
      for (const x of [-0.57, 0.57])
        for (const z of [-0.39, 0.39])
          batch.cylinder("frame", 1, 0.05, [x, 0.5, z], metal);
      batch.cylinder("exhaust", 0.35, 0.055, [0.45, 0.95, 0.3], metal);
      for (let n = 0; n < 7; n++)
        batch.box(
          "vent",
          [0.68, 0.025, 0.015],
          [0, 0.35 + n * 0.06, -0.334],
          mats.simple("vent", "#1c2722"),
        );
      break;
    }
    case "light": {
      batch.cylinder("pole", 2.7, 0.06, [0, 1.35, 0], metal);
      batch.box(
        "lamp",
        [0.5, 0.16, 0.3],
        [0, 2.7, 0],
        mats.simple("lamp-casing", "#999c8e"),
      );
      batch.box(
        "lens",
        [0.42, 0.025, 0.24],
        [0, 2.6, 0],
        mats.simple("lamp-lit", "#ece3b6", b.active ? 3 : 0),
      );
      break;
    }
    case "fridge": {
      batch.box(
        "body",
        [0.8, 1.55, 0.8],
        [0, 0.8, 0],
        mats.surface("metal", "#cccec2"),
      );
      lid = batch.box(
        "fridge-door",
        [0.79, 1.5, 0.055],
        [0, 0.8, -0.435],
        mats.surface("metal", "#b4c4bb"),
      );
      batch.take(lid);
      lid.parent = root;
      lid.setPivotPoint(new Vector3(-0.39, 0, 0));
      lid.metadata = { lidAxis: "y" };
      const handle = batch.box(
        "handle",
        [0.05, 0.4, 0.07],
        [0.24, 0.2, -0.06],
        metal,
      );
      batch.take(handle);
      handle.parent = lid;
      break;
    }
    case "planter": {
      batch.box("soil", [1.8, 0.3, 1.2], [0, 0.2, 0], mats.surface("soil"));
      for (const z of [-0.65, 0.65])
        batch.box("rim", [2, 0.5, 0.1], [0, 0.25, z], wood);
      for (const x of [-0.95, 0.95])
        batch.box("rim", [0.1, 0.5, 1.3], [x, 0.25, 0], wood);
      if (b.growth > 0)
        for (let n = 0; n < 5; n++) {
          const h = 0.15 + b.growth * 0.005;
          batch.sphere(
            "plant",
            [0.2, h, 0.2],
            [-0.65 + n * 0.32, 0.35 + h / 2, 0],
            mats.simple("crop", "#627c3c"),
            6,
          );
        }
      break;
    }
    case "raincollector": {
      batch.cylinder(
        "barrel",
        1.1,
        0.82,
        [0, 0.55, 0],
        mats.surface("plastic", "#aac7c0"),
      );
      batch.cylinder("funnel", 0.25, 0.4, [0, 1.2, 0], metal, [0, 0, 0], 1.2);
      break;
    }
    case "wire":
      batch.box("junction", [0.3, 0.4, 0.15], [0, 0.3, 0], metal);
      break;
  }
  const meshes = [
    ...batch.finish(root),
    ...(door ? [door] : []),
    ...(lid ? [lid, ...(lid.getChildMeshes() as Mesh[])] : []),
  ];
  for (const m of meshes) {
    m.unfreezeWorldMatrix();
    m.metadata = {
      ...m.metadata,
      interaction: {
        id: b.id,
        type: "structure",
        name: b.kind,
        position: b.position,
      },
    };
  }
  root.position.set(b.position.x, b.position.y, b.position.z);
  root.rotation.y = b.rotation;
  return { root, meshes, door, lid };
}
export function vehicleModel(
  scene: Scene,
  mats: MaterialFactory,
  v: VehicleData,
): {
  root: TransformNode;
  meshes: Mesh[];
  wheels: TransformNode[];
  doors: TransformNode[];
  paint: PBRMaterial;
} {
  const root = new TransformNode(v.id, scene),
    batch = new ModelBatch(scene, v.id),
    basePaint = mats.surface(
      "metal",
      v.kind === "pickup" ? "#9bafa4" : "#a8a99a",
    ),
    paint = new PBRMaterial(v.id + ":paint", scene),
    black = mats.surface("plastic"),
    metal = mats.surface("metal"),
    glass = mats.simple("vehicle-glass", "#486359", 0, 0.56);
  const wheels: TransformNode[] = [];
  paint.albedoColor = basePaint.albedoColor.clone();
  paint.metallic = basePaint.metallic;
  paint.roughness = basePaint.roughness;
  paint.albedoTexture = basePaint.albedoTexture;
  paint.bumpTexture = basePaint.bumpTexture;
  paint.metallicTexture = basePaint.metallicTexture;
  paint.useRoughnessFromMetallicTextureAlpha = false;
  paint.useRoughnessFromMetallicTextureGreen = true;
  paint.useMetallnessFromMetallicTextureBlue = true;
  paint.useAmbientOcclusionFromMetallicTextureRed = true;
  root.onDisposeObservable.add(() => paint.dispose(false, false));
  paint.clearCoat.isEnabled = true;
  paint.clearCoat.intensity = 0;
  paint.clearCoat.roughness = 0.16;
  const doors: TransformNode[] = [],
    movingMeshes: Mesh[] = [];
  batch.box("chassis", [1.9, 0.28, 4.5], [0, 0.58, 0], mats.surface("rust"));
  batch.box("hood", [1.86, 0.42, 1.2], [0, 0.99, 1.3], paint);
  batch.box("grille", [1.5, 0.24, 0.07], [0, 0.83, 1.94], black);
  for (let n = 0; n < 7; n++)
    batch.box(
      "grille-rail",
      [0.055, 0.2, 0.03],
      [-0.6 + n * 0.2, 0.83, 1.99],
      metal,
    );
  batch.box("bumper", [2, 0.16, 0.2], [0, 0.54, 2.13], metal);
  batch.box("cab-roof", [1.8, 0.12, 1.52], [0, 1.94, 0.18], paint);
  batch.box("cab-floor", [1.85, 0.35, 1.6], [0, 0.85, 0.15], paint);
  batch.box(
    "windshield",
    [1.62, 0.73, 0.035],
    [0, 1.5, 0.92],
    glass,
    [0.15, 0, 0],
  );
  batch.box("rear-window", [1.6, 0.6, 0.04], [0, 1.5, -0.63], glass);
  for (const side of [-1, 1]) {
    const hinge = new TransformNode(v.id + ":vehicle-door:" + side, scene);
    hinge.parent = root;
    hinge.position.set(side * 0.92, 0, 0.9);
    doors.push(hinge);
    const db = new ModelBatch(scene, v.id + ":door:" + side);
    db.box("door", [0.09, 0.58, 1.4], [0, 1.02, -0.7], paint);
    db.box(
      "side-window",
      [0.035, 0.6, 1.19],
      [-side * 0.02, 1.61, -0.7],
      glass,
    );
    for (const z of [-0.54, 0.88])
      batch.box("pillar", [0.11, 0.92, 0.1], [side * 0.87, 1.48, z], paint, [
        z > 0 ? 0.15 : 0,
        0,
        0,
      ]);
    db.box("mirror", [0.18, 0.15, 0.24], [side * 0.2, 1.4, -0.15], paint);
    db.box("handle", [0.025, 0.05, 0.15], [side * 0.065, 1.19, -1.08], metal);
    movingMeshes.push(...db.finish(hinge));
    batch.box(
      "lamp",
      [0.38, 0.2, 0.06],
      [side * 0.68, 0.99, 1.93],
      mats.simple("headlamp", "#dcd9b7", 0.3),
    );
    batch.box(
      "tail-light",
      [0.18, 0.28, 0.06],
      [side * 0.78, 0.99, -2.17],
      mats.simple("tail-light", "#a64228", 0.15),
    );
    batch.box("rear-rail", [0.12, 0.7, 1.4], [side * 0.92, 0.95, -1.47], paint);
  }
  batch.box("bed", [1.8, 0.14, 1.45], [0, 0.76, -1.45], black);
  batch.box("tailgate", [1.9, 0.7, 0.12], [0, 0.98, -2.14], paint);
  if (v.kind === "suv") {
    batch.box("rear-roof", [1.8, 0.12, 1.7], [0, 1.94, -1.43], paint);
    for (const side of [-1, 1])
      batch.box("rear-glass", [0.05, 0.8, 1.5], [side * 0.9, 1.5, -1.4], glass);
    batch.box("back-window", [1.65, 0.75, 0.04], [0, 1.52, -2.2], glass);
  }
  for (const side of [-1, 1])
    for (const z of [-1.42, 1.28]) {
      const wheel = new TransformNode(v.id + ":wheel", scene);
      wheel.parent = root;
      wheel.position.set(side * 0.99, 0.45, z);
      const b = new ModelBatch(scene, "wheel");
      b.cylinder(
        "tire",
        0.28,
        0.84,
        [0, 0, 0],
        black,
        [0, 0, Math.PI / 2],
        undefined,
        20,
      );
      b.cylinder(
        "rim",
        0.3,
        0.47,
        [0, 0, 0],
        metal,
        [0, 0, Math.PI / 2],
        undefined,
        12,
      );
      for (let n = 0; n < 6; n++)
        b.box("rim-spoke", [0.32, 0.05, 0.35], [0, 0, 0], metal, [
          (n / 6) * Math.PI,
          0,
          0,
        ]);
      const ms = b.finish(wheel);
      for (const m of ms) m.unfreezeWorldMatrix();
      movingMeshes.push(...ms);
      wheels.push(wheel);
    }
  for (const side of [-1, 1]) {
    batch.box(
      "seat",
      [0.65, 0.25, 0.7],
      [side * 0.4, 1.05, 0.04],
      mats.surface("cloth"),
    );
    batch.box(
      "seatback",
      [0.65, 0.7, 0.18],
      [side * 0.4, 1.48, -0.35],
      mats.surface("cloth"),
    );
  }
  batch.box("dashboard", [1.6, 0.22, 0.35], [0, 1.32, 0.55], black);
  const meshes = [...batch.finish(root), ...movingMeshes];
  for (const m of meshes) {
    m.unfreezeWorldMatrix();
    m.metadata = {
      interaction: {
        id: v.id,
        type: "vehicle",
        name: v.kind === "pickup" ? "林务皮卡" : "灰谷越野车",
        position: v.position,
      },
    };
  }
  root.position.set(v.position.x, v.position.y, v.position.z);
  root.rotation.y = v.yaw;
  return { root, meshes, wheels, doors, paint };
}
