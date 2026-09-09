import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { cascadeCasters } from "../src/rendering/shadow-culling";
it("culls off-footprint casters but preserves depth-clamped and edge casters", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const inside = MeshBuilder.CreateBox("inside", {}, scene);
    const outside = MeshBuilder.CreateBox("outside", {}, scene);
    outside.position.x = 30;
    const deep = MeshBuilder.CreateBox("deep", {}, scene);
    deep.position.z = 1000;
    const edge = MeshBuilder.CreateBox("edge", {}, scene);
    edge.position.x = 5.7;
    scene.incrementRenderId();
    const matrix = Matrix.OrthoLH(10, 10, 0.1, 20);
    expect(
      cascadeCasters(matrix, [inside, outside, deep, edge], 4).map(
        (mesh) => mesh.name,
      ),
    ).toEqual(["inside", "deep", "edge"]);
    outside.position.x = 0;
    scene.incrementRenderId();
    expect(
      cascadeCasters(matrix, [outside], 1).map((mesh) => mesh.name),
    ).toEqual(["outside"]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
