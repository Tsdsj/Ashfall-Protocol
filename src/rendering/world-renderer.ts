import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { scatterTrees } from "../world/scatter";
import { type Scene } from "@babylonjs/core/scene";
import { noise, random } from "../core/random";
import type { Interaction, Vec3, POI } from "../core/types";
import { WorldGenerator, REGIONS } from "../world/generator";
import { generateTerrainData } from "../world/terrain-data";
import { ModelBatch, terrainMesh } from "./geometry";
import { BuildingLibrary, type SceneInteractable } from "./buildings";
import { VegetationLibrary } from "./vegetation";
import {
  EnvironmentAssetLibrary,
  EnvironmentAtmosphere,
} from "./environment-assets";
import type { MaterialFactory } from "./materials";
import type { Simulation } from "../simulation/simulation";
import type { LightingManager } from "./environment";
import { environmentApproaches } from "./environment-props";
interface Chunk {
  root: TransformNode;
  meshes: Mesh[];
  interactions: SceneInteractable[];
  doors: Map<string, Mesh>;
  movingDetails: Mesh[];
}
export class WorldRenderer {
  openContainer = "";
  focus: Vec3 | null = null;
  readonly chunks = new Map<string, Chunk>();
  readonly buildings: BuildingLibrary;
  readonly vegetation: VegetationLibrary;
  readonly environmentAssets: EnvironmentAssetLibrary;
  private atmosphere: EnvironmentAtmosphere;
  private pending = new Map<string, Promise<void>>();
  private worker: Worker | null = null;
  private requests = new Map<
    string,
    {
      resolve: (data: ReturnType<typeof generateTerrainData>) => void;
      reject: () => void;
    }
  >();
  private disposed = false;
  private wanted = new Set<string>();
  private horizon: Mesh;
  private timer = 0;
  private birds: Mesh[] = [];
  private elapsed = 0;
  private destroyedCount = -1;
  private fallingTrees: {
    root: TransformNode;
    meshes: Mesh[];
    age: number;
    axis: Vector3;
    rotation: Quaternion;
  }[] = [];
  constructor(
    private scene: Scene,
    private mats: MaterialFactory,
    private sim: Simulation,
    private lighting: LightingManager,
    private density = 1,
  ) {
    this.buildings = new BuildingLibrary(scene, mats);
    this.environmentAssets = new EnvironmentAssetLibrary(scene);
    this.atmosphere = new EnvironmentAtmosphere(scene, mats);
    this.vegetation = new VegetationLibrary(
      scene,
      mats,
      this.environmentAssets,
    );
    this.birds = this.vegetation.distantBirds();
    try {
      this.worker = new Worker(
        new URL("../world/terrain-worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = (
        e: MessageEvent<
          ReturnType<typeof generateTerrainData> & { id: string }
        >,
      ) => {
        const request = this.requests.get(e.data.id);
        if (request) {
          request.resolve(e.data);
          this.requests.delete(e.data.id);
        }
      };
      this.worker.onerror = () => {
        for (const r of this.requests.values()) r.reject();
        this.requests.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
    const n = 96,
      positions = new Float32Array((n + 1) * (n + 1) * 3),
      indices = new Uint32Array(n * n * 6),
      uvs = new Float32Array((n + 1) * (n + 1) * 2);
    for (let z = 0; z <= n; z++)
      for (let x = 0; x <= n; x++) {
        const i = z * (n + 1) + x,
          wx = (x / n - 0.5) * 4600,
          wz = (z / n - 0.5) * 4600;
        positions.set([wx, this.sim.gen.height(wx, wz) - 1.2, wz], i * 3);
        uvs.set([wx / 15, wz / 15], i * 2);
      }
    let at = 0;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const a = z * (n + 1) + x;
        indices.set([a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2], at);
        at += 6;
      }
    this.horizon = terrainMesh(
      scene,
      "distant-terrain",
      positions,
      indices,
      uvs,
    );
    this.horizon.material = mats.surface("soil");
    this.horizon.isPickable = false;
    this.horizon.receiveShadows = false;
  }
  async initialize(): Promise<void> {
    await this.environmentAssets.preload(["pine-wood", "fern", "rocks"]);
    this.environmentAssets.updateFocus(
      this.focus ?? this.sim.state.player.position,
    );
    await this.stream(true);
  }
  private async terrain(cx: number, cz: number) {
    const id = cx + "," + cz;
    if (!this.worker) return generateTerrainData(this.sim.gen, cx, cz);
    try {
      return await new Promise<ReturnType<typeof generateTerrainData>>(
        (resolve, reject) => {
          this.requests.set(id, {
            resolve,
            reject: () => reject(new Error("worker failed")),
          });
          this.worker!.postMessage({ id, seed: this.sim.state.seed, cx, cz });
        },
      );
    } catch {
      return generateTerrainData(this.sim.gen, cx, cz);
    }
  }
  async stream(wait = false): Promise<void> {
    const p = this.focus ?? this.sim.state.player.position,
      cx = Math.floor(p.x / 256),
      cz = Math.floor(p.z / 256);
    const coords: [number, number][] = [];
    for (let z = cz - 1; z <= cz + 1; z++)
      for (let x = cx - 1; x <= cx + 1; x++) coords.push([x, z]);
    coords.sort(
      (a, b) =>
        Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz),
    );
    this.wanted = new Set(coords.map(([x, z]) => x + "," + z));
    for (const [id, chunk] of this.chunks)
      if (!this.wanted.has(id)) {
        for (const m of chunk.meshes) this.lighting.removeCaster(m);
        chunk.root.dispose(false);
        this.chunks.delete(id);
      }
    const tasks: Promise<void>[] = [];
    for (const [x, z] of coords) {
      const id = x + "," + z;
      if (this.chunks.has(id)) continue;
      let task = this.pending.get(id);
      if (!task) {
        task = this.load(x, z).finally(() => this.pending.delete(id));
        this.pending.set(id, task);
      }
      tasks.push(task);
    }
    if (wait) await Promise.all(tasks);
  }
  private async load(cx: number, cz: number): Promise<void> {
    const pois = this.sim.gen.pois.filter(
      (p) => Math.floor(p.x / 256) === cx && Math.floor(p.z / 256) === cz,
    );
    const id = cx + "," + cz,
      data = await this.terrain(cx, cz);
    await this.environmentAssets.preparePOIs(pois);
    if (this.disposed || !this.wanted.has(id)) return;
    // Broad cool-green ground variation supports the small vegetation layers;
    // the original yellow vertex multiplier made the whole settlement look paved in sand.
    for (let i = 0; i < data.positions.length / 3; i++) {
      const x = data.positions[i * 3]!,
        z = data.positions[i * 3 + 2]!;
      if (this.sim.gen.roadDistance(x, z) < 5.3) continue;
      const patch = noise(x / 18, z / 18, this.sim.gen.seedNumber + 93);
      const shade =
        0.7 + noise(x / 57, z / 57, this.sim.gen.seedNumber + 94) * 0.35;
      data.colors.set(
        [
          shade * (0.71 + patch * 0.2),
          shade * (0.92 + patch * 0.08),
          shade * (0.72 + patch * 0.13),
          1,
        ],
        i * 4,
      );
    }
    const root = new TransformNode("chunk:" + id, this.scene),
      terrain = terrainMesh(
        this.scene,
        "terrain:" + id,
        data.positions,
        data.indices,
        data.uvs,
        data.colors,
      );
    terrain.material = this.mats.surface("soil");
    terrain.parent = root;
    terrain.freezeWorldMatrix();
    const batch = new ModelBatch(this.scene, "chunk:" + id),
      meshes: Mesh[] = [terrain],
      interactions: SceneInteractable[] = [],
      doors = new Map<string, Mesh>();
    const vegetation = this.vegetation.buildChunk(
      this.sim.gen,
      cx,
      cz,
      this.density,
      new Set(this.sim.state.destroyed),
    );
    for (const m of vegetation) {
      m.parent = root;
      meshes.push(m);
    }
    for (const m of this.environmentAssets.buildPOIs(
      pois,
      (p) => this.sim.gen.poiHeight(p),
      "chunk:" + id,
    )) {
      m.parent = root;
      meshes.push(m);
    }
    for (const p of this.sim.gen.pois) {
      if (Math.floor(p.x / 256) !== cx || Math.floor(p.z / 256) !== cz)
        continue;
      const model = this.buildings.createPOI(p, this.sim, batch);
      for (const mesh of model.meshes) {
        mesh.parent = root;
        meshes.push(mesh);
      }
      interactions.push(...model.interactions);
      if (model.door) doors.set(p.id, model.door);
    }
    this.roads(batch, cx, cz);
    if (cx === -1 && cz === -1)
      meshes.push(...this.buildings.createOpeningWreck(root, batch));
    this.approaches(batch, pois);
    this.cityStreets(batch, cx, cz);
    this.resources(batch, cx, cz, interactions, meshes);
    for (const m of batch.finish(root)) meshes.push(m);
    for (const i of interactions) {
      i.mesh.parent = root;
      i.mesh.metadata = { ...i.mesh.metadata, interaction: i.interaction };
    }
    for (const m of meshes) {
      if (
        !m.name.includes("grass") &&
        !m.name.includes("fern") &&
        !m.name.includes("decal")
      )
        this.lighting.addCaster(m);
    }
    this.chunks.set(id, {
      root,
      meshes,
      interactions,
      doors,
      movingDetails: meshes.filter((mesh) => mesh.metadata?.environmentMotion),
    });
  }
  private approaches(batch: ModelBatch, pois: POI[]) {
    for (const path of environmentApproaches(this.sim.gen, pois)) {
      const dx = path.to[0] - path.from[0],
        dz = path.to[1] - path.from[1],
        length = Math.hypot(dx, dz);
      if (length < 0.5) continue;
      const steps = Math.max(2, Math.ceil(length / 1.5)),
        positions: number[] = [],
        uv: number[] = [],
        indices: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps,
          cx = path.from[0] + dx * t,
          cz = path.from[1] + dz * t;
        const width =
          path.width * (0.88 + noise(cx * 0.41, cz * 0.41, 61) * 0.16);
        for (const side of [-1, 1]) {
          const x = cx - (dz / length) * width * 0.5 * side,
            z = cz + (dx / length) * width * 0.5 * side;
          positions.push(x, this.sim.gen.height(x, z) + 0.064, z);
          uv.push(side < 0 ? 0 : 1, (t * length) / 1.4);
        }
        if (i < steps) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const mesh = terrainMesh(
        this.scene,
        "worn-yard-path",
        new Float32Array(positions),
        new Uint32Array(indices),
        new Float32Array(uv),
      );
      mesh.material = this.mats.surface("soil", "#a49f87");
      batch.meshes.push(mesh);
    }
  }
  private resources(
    batch: ModelBatch,
    cx: number,
    cz: number,
    interactions: SceneInteractable[],
    meshes: Mesh[],
  ) {
    const rng = random(this.sim.state.seed + ":resources:" + cx + "," + cz),
      gen = this.sim.gen;
    const data: { id: string; x: number; z: number; resource: string }[] = [];
    for (let n = 0; n < 18; n++) {
      const x = cx * 256 + rng() * 256,
        z = cz * 256 + rng() * 256;
      if (gen.isClearing(x, z)) continue;
      data.push({
        id: `resource:${cx},${cz}:${n}`,
        x,
        z,
        resource:
          n % 6 === 0
            ? "mushroom"
            : n % 4 === 0
              ? "stone"
              : n % 8 === 0
                ? "scrap"
                : gen.regionAt(x, z).id === "mine" && n % 3 === 0
                  ? "ore"
                  : "wood",
      });
    }
    if (cx === -1 && cz === -1)
      data.push(
        { id: "starter-wood", x: -5, z: -18, resource: "wood" },
        { id: "starter-stone", x: -2, z: -13, resource: "stone" },
        { id: "starter-wood2", x: -22, z: -16, resource: "wood" },
      );
    for (const r of data) {
      const y = gen.height(r.x, r.z);
      let mesh: Mesh;
      if (r.resource === "wood") {
        mesh = batch.cylinder(
          "fallen-log",
          2.4,
          0.38,
          [r.x, y + 0.17, r.z],
          this.mats.surface("bark"),
          [Math.PI / 2, 0, rng() * 1.2],
        );
        batch.cylinder(
          "cut-end",
          0.025,
          0.32,
          [r.x, y + 0.18, r.z + 1.2],
          this.mats.surface("wood"),
          [Math.PI / 2, 0, 0],
        );
      } else if (r.resource === "mushroom") {
        mesh = batch.sphere(
          "mushroom",
          [0.3, 0.13, 0.3],
          [r.x, y + 0.24, r.z],
          this.mats.surface("leather"),
        );
        batch.cylinder(
          "stem",
          0.2,
          0.055,
          [r.x, y + 0.1, r.z],
          this.mats.simple("mushroom-stem", "#b3ac91"),
        );
      } else {
        mesh = batch.sphere(
          "resource-rock",
          [0.8, 0.5, 0.7],
          [r.x, y + 0.16, r.z],
          this.mats.surface(r.resource === "scrap" ? "rust" : "stone"),
          8,
        );
      }
      batch.take(mesh);
      meshes.push(mesh);
      const name =
        {
          wood: "倒木 · 采集木材",
          stone: "松散石料",
          mushroom: "棕盖菇",
          ore: "铁矿露头",
          scrap: "遗弃金属",
        }[r.resource] ?? r.resource;
      interactions.push({
        mesh,
        interaction: {
          id: r.id,
          type: "resource",
          name,
          position: { x: r.x, y: y + 0.3, z: r.z },
          resource: r.resource,
        },
      });
    }
  }
  private cityStreets(batch: ModelBatch, cx: number, cz: number) {
    const region = REGIONS.find((r) => r.id === "city")!,
      rx = region.x,
      rz = region.z,
      level = this.sim.gen.baseHeight(rx, rz + 54),
      left = Math.max(cx * 256, rx - 98),
      right = Math.min((cx + 1) * 256, rx + 98),
      front = Math.max(cz * 256, rz - 26),
      back = Math.min((cz + 1) * 256, rz + 147);
    if (right <= left || back <= front) return;
    const concrete = this.mats.surface("stone", "#c2c8bd"),
      road = this.mats.surface("road"),
      metal = this.mats.surface("metal");
    const plaza = MeshBuilder.CreateGround(
      "city-pavement",
      { width: right - left, height: back - front },
      this.scene,
    );
    plaza.position.set((left + right) / 2, level + 0.025, (front + back) / 2);
    plaza.material = concrete;
    plaza.setVerticesData("uv", [
      0,
      0,
      (right - left) / 4,
      0,
      0,
      (back - front) / 4,
      (right - left) / 4,
      (back - front) / 4,
    ]);
    batch.meshes.push(plaza);
    for (let row = 0; row < 4; row++) {
      const z = rz + row * 46 - 17;
      if (z < front || z > back) continue;
      const streetMesh = batch.box(
        "city-road",
        [right - left, 0.035, 8],
        [(left + right) / 2, level + 0.055, z],
        road,
      );
      streetMesh.setVerticesData(
        "uv",
        streetMesh
          .getVerticesData("uv")!
          .map((v, i) => v * (i % 2 === 0 ? (right - left) / 8 : 1)),
      );
      for (const side of [-1, 1])
        batch.box(
          "sidewalk",
          [right - left, 0.1, 1.6],
          [(left + right) / 2, level + 0.075, z + side * 4.8],
          concrete,
        );
      for (let x = Math.ceil(left / 18) * 18; x < right; x += 18) {
        batch.box(
          "street-paint",
          [3, 0.008, 0.1],
          [x, level + 0.08, z],
          this.mats.simple("road-paint", "#b4ab71"),
        );
      }
      for (let x = rx - 76; x < rx + 90; x += 48)
        if (x > left && x < right) {
          batch.cylinder(
            "street-lamp",
            6,
            0.085,
            [x, level + 3, z + 5.2],
            metal,
          );
          batch.pipe(
            "street-lamp-arm",
            [x, level + 5.9, z + 5.2],
            [x, level + 6.15, z + 3.9],
            0.07,
            metal,
          );
          batch.box(
            "street-lamp-head",
            [0.45, 0.14, 0.65],
            [x, level + 6.1, z + 3.75],
            metal,
          );
          batch.cylinder(
            "rubbish-bin",
            0.85,
            0.55,
            [x + 1.2, level + 0.43, z + 5.1],
            this.mats.surface("rust"),
          );
        }
    }
    const x = rx + 23;
    if (x > left && x < right) {
      const avenueMesh = batch.box(
        "avenue",
        [8, 0.04, back - front],
        [x, level + 0.06, (front + back) / 2],
        road,
      );
      avenueMesh.setVerticesData(
        "uv",
        avenueMesh
          .getVerticesData("uv")!
          .map((v, i) => v * (i % 2 === 0 ? 1 : (back - front) / 8)),
      );
      for (const side of [-1, 1])
        batch.box(
          "avenue-sidewalk",
          [1.6, 0.11, back - front],
          [x + side * 4.8, level + 0.08, (front + back) / 2],
          concrete,
        );
    }
    for (let n = 0; n < 12; n++) {
      const x = left + ((right - left) * (n + 0.5)) / 12,
        z = front + ((back - front) * (((n * 7) % 12) + 0.5)) / 12;
      if (this.sim.gen.roadDistance(x, z) < 6) continue;
      batch.box(
        "urban-rubble",
        [0.3 + (n % 3) * 0.1, 0.12, 0.4],
        [x, level + 0.1, z],
        concrete,
        [0, n * 0.63, 0],
      );
    }
  }
  private roads(batch: ModelBatch, cx: number, cz: number) {
    const gen = this.sim.gen,
      concrete = this.mats.surface("concrete"),
      paint = this.mats.simple("road-paint", "#b4ab71"),
      metal = this.mats.surface("metal");
    const lay = (horizontal: boolean, fixed: number) => {
      const begin = horizontal ? cx * 256 : cz * 256;
      const vertices: number[] = [],
        indices: number[] = [],
        uv: number[] = [];
      for (let n = 0; n <= 32; n++) {
        const t = begin + n * 8;
        const center = horizontal ? fixed : -9 + Math.sin(t * 0.003) * 12;
        for (const side of [-1, 1]) {
          const x = horizontal ? t : center + side * 5,
            z = horizontal ? center + side * 5 : t;
          vertices.push(x, gen.height(x, z) + 0.045, z);
          uv.push(side === -1 ? 0 : 1, t / 12);
        }
        if (n < 32) {
          const i = n * 2;
          indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
        }
      }
      const road = terrainMesh(
        this.scene,
        "road",
        new Float32Array(vertices),
        new Uint32Array(indices),
        new Float32Array(uv),
      );
      road.material = this.mats.surface("road");
      batch.meshes.push(road);
      for (let n = 0; n < 16; n++) {
        const t = begin + n * 16 + 5,
          x = horizontal ? t : -9 + Math.sin(t * 0.003) * 12,
          z = horizontal ? fixed : t,
          y = gen.height(x, z);
        batch.box(
          "lane-paint",
          horizontal ? [4, 0.012, 0.1] : [0.1, 0.012, 4],
          [x, y + 0.065, z],
          paint,
        );
      }
    };
    const minX = cx * 256,
      maxX = minX + 256,
      minZ = cz * 256,
      maxZ = minZ + 256;
    if (minX < 4 && maxX > -24) {
      lay(false, 0);
      for (let n = 0; n < 4; n++) {
        const z = minZ + n * 64 + 22,
          x = -9 + Math.sin(z * 0.003) * 12 + 7.8;
        if (x < minX || x > maxX) continue;
        const y = gen.height(x, z);
        batch.cylinder(
          "utility-pole",
          9,
          0.22,
          [x, y + 4.5, z],
          this.mats.surface("bark"),
        );
        batch.box(
          "crossbeam",
          [2.3, 0.16, 0.18],
          [x, y + 8.25, z],
          this.mats.surface("wood"),
        );
        for (const side of [-1, 1]) {
          batch.cylinder(
            "insulator",
            0.22,
            0.1,
            [x + side * 0.85, y + 8.44, z],
            this.mats.simple("ceramic", "#8e9b8f"),
          );
          const path: Vector3[] = [];
          for (let k = 0; k <= 8; k++) {
            const pz = z + k * 8,
              py = y + 8.5 - Math.sin((k / 8) * Math.PI) * 1.4;
            path.push(new Vector3(x + side * 0.85, py, pz));
          }
          const cable = MeshBuilder.CreateTube(
            "cable",
            { path, radius: 0.017, tessellation: 4 },
            this.scene,
          );
          cable.material = metal;
          batch.meshes.push(cable);
        }
        if (Math.abs(z) < 190) {
          batch.cylinder(
            "lamp-post",
            5,
            0.075,
            [x - 1, y + 2.5, z - 15],
            metal,
          );
          batch.box(
            "lamp-shade",
            [0.6, 0.18, 0.3],
            [x - 1.25, y + 5, z - 15],
            metal,
          );
        }
      }
    }
    for (const z of [225, -420]) if (z >= minZ && z < maxZ) lay(true, z);
    if (cx === -1 && cz === -1) {
      for (let n = 0; n < 3; n++) {
        const x = -3 + n * 2.4,
          z = -7,
          y = gen.height(x, z);
        batch.box("barrier", [1.8, 0.68, 0.5], [x, y + 0.35, z], concrete);
        for (let k = 0; k < 4; k++)
          batch.box(
            "barrier-stripe",
            [0.16, 0.5, 0.012],
            [x - 0.65 + k * 0.4, y + 0.44, z - 0.258],
            paint,
            [0, 0, -0.25],
          );
      }
      batch.cylinder("signpole", 2.5, 0.07, [-17, 1.25, -7], metal);
      batch.box(
        "warning-sign",
        [2.1, 1.3, 0.08],
        [-17, 2.2, -7],
        this.buildings.sign(
          "封锁区",
          "CHECKPOINT 03 · KEEP OUT",
          "#d5c9a2",
          "#633c30",
        ),
      );
      batch.box(
        "abandoned-pack",
        [0.55, 0.28, 0.45],
        [-13.2, 0.15, -26.4],
        this.mats.surface("cloth"),
      );
      batch.box(
        "wreck-debris",
        [0.8, 0.04, 0.5],
        [-15, 0.06, -31],
        metal,
        [0.2, 0.5, 0],
      );
    }
  }
  update(dt: number) {
    if (this.destroyedCount !== this.sim.state.destroyed.length) {
      this.destroyedCount = this.sim.state.destroyed.length;
      this.environmentAssets.hideInstances(new Set(this.sim.state.destroyed));
    }
    for (let index = this.fallingTrees.length - 1; index >= 0; index--) {
      const tree = this.fallingTrees[index]!;
      tree.age += dt;
      const progress = Math.min(1, tree.age / 1.15);
      tree.root.rotationQuaternion = Quaternion.RotationAxis(
        tree.axis,
        Math.pow(progress, 1.8) * 1.48,
      ).multiply(tree.rotation);
      for (const mesh of tree.meshes)
        mesh.visibility = Math.max(0, Math.min(1, (1.6 - tree.age) / 0.35));
      if (tree.age >= 1.6) {
        tree.meshes.forEach((mesh) => this.lighting.removeCaster(mesh));
        tree.root.dispose(false);
        this.fallingTrees.splice(index, 1);
      }
    }
    this.elapsed += dt;
    const pos = this.focus ?? this.sim.state.player.position;
    this.atmosphere.update(
      dt,
      pos,
      this.sim.gen,
      ["rain", "storm"].includes(this.sim.state.weather),
    );
    this.birds.forEach((bird, n) => {
      const a = this.elapsed * 0.045 + n * 0.06;
      bird.position.set(
        pos.x + Math.sin(a) * 65 + n * 1.2,
        pos.y + 35 + n * 0.6,
        pos.z + Math.cos(a) * 65,
      );
      bird.rotation.z = Math.sin(this.elapsed * 5 + n) * 0.12;
      bird.rotation.y = a + Math.PI / 2;
    });
    this.timer -= dt;
    for (const chunk of this.chunks.values())
      for (const { mesh, interaction } of chunk.interactions) {
        if (interaction.type !== "container") continue;
        const lid = mesh.metadata?.lid as Mesh | undefined;
        if (!lid) continue;
        const pending = this.sim.actions.pending,
          container = this.sim.state.containers[interaction.id];
        const searching =
          pending?.kind === "search" &&
          pending.target &&
          container &&
          Math.hypot(
            pending.target.x - container.position.x,
            pending.target.z - container.position.z,
          ) < 0.1;
        const progress = searching
          ? Math.min(1, (1 - pending.remaining / pending.total) * 2)
          : this.openContainer === interaction.id
            ? 1
            : 0;
        lid.rotation.x +=
          (progress * 1.35 - lid.rotation.x) * (1 - Math.exp(-dt * 11));
      }
    for (const chunk of this.chunks.values())
      for (const mesh of chunk.movingDetails) {
        const near =
          Math.hypot(mesh.position.x - pos.x, mesh.position.z - pos.z) < 55;
        mesh.setEnabled(near);
        if (near) {
          mesh.rotation.z =
            Math.sin(this.elapsed * 0.83 + mesh.metadata.phase) * 0.023;
          mesh.rotation.x =
            Math.sin(this.elapsed * 0.59 + mesh.metadata.phase) * 0.012;
        }
      }
    for (const chunk of this.chunks.values())
      for (const [id, mesh] of chunk.doors) {
        const door = this.sim.doors.get(id);
        if (!door) continue;
        const rattle = Math.sin(this.elapsed * 55) * door.rattle * 0.025;
        mesh.rotation.y = -door.progress * Math.PI * 0.52 + rattle;
        const broken = door.status === "broken";
        mesh.rotation.x +=
          ((broken ? 1.48 : 0) - mesh.rotation.x) * Math.min(1, dt * 9);
        mesh.position.y +=
          (mesh.metadata.baseY - (broken ? 1.06 : 0) - mesh.position.y) *
          Math.min(1, dt * 9);
        const handle = mesh.metadata.handle as Mesh;
        if (handle)
          handle.rotation.z =
            -Math.sin(
              Math.min(1, (this.sim.state.elapsed - door.startedAt) / 0.3) *
                Math.PI,
            ) * 0.55;
      }
    if (this.timer <= 0) {
      this.timer = 0.6;
      this.environmentAssets.updateFocus(pos);
      void this.stream();
      for (const chunk of this.chunks.values()) {
        for (const { mesh, interaction } of chunk.interactions)
          if (interaction.type === "resource" || interaction.type === "glass")
            mesh.setEnabled(!this.sim.state.destroyed.includes(interaction.id));
      }
    }
  }
  get stats() {
    return {
      loaded: this.chunks.size,
      pending: this.pending.size,
      environment: this.environmentAssets.stats,
    };
  }
  fellTree(id: string, position: Vec3) {
    this.environmentAssets.hideInstances(new Set(this.sim.state.destroyed));
    this.destroyedCount = this.sim.state.destroyed.length;
    const tree = scatterTrees(
      this.sim.gen,
      Math.floor(position.x / 256),
      Math.floor(position.z / 256),
    ).find((t) => t.id === id);
    if (!tree) return;
    const model = this.vegetation.fallingTree(tree);
    const player = this.sim.state.player;
    const direction = new Vector3(
      position.x - player.position.x,
      0,
      position.z - player.position.z,
    );
    if (direction.lengthSquared() < 0.01)
      direction.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    direction.normalize();
    model.meshes.forEach((mesh) => this.lighting.addCaster(mesh));
    this.fallingTrees.push({
      ...model,
      age: 0,
      axis: new Vector3(direction.z, 0, -direction.x),
      rotation: Quaternion.RotationYawPitchRoll(tree.yaw, 0, 0),
    });
  }
  dispose() {
    this.disposed = true;
    for (const tree of this.fallingTrees) {
      tree.meshes.forEach((mesh) => this.lighting.removeCaster(mesh));
      tree.root.dispose(false);
    }
    this.fallingTrees.length = 0;
    this.worker?.terminate();
    for (const r of this.requests.values()) r.reject();
    this.requests.clear();
    for (const c of this.chunks.values()) c.root.dispose(false);
    this.chunks.clear();
    this.horizon.dispose();
    this.birds.forEach((b) => b.dispose());
    this.vegetation.dispose();
    this.environmentAssets.dispose();
    this.atmosphere.dispose();
  }
}
export function interactionFromMesh(
  mesh: Mesh | null,
): Interaction | undefined {
  return mesh?.metadata?.interaction as Interaction | undefined;
}
export { WorldGenerator };
