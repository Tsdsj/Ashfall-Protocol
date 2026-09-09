import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import * as loader from "@babylonjs/core/Loading/sceneLoader";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  AnimalAssetLibrary,
  animalAttackPhase,
  type AnimalKind,
  type AnimalRig,
} from "../src/rendering/animal-assets";
vi.mock("@babylonjs/core/Loading/sceneLoader", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@babylonjs/core/Loading/sceneLoader")
    >();
  return {
    ...original,
    LoadAssetContainerAsync: vi.fn(original.LoadAssetContainerAsync),
  };
});
const { LoadAssetContainerAsync: realImport } = await vi.importActual<
  typeof import("@babylonjs/core/Loading/sceneLoader")
>("@babylonjs/core/Loading/sceneLoader");
const kinds: AnimalKind[] = ["deer", "wolf", "boar"];
async function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const manifest = JSON.parse(
    await fs.readFile("public/assets/animals/manifest.json", "utf8"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(manifest))),
  );
  vi.mocked(loader.LoadAssetContainerAsync).mockImplementation(
    async (source, scene, options) => {
      if (typeof source !== "string")
        throw new Error("Unexpected non-file source in library test");
      return realImport(
        new Uint8Array(await fs.readFile("public" + source)),
        scene,
        { ...options, pluginExtension: ".glb" },
      );
    },
  );
  const library = new AnimalAssetLibrary(scene);
  return {
    scene,
    engine,
    library,
    manifest,
    dispose() {
      library.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
function pose(rig: AnimalRig, scene: Scene, clip: string, phase: number) {
  const group = rig.animator.clips.get(clip)!;
  if (!group.isStarted) {
    group.start(false, 0);
    group.pause();
  }
  group.goToFrame(group.from + (group.to - group.from) * phase, false);
  for (const node of rig.nodes.values()) node.computeWorldMatrix(true);
  scene.incrementRenderId();
  for (const mesh of rig.meshes) mesh.skeleton?.prepare(true);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of rig.meshes) {
    const data = mesh.getPositionData(true, false)!,
      matrix = mesh.computeWorldMatrix(true);
    for (let i = 0; i < data.length; i += 3) {
      const v = Vector3.TransformCoordinates(
        Vector3.FromArray(data, i),
        matrix,
      ).asArray();
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, v[k]!);
        max[k] = Math.max(max[k]!, v[k]!);
      }
    }
  }
  return { min, max };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("动物骨骼资产与AI命中时序", () => {
  it("CC0来源、资源hash、骨骼权重和初载预算有效", async () => {
    const manifest = JSON.parse(
        await fs.readFile("public/assets/animals/manifest.json", "utf8"),
      ),
      io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    expect(manifest.license).toBe("CC0-1.0");
    expect(manifest.sources).toHaveLength(3);
    let total = 0;
    for (const file of manifest.files) {
      const data = await fs.readFile("public/assets/animals/" + file.file);
      total += data.length;
      expect(crypto.createHash("sha256").update(data).digest("hex")).toBe(
        file.sha256,
      );
      const doc = await io.readBinary(new Uint8Array(data));
      if (file.file.includes("motion")) {
        expect(doc.getRoot().listMeshes()).toHaveLength(0);
        for (const clip of ["Idle", "Walk", "Run", "Attack", "Hit", "Death"])
          expect(
            doc
              .getRoot()
              .listAnimations()
              .some((a) => a.getName() === clip),
          ).toBe(true);
      } else {
        expect(
          doc.getRoot().listSkins()[0]!.listJoints().length,
        ).toBeGreaterThanOrEqual(28);
        for (const mesh of doc.getRoot().listMeshes())
          for (const primitive of mesh.listPrimitives()) {
            const weights = primitive.getAttribute("WEIGHTS_0")?.getArray();
            if (!weights) continue;
            for (let i = 0; i < weights.length; i += 4)
              expect(
                weights[i]! +
                  weights[i + 1]! +
                  weights[i + 2]! +
                  weights[i + 3]!,
              ).toBeCloseTo(1, 3);
          }
      }
    }
    expect(total).toBeLessThan(1_600_000);
  });
  it("按需导入可创建独立骨架，四条腿有实际运动且+Z朝前", async () => {
    const task = await setup();
    try {
      for (const kind of kinds) {
        expect(task.library.ready(kind)).toBe(false);
        await task.library.preload(kind);
        const first = task.library.instantiate(kind + ":a", kind)!,
          second = task.library.instantiate(kind + ":b", kind)!;
        expect(first.feet).toHaveLength(4);
        expect(first.head.getAbsolutePosition().z).toBeGreaterThan(0);
        const standing = pose(first, task.scene, "Idle", 0);
        expect(standing.min[0]).toBeLessThan(-0.15);
        expect(standing.max[0]).toBeGreaterThan(0.15);
        const ranges = first.feet.map(() => [] as number[]);
        const secondPose = second.feet.map((foot) =>
          foot.computeWorldMatrix(true).getTranslation().clone(),
        );
        for (let i = 0; i < 12; i++) {
          pose(first, task.scene, "Walk", i / 12);
          first.feet.forEach((foot, j) =>
            ranges[j]!.push(foot.getAbsolutePosition().z),
          );
        }
        for (const range of ranges)
          expect(Math.max(...range) - Math.min(...range)).toBeGreaterThan(
            0.025,
          );
        second.feet.forEach((foot, j) =>
          expect(
            Vector3.Distance(
              foot.computeWorldMatrix(true).getTranslation(),
              secondPose[j]!,
            ),
          ).toBeLessThan(0.0001),
        );
        expect(first.meshes.find((mesh) => mesh.skeleton)!.skeleton).not.toBe(
          second.meshes.find((mesh) => mesh.skeleton)!.skeleton,
        );
        first.dispose();
        second.dispose();
      }
    } finally {
      task.dispose();
    }
  });
  it("死亡姿态连续倒下且鹿角、躯体不穿入平地", async () => {
    const task = await setup();
    try {
      for (const kind of kinds) {
        await task.library.preload(kind);
        const rig = task.library.instantiate(kind, kind)!;
        const height = pose(rig, task.scene, "Idle", 0).max[1]!;
        for (let i = 0; i <= 24; i++) {
          const bounds = pose(rig, task.scene, "Death", i / 24);
          expect(bounds.min[1]).toBeGreaterThan(-0.015);
          expect(bounds.min[1]).toBeLessThan(0.035);
          if (i === 24) expect(bounds.max[1]).toBeLessThan(height * 0.8);
        }
        rig.dispose();
      }
    } finally {
      task.dispose();
    }
  });
  it("不同攻击时长均把可见接触帧映射到唯一AI命中时刻", async () => {
    const manifest = JSON.parse(
      await fs.readFile("public/assets/animals/manifest.json", "utf8"),
    );
    for (const kind of kinds) {
      const hit = manifest.animals[kind].animations.Attack.hitPhase;
      expect(hit).toBeGreaterThan(0.2);
      expect(hit).toBeLessThan(0.65);
      for (const duration of [0.7, 1.1, 1.5]) {
        const attack = { elapsed: 0.3, hitTime: 0.3, duration };
        expect(animalAttackPhase(attack, hit)).toBeCloseTo(hit);
        expect(animalAttackPhase({ ...attack, elapsed: 0 }, hit)).toBe(0);
        expect(
          animalAttackPhase({ ...attack, elapsed: duration }, hit),
        ).toBeCloseTo(1);
        expect(
          animalAttackPhase({ ...attack, elapsed: 0.299 }, hit),
        ).toBeLessThan(hit);
        expect(
          animalAttackPhase({ ...attack, elapsed: 0.301 }, hit),
        ).toBeGreaterThan(hit);
      }
    }
  });
});
