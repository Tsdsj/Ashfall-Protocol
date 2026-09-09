import { scatterTrees } from "../world/scatter";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { TreeInstance } from "../world/scatter";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3, type Matrix } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Material } from "@babylonjs/core/Materials/material";
import { type Scene } from "@babylonjs/core/scene";
import { noise, random } from "../core/random";
import { ModelBatch, transform } from "./geometry";
import type { MaterialFactory } from "./materials";
import type { WorldGenerator } from "../world/generator";
import type { EnvironmentAssetLibrary } from "./environment-assets";
import { environmentApproaches, groundCoverAllowed } from "./environment-props";

export class VegetationLibrary {
  private crowns: Mesh[][] = [];
  private grass: Mesh;
  constructor(
    private scene: Scene,
    private materials: MaterialFactory,
    private assets: EnvironmentAssetLibrary,
  ) {
    const needles = new PBRMaterial("photographed-pine-needles", scene);
    needles.albedoTexture = new Texture(
      "/textures/phase2-environment/pine-bough.webp",
      scene,
      false,
      false,
    );
    needles.albedoTexture.hasAlpha = true;
    needles.useAlphaFromAlbedoTexture = true;
    needles.transparencyMode = Material.MATERIAL_ALPHATEST;
    needles.alphaCutOff = 0.28;
    needles.backFaceCulling = false;
    needles.twoSidedLighting = true;
    needles.albedoColor.set(0.92, 1.0, 0.82);
    needles.metallic = 0;
    needles.roughness = 0.95;
    needles.subSurface.isTranslucencyEnabled = true;
    needles.subSurface.translucencyIntensity = 0.16;
    // Irregular crowns use one photographed sprig; geometry decreases 8x with distance.
    for (let variant = 0; variant < 3; variant++) {
      const levels: Mesh[] = [];
      for (const [lod, rings, spokes] of [
        [0, 15, 9],
        [1, 11, 7],
        [2, 8, 6],
      ]) {
        const rng = random("needle-crown:" + variant + ":" + lod),
          cards: Mesh[] = [];
        const height = 15.8 + variant * 1.2;
        for (let level = 0; level < rings; level++) {
          const t = level / (rings - 1),
            y = height * (0.3 + t * 0.66);
          const radius = (2.35 + variant * 0.28) * Math.pow(1 - t, 0.68) + 0.14;
          for (let k = 0; k < spokes; k++) {
            const angle =
              (k / spokes) * Math.PI * 2 + level * 1.7 + rng() * 0.5;
            const length = radius * (lod === 2 ? 1.9 : 1.65) + 0.35,
              width = length * (lod === 2 ? 0.92 : 0.8);
            for (let spray = 0; spray < (lod === 0 ? 2 : 1); spray++) {
              const card = MeshBuilder.CreatePlane(
                "scanned-needle-card",
                { width, height: length, sideOrientation: Mesh.DOUBLESIDE },
                scene,
              );
              const reach = radius * (spray ? 0.45 : 0.66);
              card.position.set(
                Math.sin(angle) * reach,
                y + (rng() - 0.5) * 0.65,
                Math.cos(angle) * reach,
              );
              card.rotation.set(
                (spray ? 0.79 : Math.PI / 2 - 0.18) + (rng() - 0.5) * 0.38,
                angle + spray * 0.24,
                (rng() - 0.5) * 0.22,
              );
              card.material = needles;
              cards.push(card);
            }
          }
        }
        const crown = Mesh.MergeMeshes(cards, true, true)!;
        crown.name = "scanned-pine-crown:" + variant + ":" + lod;
        crown.material = needles;
        crown.setEnabled(false);
        levels.push(crown);
      }
      this.crowns.push(levels);
    }
    const planes: Mesh[] = [];
    for (let n = 0; n < 3; n++) {
      const plane = MeshBuilder.CreatePlane(
        "meadow-grass",
        { width: 1.15, height: 0.65, sideOrientation: Mesh.DOUBLESIDE },
        scene,
      );
      plane.position.y = 0.325;
      plane.rotation.y = (n * Math.PI) / 3;
      planes.push(plane);
    }
    this.grass = Mesh.MergeMeshes(planes, true, true)!;
    this.grass.material = materials.foliage("grass");
    this.grass.setEnabled(false);
  }
  buildChunk(
    gen: WorldGenerator,
    cx: number,
    cz: number,
    density: number,
    destroyed: ReadonlySet<string> = new Set(),
  ): Mesh[] {
    const rng = random(gen.seed + ":scatter:" + cx + "," + cz),
      trees: Matrix[][] = [[], [], []],
      treeIds: string[][] = [[], [], []],
      wood: Matrix[][] = [[], [], []],
      grasses: Matrix[] = [],
      ferns: Matrix[] = [],
      rocks: Matrix[] = [];
    const output: Mesh[] = [];
    const pois = gen.pois.filter(
      (p) =>
        p.x > cx * 256 - 80 &&
        p.x < (cx + 1) * 256 + 80 &&
        p.z > cz * 256 - 80 &&
        p.z < (cz + 1) * 256 + 80,
    );
    const paths = environmentApproaches(gen, pois);
    const cover = (x: number, z: number) =>
      groundCoverAllowed(gen, x, z, pois, paths);
    for (const t of scatterTrees(gen, cx, cz)) {
      if (destroyed.has(t.id)) continue;
      treeIds[t.variant]!.push(t.id);
      trees[t.variant]!.push(
        transform(
          t.position.x,
          t.position.y,
          t.position.z,
          t.scale.x,
          t.scale.y,
          t.scale.z,
          t.yaw,
        ),
      );
      wood[t.variant]!.push(
        transform(
          t.position.x,
          t.position.y,
          t.position.z,
          t.scale.x * 1.85,
          t.scale.y * (15.8 + t.variant * 1.2),
          t.scale.z * 2.12,
          t.yaw,
        ),
      );
    }
    for (let n = 0; n < Math.round(7100 * density); n++) {
      const x = cx * 256 + rng() * 256,
        z = cz * 256 + rng() * 256;
      if (!cover(x, z)) continue;
      const patch = noise(x / 19, z / 19, gen.seedNumber + 41);
      if (patch < 0.26 && rng() > 0.2) continue;
      const y = gen.height(x, z),
        size = 0.85 + rng() * 1.1;
      if (n % 19 === 0)
        ferns.push(
          transform(
            x,
            y - 0.015,
            z,
            size * 1.3,
            size * 0.65,
            size * 1.25,
            rng() * 6.28,
          ),
        );
      else
        grasses.push(
          transform(x, y - 0.035, z, size, size, size, rng() * 6.28),
        );
    }
    // Dense pockets along verges, wall bases and tree skirts replace the old 12m bare rings.
    const addPocket = (x: number, z: number, count: number, size: number) => {
      for (let i = 0; i < count; i++) {
        const angle = rng() * Math.PI * 2,
          radius = Math.sqrt(rng()) * 2.8;
        const px = x + Math.sin(angle) * radius,
          pz = z + Math.cos(angle) * radius;
        if (
          px < cx * 256 ||
          px >= (cx + 1) * 256 ||
          pz < cz * 256 ||
          pz >= (cz + 1) * 256 ||
          !cover(px, pz)
        )
          continue;
        const s = size * (0.6 + rng() * 0.7),
          yaw = rng() * 6.28,
          y = gen.height(px, pz);
        grasses.push(
          transform(px, y - 0.025, pz, s, s * (0.65 + rng() * 0.45), s, yaw),
        );
        if (i % 11 === 0)
          ferns.push(
            transform(
              px + 0.3,
              y - 0.025,
              pz,
              s * (i === 0 ? 1.65 : 0.95),
              s * (i === 0 ? 0.85 : 0.5),
              s * (i === 0 ? 1.65 : 0.95),
              yaw,
            ),
          );
      }
    };
    for (let i = 0; i < 54; i++) {
      const z = cz * 256 + i * 4.8 + rng() * 2,
        spine = -9 + Math.sin(z * 0.003) * 12;
      for (const side of [-1, 1])
        addPocket(
          spine + side * (7.8 + rng() * 3),
          z,
          Math.round(12 * density),
          1.25,
        );
    }
    for (const roadZ of [225, -420])
      if (roadZ > cz * 256 - 12 && roadZ < (cz + 1) * 256 + 12)
        for (let i = 0; i < 44; i++)
          for (const side of [-1, 1])
            addPocket(
              cx * 256 + i * 5.8,
              roadZ + side * 8.4,
              Math.round(11 * density),
              1.25,
            );
    for (const p of pois)
      for (const side of [-1, 1])
        for (let k = 0; k < 4; k++) {
          addPocket(
            p.x + side * (p.width / 2 + 1.8),
            p.z - p.depth / 2 + 1 + (k * (p.depth - 2)) / 3,
            Math.round(15 * density),
            1.15,
          );
          if (k < 2)
            addPocket(
              p.x + (k - 0.5) * (p.width - 3),
              p.z + p.depth / 2 + 1.6,
              Math.round(14 * density),
              1.1,
            );
        }
    // Stones remain below step height; major rocks require authored colliders.
    for (let n = 0; n < 150; n++) {
      const x = cx * 256 + rng() * 256,
        z = cz * 256 + rng() * 256;
      if (gen.isClearing(x, z) || gen.isWater(x, z)) continue;
      const size = 0.35 + rng() * 0.9;
      rocks.push(
        transform(
          x,
          gen.height(x, z) - 0.11,
          z,
          size,
          0.16 + rng() * 0.14,
          size * 1.45,
          rng() * 6.28,
        ),
      );
    }
    const prefix = `chunk:${cx},${cz}`;
    for (let v = 0; v < 3; v++) {
      output.push(
        ...this.assets.instances(
          this.assets.sources("pine-wood", "high"),
          wood[v]!,
          prefix + ":scanned-trunk-high:" + v,
          0,
          64,
          treeIds[v]!,
        ),
      );
      output.push(
        ...this.assets.instances(
          this.assets.sources("pine-wood", "low"),
          wood[v]!,
          prefix + ":scanned-trunk-low:" + v,
          64,
          390,
          treeIds[v]!,
        ),
      );
      for (const [lod, min, max] of [
        [0, 0, 70],
        [1, 70, 175],
        [2, 175, 390],
      ])
        output.push(
          ...this.assets.instances(
            [this.crowns[v]![lod]!],
            trees[v]!,
            prefix + ":scanned-foliage:" + v + ":" + lod,
            min,
            max,
            treeIds[v]!,
          ),
        );
    }
    output.push(
      ...this.assets.instances(
        [this.grass],
        grasses,
        prefix + ":grass",
        0,
        60 + 24 * Math.min(1.5, density),
      ),
    );
    output.push(
      ...this.assets.instances(
        this.assets.sources("fern", "high"),
        ferns,
        prefix + ":fern-high",
        0,
        28,
      ),
    );
    output.push(
      ...this.assets.instances(
        this.assets.sources("fern", "low"),
        ferns,
        prefix + ":fern-low",
        28,
        85,
      ),
    );
    output.push(
      ...this.assets.instances(
        this.assets.sources("rocks", "high"),
        rocks,
        prefix + ":rocks-high",
        0,
        40,
      ),
    );
    output.push(
      ...this.assets.instances(
        this.assets.sources("rocks", "low"),
        rocks,
        prefix + ":rocks-low",
        40,
        165,
      ),
    );
    return output;
  }
  distantBirds(): Mesh[] {
    const meshes: Mesh[] = [];
    for (let n = 0; n < 9; n++) {
      const b = new ModelBatch(this.scene, "bird");
      b.box(
        "left",
        [0.8, 0.015, 0.2],
        [-0.4, 0, 0],
        this.materials.simple("bird", "#333a36"),
        [0, 0, -0.12],
      );
      b.box(
        "right",
        [0.8, 0.015, 0.2],
        [0.4, 0, 0],
        this.materials.simple("bird", "#333a36"),
        [0, 0, 0.12],
      );
      const mesh = b.finish()[0]!;
      mesh.unfreezeWorldMatrix();
      mesh.position = new Vector3(n * 2, 35 + n * 0.6, 40 + n * 1.2);
      mesh.isPickable = false;
      meshes.push(mesh);
    }
    return meshes;
  }
  fallingTree(tree: TreeInstance): { root: TransformNode; meshes: Mesh[] } {
    const root = new TransformNode("falling:" + tree.id, this.scene);
    root.position.set(tree.position.x, tree.position.y, tree.position.z);
    root.scaling.set(tree.scale.x, tree.scale.y, tree.scale.z);
    root.rotation.y = tree.yaw;
    const meshes: Mesh[] = [];
    for (const source of this.assets.sources("pine-wood", "high")) {
      const mesh = source.clone("falling-trunk:" + tree.id, root, true)!;
      mesh.scaling.set(1.85, 15.8 + tree.variant * 1.2, 2.12);
      meshes.push(mesh);
    }
    const crown = this.crowns[tree.variant]![1]!.clone(
      "falling-crown:" + tree.id,
      root,
      true,
    )!;
    meshes.push(crown);
    for (const mesh of meshes) {
      mesh.setEnabled(true);
      mesh.unfreezeWorldMatrix();
      mesh.isPickable = false;
      mesh.receiveShadows = true;
    }
    return { root, meshes };
  }
  dispose() {
    this.grass.dispose();
    for (const variants of this.crowns)
      variants.forEach((mesh) => mesh.dispose());
  }
}
