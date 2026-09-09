import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GameRenderer } from "../src/rendering/renderer";
import { MotionSpring } from "../src/core/motion";
describe("first-person horizon", () => {
  it("recomputes camera up when sprint bob settles and pitch/yaw keep changing", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      camera = new UniversalCamera("test", Vector3.Zero(), scene);
    const player = { position: { x: 0, y: 0, z: 0 }, pitch: 1.2, yaw: 0 };
    const pose = {
      height: 1.68,
      offset: { x: 0, y: 0, z: 0 },
      roll: 0.003,
      fov: 60,
    };
    const renderer = {
      camera,
      menuMode: false,
      time: 0,
      world: { focus: null },
      sim: {
        state: { player },
        grounded: true,
        combat: { recoil: 0 },
        narrative: { frame: () => ({ blocking: false }) },
      },
      motion: { update: () => pose },
      groundEye: new MotionSpring(),
      settings: { cameraShake: 1 },
    };
    try {
      for (const [pitch, yaw, roll] of [
        [1.2, 0, 0.003],
        [1.2, 0, 0],
        [1.2, 1.6, 0],
        [0, 2.5, 0],
        [-1.3, 4, 0],
        [0.8, 1, 0.055],
        [0.8, 2, 0.055],
        [0, 0, 0],
      ]) {
        Object.assign(player, { pitch, yaw });
        pose.roll = roll;
        GameRenderer.prototype.prepareView.call(
          renderer as unknown as GameRenderer,
          1 / 60,
          false,
        );
        const expected = Vector3.TransformNormal(
          Vector3.Up(),
          Matrix.RotationYawPitchRoll(yaw, pitch, roll),
        );
        expect(Vector3.Distance(camera.upVector, expected)).toBeLessThan(1e-5);
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
