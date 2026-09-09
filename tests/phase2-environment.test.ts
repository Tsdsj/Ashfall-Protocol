import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import "@babylonjs/loaders/glTF";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { loadEnvironmentAsset } from "../src/rendering/environment-assets";
import { WorldGenerator } from "../src/world/generator";
import {
  environmentPlacements,
  environmentPropColliders,
  groundCoverAllowed,
  environmentApproaches,
  openingWreckColliders,
  OPENING_WRECK,
} from "../src/rendering/environment-props";

describe("环境资产与场景布置契约", () => {
  it("针叶处理保持预期尺寸，并排除图集外围不相关的不透明块", async () => {
    const sprig = await sharp(
      "public/textures/phase2-environment/pine-twig.webp",
    )
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([sprig.info.width, sprig.info.height, sprig.info.channels]).toEqual([
      256, 512, 4,
    ]);
    let pixels = 0;
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        if (sprig.data[i + 3]! > 150) {
          pixels++;
        }
        if ((x < 8 || x > 247) && y > 440)
          expect(sprig.data[i + 3]!).toBeLessThan(8);
      }
    expect(pixels).toBeGreaterThan(18000);
    const bough = await sharp(
      "public/textures/phase2-environment/pine-bough.webp",
    ).metadata();
    expect([bough.width, bough.height, bough.hasAlpha]).toEqual([
      1024,
      1024,
      true,
    ]);
  });
  it("低矮地被延伸到12m树木清理带内，但避开路面、室内和门前小径", () => {
    const gen = new WorldGenerator("verge-coverage"),
      z = 300,
      spine = -9 + Math.sin(z * 0.003) * 12;
    expect(gen.isClearing(spine + 8, z)).toBe(true);
    expect(groundCoverAllowed(gen, spine + 8, z, [], [])).toBe(true);
    expect(groundCoverAllowed(gen, spine + 4.5, z, [], [])).toBe(false);
    const p = gen.pois.find((p) => p.id === "pine-0")!,
      paths = environmentApproaches(gen, [p]);
    expect(paths.length).toBe(1);
    expect(groundCoverAllowed(gen, p.x, p.z, [p], paths)).toBe(false);
    const path = paths[0]!;
    expect(
      groundCoverAllowed(
        gen,
        (path.from[0] + path.to[0]) / 2,
        (path.from[1] + path.to[1]) / 2,
        [p],
        paths,
      ),
    ).toBe(false);
    expect(
      groundCoverAllowed(gen, p.x - p.width / 2 - 2, p.z, [p], paths),
    ).toBe(true);
  });
  it("侧翻运输车及行李有独立碰撞，开场恢复点和行走出口不在碰撞内", () => {
    const colliders = openingWreckColliders();
    expect(colliders.length).toBe(4);
    for (const p of [
      { x: -14, z: -28 },
      { x: -14, z: -29 },
      { x: -15, z: -28 },
    ])
      expect(
        colliders.some(
          (c) =>
            p.x > c.minX - 0.3 &&
            p.x < c.maxX + 0.3 &&
            p.z > c.minZ - 0.3 &&
            p.z < c.maxZ + 0.3,
        ),
      ).toBe(false);
    expect(OPENING_WRECK.roll).toBeGreaterThan(1.3);
    expect(colliders[0]!.maxY).toBeGreaterThan(2.5);
    expect(colliders[0]!.minY).toBeGreaterThanOrEqual(0);
  });
  it("所有优化 GLB 可由真实 Babylon importer 读取", async () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    const manifest = JSON.parse(
      await fs.readFile("public/assets/environment/manifest.json", "utf8"),
    );
    try {
      for (const file of manifest.files.filter((file: { file: string }) =>
        file.file.endsWith(".glb"),
      )) {
        const bytes = await fs.readFile(
          "public/assets/environment/" + file.file,
        );
        const container = await loadEnvironmentAsset(
          new Uint8Array(bytes),
          scene,
        );
        expect(
          container.meshes.reduce(
            (sum, mesh) => sum + mesh.getTotalVertices(),
            0,
          ),
        ).toBeGreaterThan(0);
        for (const material of container.materials)
          expect(
            material.getActiveTextures().every((texture) => texture.isReady()),
          ).toBe(true);
        container.dispose();
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
  it("发电机玻璃不启用全场景折射，反复创建和卸载不会留下已销毁网格列表", async () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    try {
      const container = await loadEnvironmentAsset(
        new Uint8Array(
          await fs.readFile("public/assets/environment/generator-high.glb"),
        ),
        scene,
      );
      expect(container.materials.some((material) => material.alpha < 1)).toBe(
        true,
      );
      for (let cycle = 0; cycle < 30; cycle++) {
        const mesh = MeshBuilder.CreateBox(`streamed-${cycle}`, {}, scene);
        mesh.material = container.materials[0]!;
        mesh.dispose();
      }
      // The loader defers transmission list updates until the next task.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(scene).not.toHaveProperty("_transmissionHelper");
      expect(
        scene.objectRenderers.some(
          (renderer) => renderer.name === "opaqueSceneTexture",
        ),
      ).toBe(false);
      container.dispose();
      expect(scene.meshes).toHaveLength(0);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
  it("资产具有核验的来源、实际几何、纹理预算和独立低模", async () => {
    const manifest = JSON.parse(
      await fs.readFile("public/assets/environment/manifest.json", "utf8"),
    );
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    expect(manifest.license).toBe("CC0-1.0");
    expect(manifest.assets.length).toBeGreaterThanOrEqual(11);
    let total = 0;
    for (const file of manifest.files) {
      const bytes = await fs.readFile(
        file.file.startsWith("/")
          ? "public" + file.file
          : "public/assets/environment/" + file.file,
      );
      expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(
        file.sha256,
      );
      total += bytes.length;
      if (!file.file.endsWith(".glb")) continue;
      const document = await io.readBinary(new Uint8Array(bytes));
      const primitives = document
        .getRoot()
        .listMeshes()
        .flatMap((mesh) => mesh.listPrimitives());
      expect(primitives.length).toBeGreaterThan(0);
      const triangles = primitives.reduce(
        (sum, p) => sum + p.getIndices()!.getCount() / 3,
        0,
      );
      expect(triangles).toBe(file.triangles);
      expect(triangles).toBeLessThan(15000);
      for (const primitive of primitives) {
        const positions = primitive.getAttribute("POSITION")!.getArray()!;
        expect(Array.from(positions).every(Number.isFinite)).toBe(true);
      }
      for (const texture of document.getRoot().listTextures()) {
        expect(texture.getSize()![0]).toBeLessThanOrEqual(1024);
        expect(texture.getSize()![1]).toBeLessThanOrEqual(1024);
      }
      if (file.file.endsWith("-low.glb")) {
        const high = manifest.files.find(
          (f: { file: string }) =>
            f.file === file.file.replace("-low.glb", "-high.glb"),
        );
        expect(file.triangles).toBeLessThan(high.triangles);
        expect(file.bytes).toBeLessThan(high.bytes);
      }
    }
    expect(total).toBeLessThan(7_000_000);
  });
  it("大型道具全部有碰撞且不堵住门与室内中心通道", () => {
    const gen = new WorldGenerator("environment-contract");
    for (const p of gen.pois) {
      const items = environmentPlacements(p),
        colliders = environmentPropColliders(p, gen.poiHeight(p));
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
      expect(colliders.length).toBe(items.filter((item) => item.solid).length);
      for (const collider of colliders) {
        expect(collider.minX).toBeLessThan(collider.maxX);
        expect(collider.minY).toBeLessThan(collider.maxY);
        expect(collider.minZ).toBeLessThan(collider.maxZ);
        const crossesCentre =
          collider.minX < p.x + 0.65 && collider.maxX > p.x - 0.65;
        expect(crossesCentre).toBe(false);
      }
      if (p.kind !== "extraction") {
        const table = items.find((item) => item.asset === "table")!;
        expect(table.position[1] + table.size[1]).toBeCloseTo(0.92);
        expect(table.position[0]).toBe(3);
      }
    }
  });
  it("倒椅的旋转包围盒覆盖实际落地轮廓", () => {
    const gen = new WorldGenerator("furniture-bounds"),
      p = gen.pois.find((p) => p.id === "pine-0")!;
    const chair = environmentPlacements(p).find((p) =>
      p.id.endsWith("fallen-chair"),
    )!;
    const bounds = environmentPropColliders(p, gen.poiHeight(p)).find(
      (p) => p.id === chair.id,
    )!;
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(chair.size[0]);
    expect(bounds.maxY - bounds.minY).toBeLessThan(chair.size[1]);
    expect(bounds.minY - gen.poiHeight(p)).toBeGreaterThanOrEqual(0.08);
  });
});
