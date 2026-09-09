import "@babylonjs/loaders/glTF";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Vec3, POI } from "../core/types";
import type { WorldGenerator } from "../world/generator";
import type { MaterialFactory } from "./materials";
import { applyThinInstances } from "./geometry";
import { environmentPlacements } from "./environment-props";

interface DistanceBatch {
  meshes: Mesh[];
  matrices: Matrix[];
  min: number;
  max: number;
  selection: string;
}

/** Fixed-size ambient pool: weather never creates unbounded scene objects. */
export class EnvironmentAtmosphere {
  private scraps: Mesh[] = [];
  private drips: Mesh[] = [];
  private steam: Mesh[] = [];
  private vapour: PBRMaterial;
  private clock = 0;
  private scan = 0;
  private nearby: POI | undefined;
  private service: POI | undefined;
  constructor(scene: Scene, mats: MaterialFactory) {
    for (let i = 0; i < 12; i++) {
      const paper = MeshBuilder.CreatePlane(
        "windblown-paper-pool:" + i,
        {
          width: i % 2 ? 0.16 : 0.065,
          height: i % 2 ? 0.22 : 0.13,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene,
      );
      paper.material = mats.simple(
        i % 2 ? "weathered-paper" : "dry-leaf",
        i % 2 ? "#94977e" : "#736b47",
      );
      paper.isPickable = false;
      paper.setEnabled(false);
      this.scraps.push(paper);
    }
    for (let i = 0; i < 8; i++) {
      const drip = MeshBuilder.CreateCylinder(
        "roof-drip-pool:" + i,
        { height: 0.11, diameter: 0.008, tessellation: 4 },
        scene,
      );
      drip.material = mats.simple("roof-runoff", "#96aca5", 0, 0.43);
      drip.isPickable = false;
      drip.setEnabled(false);
      this.drips.push(drip);
    }
    const texture = new DynamicTexture(
        "steam-softness",
        { width: 64, height: 64 },
        scene,
        false,
      ),
      c = texture.getContext() as CanvasRenderingContext2D;
    const gradient = c.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, "rgba(210,221,207,.38)");
    gradient.addColorStop(0.35, "rgba(190,203,190,.20)");
    gradient.addColorStop(1, "rgba(190,203,190,0)");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 64, 64);
    texture.hasAlpha = true;
    texture.update();
    this.vapour = new PBRMaterial("service-pipe-steam", scene);
    this.vapour.albedoTexture = texture;
    this.vapour.useAlphaFromAlbedoTexture = true;
    this.vapour.transparencyMode = Material.MATERIAL_ALPHABLEND;
    this.vapour.metallic = 0;
    this.vapour.roughness = 1;
    this.vapour.backFaceCulling = false;
    for (let i = 0; i < 6; i++) {
      const steam = MeshBuilder.CreatePlane(
        "service-steam-pool:" + i,
        { size: 1 },
        scene,
      );
      steam.material = this.vapour;
      steam.billboardMode = Mesh.BILLBOARDMODE_ALL;
      steam.isPickable = false;
      steam.setEnabled(false);
      this.steam.push(steam);
    }
  }
  update(dt: number, position: Vec3, gen: WorldGenerator, raining: boolean) {
    this.clock += dt;
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.75;
      const nearby = gen.pois
        .filter(
          (p) =>
            p.kind !== "extraction" &&
            Math.hypot(p.x - position.x, p.z - position.z) < 48,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - position.x, a.z - position.z) -
            Math.hypot(b.x - position.x, b.z - position.z),
        );
      this.nearby = nearby[0];
      this.service = nearby.find(
        (p) => p.kind === "industrial" || p.kind === "lab",
      );
    }
    const indoor =
      this.nearby &&
      Math.abs(position.x - this.nearby.x) < this.nearby.width / 2 &&
      Math.abs(position.z - this.nearby.z) < this.nearby.depth / 2;
    this.scraps.forEach((mesh, i) => {
      mesh.setEnabled(!indoor);
      if (indoor) return;
      const cycle = (this.clock * (0.03 + i * 0.0008) + i * 0.13) % 1,
        angle = i * 2.399,
        radius = 10 + i * 2.3;
      // Pool particles keep their own world origin instead of following the camera.
      let anchor = mesh.metadata as { x: number; z: number } | null;
      if (
        !anchor ||
        Math.hypot(anchor.x - position.x, anchor.z - position.z) > 60
      ) {
        anchor = this.nearby
          ? {
              x: this.nearby.x - this.nearby.width / 2 - 1,
              z: this.nearby.z - this.nearby.depth / 2 - 1,
            }
          : { x: position.x, z: position.z };
        mesh.metadata = anchor;
      }
      const x = anchor.x + Math.sin(angle) * radius + (cycle - 0.5) * 4,
        z = anchor.z + Math.cos(angle) * radius;
      if (gen.isWater(x, z)) {
        mesh.setEnabled(false);
        return;
      }
      mesh.position.set(
        x,
        gen.height(x, z) +
          0.12 +
          Math.sin(cycle * Math.PI) * (0.25 + (i % 3) * 0.25),
        z,
      );
      mesh.rotation.set(
        Math.PI / 2 + Math.sin(this.clock * 0.8 + i) * 0.3,
        angle + cycle,
        Math.sin(this.clock + i) * 0.18,
      );
    });
    this.drips.forEach((mesh, i) => {
      const p = this.nearby;
      mesh.setEnabled(Boolean(p && raining));
      if (!p || !raining) return;
      const phase = (this.clock * 1.4 + i * 0.127) % 1;
      mesh.position.set(
        p.x + (i < 4 ? -1 : 1) * (p.width / 2 - 0.35),
        gen.poiHeight(p) + 3.3 * (1 - phase * phase),
        p.z + p.depth / 2 + 0.24 + (i % 4) * 0.018,
      );
    });
    this.steam.forEach((mesh, i) => {
      const p = this.service;
      mesh.setEnabled(Boolean(p));
      if (!p) return;
      const phase = (this.clock * 0.19 + i / 6) % 1;
      mesh.position.set(
        p.x + p.width / 2 + 0.4 + phase * 0.7,
        gen.poiHeight(p) + 2.75 + phase * 1.5,
        p.z + p.depth / 2 - 1 + Math.sin(phase * 4 + i) * 0.15,
      );
      mesh.scaling.setAll(0.3 + phase * 0.8);
      mesh.visibility = Math.sin(phase * Math.PI) * 0.36;
    });
  }
  dispose() {
    [...this.scraps, ...this.drips, ...this.steam].forEach((mesh) =>
      mesh.dispose(),
    );
    this.vapour.dispose(false, true);
  }
}
/** Static CC0 assets are shared by all streamed chunks; instances never own textures. */
export async function loadEnvironmentAsset(
  source: string | ArrayBufferView,
  scene: Scene,
) {
  const container = await LoadAssetContainerAsync(source, scene, {
    pluginExtension: ".glb",
    // A small generator gauge must not install a scene-wide transmission pass.
    // Babylon 8.56's helper retains disposed streamed meshes in this scene.
    pluginOptions: { gltf: { dontUseTransmissionHelper: true } },
  });
  for (const material of container.materials) {
    if (
      material instanceof PBRMaterial &&
      material.subSurface.isRefractionEnabled
    ) {
      material.subSurface.isRefractionEnabled = false;
      material.subSurface.refractionIntensity = 0;
      material.alpha = 0.45;
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      material.clearCoat.isEnabled = true;
      material.clearCoat.intensity = 0.7;
      material.clearCoat.roughness = 0.18;
    }
  }
  return container;
}

export class EnvironmentAssetLibrary {
  private jobs = new Map<string, Promise<void>>();
  private templates = new Map<string, Mesh[]>();
  private containers: AssetContainer[] = [];
  private batches = new Set<DistanceBatch>();
  private focus: Vec3 = { x: 0, y: 0, z: 0 };
  private disposed = false;
  readonly failures: string[] = [];
  constructor(private scene: Scene) {}
  async load(key: string, lod: "high" | "low" = "high") {
    const name = key + "-" + lod;
    let job = this.jobs.get(name);
    if (job) return job;
    job = loadEnvironmentAsset(
      "/assets/environment/" + name + ".glb",
      this.scene,
    )
      .then((container) => {
        if (this.disposed) {
          container.dispose();
          return;
        }
        this.containers.push(container);
        const meshes: Mesh[] = [];
        for (const source of container.meshes) {
          if (!(source instanceof Mesh) || !source.getTotalVertices()) continue;
          source.computeWorldMatrix(true);
          const mesh = source.clone(
            "environment-template:" + name + ":" + meshes.length,
            null,
            true,
          )!;
          mesh.makeGeometryUnique();
          mesh.bakeTransformIntoVertices(source.getWorldMatrix());
          mesh.parent = null;
          mesh.position.setAll(0);
          mesh.scaling.setAll(1);
          mesh.rotation.setAll(0);
          mesh.rotationQuaternion = null;
          mesh.refreshBoundingInfo(true);
          if (mesh.material instanceof PBRMaterial) {
            mesh.material.albedoColor.multiplyInPlace(
              new Color3(0.91, 0.94, 0.9),
            );
            mesh.material.roughness = Math.max(
              mesh.material.roughness ?? 0.85,
              0.64,
            );
            mesh.material.environmentIntensity = 0.85;
          }
          meshes.push(mesh);
        }
        const min = new Vector3(Infinity, Infinity, Infinity),
          max = new Vector3(-Infinity, -Infinity, -Infinity);
        for (const mesh of meshes) {
          const bounds = mesh.getBoundingInfo().boundingBox;
          min.minimizeInPlace(bounds.minimum);
          max.maximizeInPlace(bounds.maximum);
        }
        const size = max.subtract(min);
        // Normalize whole multi-material object once; roots are floor pivots in metres.
        const centre = new Vector3(
          (min.x + max.x) / 2,
          min.y,
          (min.z + max.z) / 2,
        );
        // The pine's asymmetrical branches must not move its trunk away from the collider.
        if (key === "pine-wood") {
          centre.x = 0;
          centre.z = 0;
        }
        const normalize = Matrix.Translation(
          -centre.x,
          -centre.y,
          -centre.z,
        ).multiply(
          Matrix.Scaling(
            1 / Math.max(size.x, 0.001),
            1 / Math.max(size.y, 0.001),
            1 / Math.max(size.z, 0.001),
          ),
        );
        for (const mesh of meshes) {
          mesh.bakeTransformIntoVertices(normalize);
          mesh.setEnabled(false);
          mesh.isPickable = false;
          mesh.metadata = { sourceAsset: key, lod };
        }
        this.templates.set(name, meshes);
      })
      .catch((error) => {
        this.failures.push(name + ": " + String(error));
        throw error;
      });
    this.jobs.set(name, job);
    return job;
  }
  async preload(keys: string[]) {
    await Promise.all(
      [...new Set(keys)].flatMap((key) => [
        this.load(key, "high"),
        this.load(key, "low"),
      ]),
    );
  }
  async preparePOIs(pois: POI[]) {
    await this.preload(
      pois.flatMap((p) => environmentPlacements(p).map((item) => item.asset)),
    );
  }
  sources(key: string, lod: "high" | "low") {
    return this.templates.get(key + "-" + lod) ?? [];
  }
  /** Band selection is refreshed only on the world streaming tick, never per vertex or frame. */
  instances(
    sources: Mesh[],
    matrices: Matrix[],
    name: string,
    min: number,
    max: number,
  ): Mesh[] {
    if (!matrices.length) return [];
    const meshes = sources.map((source, i) =>
      applyThinInstances(source, [matrices[0]!], name + ":" + i),
    );
    const batch = { meshes, matrices, min, max, selection: "initial" };
    this.batches.add(batch);
    this.select(batch);
    return meshes;
  }
  private select(batch: DistanceBatch) {
    const selected: number[] = [];
    const min2 = batch.min * batch.min,
      max2 = batch.max * batch.max;
    for (let i = 0; i < batch.matrices.length; i++) {
      const m = batch.matrices[i]!.m;
      const distance =
        (m[12]! - this.focus.x) ** 2 + (m[14]! - this.focus.z) ** 2;
      if (distance >= min2 && distance < max2) selected.push(i);
    }
    const key = selected.join(",");
    if (key === batch.selection) return;
    batch.selection = key;
    const buffer = new Float32Array(selected.length * 16);
    selected.forEach((index, i) =>
      buffer.set(batch.matrices[index]!.m, i * 16),
    );
    for (const mesh of batch.meshes) {
      mesh.setEnabled(selected.length > 0);
      if (selected.length) {
        mesh.thinInstanceSetBuffer("matrix", buffer.slice(), 16, true);
        mesh.thinInstanceRefreshBoundingInfo(true);
      }
    }
  }
  updateFocus(position: Vec3) {
    this.focus = position;
    for (const batch of this.batches) {
      if (batch.meshes.every((mesh) => mesh.isDisposed()))
        this.batches.delete(batch);
      else this.select(batch);
    }
  }
  buildPOIs(pois: POI[], height: (p: POI) => number, name: string): Mesh[] {
    const groups = new Map<string, Matrix[]>();
    for (const p of pois)
      for (const placement of environmentPlacements(p)) {
        const [x, y, z] = placement.position;
        const matrix = Matrix.Compose(
          new Vector3(...placement.size),
          Quaternion.RotationYawPitchRoll(
            placement.yaw,
            placement.pitch ?? 0,
            placement.roll ?? 0,
          ),
          new Vector3(p.x + x, height(p) + y, p.z + z),
        );
        const group = groups.get(placement.asset) ?? [];
        group.push(matrix);
        groups.set(placement.asset, group);
      }
    const output: Mesh[] = [];
    for (const [asset, matrices] of groups) {
      const detail = asset === "wrench" ? 18 : 45;
      output.push(
        ...this.instances(
          this.sources(asset, "high"),
          matrices,
          name + ":" + asset + ":high",
          0,
          detail,
        ),
      );
      output.push(
        ...this.instances(
          this.sources(asset, "low"),
          matrices,
          name + ":" + asset + ":low",
          detail,
          asset === "wrench" ? 40 : 155,
        ),
      );
    }
    return output;
  }
  get stats() {
    return {
      assets: this.templates.size,
      batches: this.batches.size,
      failures: this.failures.length,
    };
  }
  dispose() {
    this.disposed = true;
    for (const meshes of this.templates.values())
      meshes.forEach((mesh) => mesh.dispose());
    for (const container of this.containers) container.dispose();
    this.templates.clear();
    this.batches.clear();
  }
}
