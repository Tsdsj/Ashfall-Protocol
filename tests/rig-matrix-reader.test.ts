import { expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { createWorldMatrixReader } from "../src/rendering/rig-animation";
it("matches forced hierarchy updates after same-frame animation edits and rebuilds ancestors once", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const root = new TransformNode("root", scene),
      spine = new TransformNode("spine", scene);
    spine.parent = root;
    const limbs = [
      new TransformNode("left", scene),
      new TransformNode("right", scene),
    ];
    for (const [i, limb] of limbs.entries()) {
      limb.parent = spine;
      limb.position.set(i ? 1 : -1, 2, 0.5);
      limb.computeWorldMatrix(true);
    }
    root.position.set(5, 3, -4);
    spine.rotationQuaternion = Quaternion.RotationYawPitchRoll(0.7, 0.3, -0.2);
    const after = vi.spyOn(
        root as unknown as { _afterComputeWorldMatrix(): void },
        "_afterComputeWorldMatrix",
      ),
      read = createWorldMatrixReader();
    const actual = limbs.map((node) => read(node).asArray().slice());
    expect(after).toHaveBeenCalledTimes(1);
    limbs.forEach((node, i) => {
      const expected = node.computeWorldMatrix(true).asArray();
      expected.forEach((v, n) => expect(actual[i]![n]).toBeCloseTo(v, 6));
    });
    spine.rotationQuaternion = Quaternion.RotationYawPitchRoll(-0.4, -0.5, 0.2);
    const next = createWorldMatrixReader(),
      updated = next(limbs[0]!).asArray().slice();
    limbs[0]!
      .computeWorldMatrix(true)
      .asArray()
      .forEach((v, n) => expect(updated[n]).toBeCloseTo(v, 6));
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
