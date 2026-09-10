import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GameRenderer } from "../src/rendering/renderer";
import { MotionSpring } from "../src/core/motion";
it("places the camera in the driver seat and keeps the seat fixed when looking sideways", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    camera = new UniversalCamera("driver", Vector3.Zero(), scene);
  const vehicle = {
    id: "car",
    position: { x: 100, y: 5, z: 200 },
    yaw: 0,
    speed: 0,
  };
  const player = {
    position: { x: 100, y: 5.6, z: 200 },
    yaw: 0,
    pitch: 0,
    vehicle: "car",
  };
  const renderer = {
    camera,
    menuMode: false,
    time: 0,
    world: { focus: null },
    sim: {
      state: { player, vehicles: [vehicle] },
      grounded: true,
      combat: { recoil: 0 },
      narrative: { frame: () => ({ blocking: false }) },
    },
    motion: {
      update: () => ({
        height: 1.05,
        offset: { x: 0, y: 0, z: 0 },
        roll: 0,
        fov: 60,
      }),
    },
    groundEye: new MotionSpring(),
    settings: { cameraShake: 1 },
  };
  try {
    GameRenderer.prototype.prepareView.call(
      renderer as unknown as GameRenderer,
      1 / 60,
      false,
    );
    expect(camera.position.x).toBeCloseTo(99.6);
    expect(camera.position.y).toBeCloseTo(6.6);
    expect(camera.position.z).toBeGreaterThan(200.1);
    const eye = camera.position.clone();
    player.yaw = Math.PI / 2;
    GameRenderer.prototype.prepareView.call(
      renderer as unknown as GameRenderer,
      1 / 60,
      false,
    );
    expect(Vector3.Distance(camera.position, eye)).toBeLessThan(0.00001);
    vehicle.yaw = Math.PI / 2;
    player.yaw = vehicle.yaw;
    GameRenderer.prototype.prepareView.call(
      renderer as unknown as GameRenderer,
      1 / 60,
      false,
    );
    expect(camera.position.z).toBeCloseTo(200.4);
    expect(camera.position.x).toBeGreaterThan(100.1);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
