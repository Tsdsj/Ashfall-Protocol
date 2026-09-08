import { scatterTrees } from "../world/scatter";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3, type Matrix } from "@babylonjs/core/Maths/math.vector";
import { type Scene } from "@babylonjs/core/scene";
import { random } from "../core/random";
import { ModelBatch, applyThinInstances, transform } from "./geometry";
import type { MaterialFactory } from "./materials";
import type { WorldGenerator } from "../world/generator";
export class VegetationLibrary {
  private trees: { wood: Mesh; leaves: Mesh }[] = [];
  private grass: Mesh;
  private fern: Mesh;
  private rock: Mesh;
  constructor(
    private scene: Scene,
    private materials: MaterialFactory,
  ) {
    for (let variant = 0; variant < 3; variant++) {
      const rng = random("tree:" + variant),
        wood = new ModelBatch(scene, "treewood-" + variant),
        leaves: Mesh[] = [];
      const h = 13 + variant * 3,
        leafMat = materials.foliage(variant === 2 ? "leaf" : "pine"),
        barkMat = materials.surface(
          "bark",
          variant === 2 ? "#dadbc7" : "#aeb4a3",
        );
      wood.cylinder(
        "trunk",
        h,
        0.48,
        [0, h / 2, 0],
        barkMat,
        [0, 0, 0],
        0.08,
        10,
      );
      for (let level = 0; level < 9; level++) {
        const y = 2.3 + (level * (h - 3)) / 9,
          r = (1 - level / 10) * (variant === 2 ? 3.1 : 4.1);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + level * 0.47 + rng() * 0.4;
          const lx = Math.sin(a) * r,
            lz = Math.cos(a) * r;
          wood.pipe(
            "branch",
            [0, y, 0],
            [lx, y + 0.55, lz],
            0.08 * (1 - level / 11),
            barkMat,
          );
          const leaf = MeshBuilder.CreatePlane(
            "needle-spray",
            {
              width: r * 1.3,
              height: r * 1.65,
              sideOrientation: Mesh.DOUBLESIDE,
            },
            scene,
          );
          leaf.position.set(lx * 0.65, y + 0.45, lz * 0.65);
          leaf.rotation.set(Math.PI / 2 - 0.25, a, Math.sin(a) * 0.12);
          leaf.material = leafMat;
          leaves.push(leaf);
          if (level % 2 === 0) {
            const upright = leaf.clone("upright-spray");
            upright.rotation.x = 0.6;
            upright.position.y += 0.3;
            leaves.push(upright);
          }
        }
      }
      const branches = wood.finish()[0]!;
      const needles = Mesh.MergeMeshes(leaves, true, true)!;
      needles.material = leafMat;
      branches.setEnabled(false);
      needles.setEnabled(false);
      this.trees.push({ wood: branches, leaves: needles });
    }
    const makePlant = (
      kind: "grass" | "fern",
      width: number,
      height: number,
    ) => {
      const planes: Mesh[] = [];
      for (let n = 0; n < 3; n++) {
        const p = MeshBuilder.CreatePlane(
          kind,
          { width, height, sideOrientation: Mesh.DOUBLESIDE },
          scene,
        );
        p.position.y = height / 2;
        p.rotation.y = (n * Math.PI) / 3;
        planes.push(p);
      }
      const m = Mesh.MergeMeshes(planes, true, true)!;
      m.material = materials.foliage(kind);
      m.setEnabled(false);
      return m;
    };
    this.grass = makePlant("grass", 1.5, 1.05);
    this.fern = makePlant("fern", 1.65, 1.05);
    this.rock = MeshBuilder.CreateIcoSphere(
      "rock-template",
      { radius: 1, subdivisions: 2, flat: false },
      scene,
    );
    const positions = this.rock.getVerticesData("position")!;
    const rng = random(44);
    for (let n = 0; n < positions.length; n += 3) {
      const s = 0.82 + rng() * 0.32;
      positions[n]! *= s;
      positions[n + 1]! *= s * 0.65;
      positions[n + 2]! *= s;
    }
    this.rock.updateVerticesData("position", positions);
    this.rock.material = materials.surface("stone");
    this.rock.setEnabled(false);
  }
  buildChunk(
    gen: WorldGenerator,
    cx: number,
    cz: number,
    density: number,
  ): Mesh[] {
    const rng = random(gen.seed + ":scatter:" + cx + "," + cz),
      trees: Matrix[][] = [[], [], []],
      grasses: Matrix[] = [],
      ferns: Matrix[] = [],
      rocks: Matrix[] = [];
    const output: Mesh[] = [];
    for (const t of scatterTrees(gen, cx, cz)) {
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
    }
    for (let n = 0; n < Math.round(2200 * density); n++) {
      const x = cx * 256 + rng() * 256,
        z = cz * 256 + rng() * 256;
      if (gen.isClearing(x, z)) continue;
      const y = gen.height(x, z);
      if (y < -4) continue;
      const m = transform(
        x,
        y - 0.04,
        z,
        0.6 + rng() * 0.9,
        0.55 + rng() * 0.7,
        0.6 + rng() * 0.7,
        rng() * 6.28,
      );
      if (n % 17 === 0) ferns.push(m);
      else grasses.push(m);
    }
    for (let n = 0; n < 95; n++) {
      const x = cx * 256 + rng() * 256,
        z = cz * 256 + rng() * 256;
      if (gen.isClearing(x, z)) continue;
      const y = gen.height(x, z),
        s = 0.35 + rng() * 1.5;
      rocks.push(transform(x, y, z, s, s, s * 0.8, rng() * 6.28));
    }
    this.trees.forEach((tree, i) => {
      if (trees[i]!.length) {
        output.push(
          applyThinInstances(
            tree.wood,
            trees[i]!,
            `chunk:${cx},${cz}:trunk${i}`,
          ),
        );
        output.push(
          applyThinInstances(
            tree.leaves,
            trees[i]!,
            `chunk:${cx},${cz}:foliage${i}`,
          ),
        );
      }
    });
    if (grasses.length)
      output.push(
        applyThinInstances(this.grass, grasses, `chunk:${cx},${cz}:grass`),
      );
    if (ferns.length)
      output.push(
        applyThinInstances(this.fern, ferns, `chunk:${cx},${cz}:fern`),
      );
    if (rocks.length)
      output.push(
        applyThinInstances(this.rock, rocks, `chunk:${cx},${cz}:rocks`),
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
      const m = b.finish()[0]!;
      m.unfreezeWorldMatrix();
      m.position = new Vector3(n * 2, 35 + n * 0.6, 40 + n * 1.2);
      m.isPickable = false;
      meshes.push(m);
    }
    return meshes;
  }
}
