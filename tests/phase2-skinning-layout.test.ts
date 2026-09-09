import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Animations/animatable";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { prepareSkinnedGeometry } from "../src/rendering/skinning-layout";

describe("WebGPU skinned vertex layout", () => {
  for (const file of [
    "animals/boar-high.glb",
    "animals/deer-high.glb",
    "characters/survivor-player-arms.glb",
    "characters/survivor-male-high.glb",
  ])
    it(`unpacks ${file} without changing values, indices or shared geometry`, async () => {
      const engine = new NullEngine(),
        scene = new Scene(engine);
      const container = await LoadAssetContainerAsync(
        new Uint8Array(await readFile("public/assets/" + file)),
        scene,
        {
          pluginExtension: ".glb",
          pluginOptions: { gltf: { animationStartMode: 0 } },
        },
      );
      try {
        const meshes = container.meshes.filter(
          (m): m is Mesh =>
            m instanceof Mesh && Boolean(m.skeleton && m.geometry),
        );
        expect(meshes.length).toBeGreaterThan(0);
        expect(
          meshes.some((m) =>
            m
              .getVerticesDataKinds()
              .some((k) => m.getVertexBuffer(k)!.byteOffset > 0),
          ),
        ).toBe(true);
        const original = meshes.map((m) => ({
          geometry: m.geometry,
          indices: Array.from(m.getIndices()!),
          channels: m
            .getVerticesDataKinds()
            .map((kind) => ({
              kind,
              data: Array.from(m.getVerticesData(kind)!),
            })),
        }));
        prepareSkinnedGeometry(container.meshes);
        for (let i = 0; i < meshes.length; i++) {
          const mesh = meshes[i]!,
            before = original[i]!;
          expect(mesh.geometry).toBe(before.geometry);
          expect(Array.from(mesh.getIndices()!)).toEqual(before.indices);
          expect(mesh.computeBonesUsingShaders).toBe(true);
          for (const channel of before.channels) {
            const buffer = mesh.getVertexBuffer(channel.kind)!;
            expect(buffer.byteOffset).toBe(0);
            expect(buffer.byteStride).toBe(buffer.getSize() * 4);
            expect(Array.from(mesh.getVerticesData(channel.kind)!)).toEqual(
              channel.data,
            );
          }
        }
        const clone = meshes[0]!.clone("layout-sharing-check")!;
        expect(clone.geometry).toBe(meshes[0]!.geometry);
        clone.dispose();
        const buffers = meshes[0]!.geometry!.getVertexBuffers();
        prepareSkinnedGeometry(container.meshes);
        expect(meshes[0]!.geometry!.getVertexBuffers()).toBe(buffers);
      } finally {
        container.dispose();
        scene.dispose();
        engine.dispose();
      }
    });
});
