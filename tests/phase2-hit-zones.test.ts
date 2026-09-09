import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  rayActorZones,
  rayCapsule,
  type HitZone,
} from "../src/simulation/hit-zones";
import {
  rotateBoneToward,
  setBoneWorldRotation,
} from "../src/rendering/rig-animation";

describe("姿态命中区域", () => {
  const zone: HitZone = {
    part: "chest",
    a: { x: 0, y: 0, z: 3 },
    b: { x: 0, y: 1, z: 3 },
    radius: 0.2,
  };
  it("有限胶囊分别覆盖侧面和球形端点，忽略背后和射程外碰撞", () => {
    expect(
      rayCapsule({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: 1 }, zone, 5),
    ).toBeCloseTo(2.8);
    expect(
      rayCapsule({ x: 0, y: 2, z: 3 }, { x: 0, y: -1, z: 0 }, zone, 5),
    ).toBeCloseTo(0.8);
    expect(
      rayCapsule({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: -1 }, zone, 5),
    ).toBeNull();
    expect(
      rayCapsule({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: 1 }, zone, 2),
    ).toBeNull();
    expect(
      rayCapsule({ x: 0, y: 0.5, z: 3 }, { x: 0, y: 0, z: 1 }, zone, 5),
    ).toBe(0);
  });
  it("跟随弯腰后的头部与肢体位置，以最近接触点判定部位", () => {
    const head: HitZone = {
      part: "head",
      a: { x: 0, y: 1.3, z: 2.6 },
      b: { x: 0, y: 1.3, z: 2.6 },
      radius: 0.15,
    };
    const chest: HitZone = {
      part: "chest",
      a: { x: 0, y: 0.8, z: 3 },
      b: { x: 0, y: 1.1, z: 2.9 },
      radius: 0.19,
    };
    expect(
      rayActorZones(
        { x: 0, y: 1.3, z: 0 },
        { x: 0, y: 0, z: 1 },
        [chest, head],
        5,
      )?.part,
    ).toBe("head");
    expect(
      rayActorZones(
        { x: 0, y: 0.8, z: 0 },
        { x: 0, y: 0, z: 1 },
        [head, chest],
        5,
      )?.part,
    ).toBe("chest");
    expect(
      rayActorZones(
        { x: 0, y: 1.7, z: 0 },
        { x: 0, y: 0, z: 1 },
        [head, chest],
        5,
      ),
    ).toBeNull();
  });
});
describe("反射 glTF 坐标下的骨骼 IK", () => {
  it("负缩放父级中仍对准世界目标，保持骨长与末端原朝向", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      root = new TransformNode("reflected", scene),
      upper = new TransformNode("upper", scene),
      hand = new TransformNode("hand", scene);
    root.scaling.set(1, 1, -1);
    root.rotation.y = 0.7;
    upper.parent = root;
    hand.parent = upper;
    upper.rotationQuaternion = Quaternion.Identity();
    hand.rotationQuaternion = Quaternion.Identity();
    hand.position.set(0, 1, 0);
    const orientation = hand.computeWorldMatrix(true).clone();
    const target = new Vector3(0.6, 0.5, -0.3).normalize();
    rotateBoneToward(upper, hand, target);
    expect(
      Vector3.Distance(hand.computeWorldMatrix(true).getTranslation(), target),
    ).toBeLessThan(1e-6);
    setBoneWorldRotation(hand, orientation);
    const actual = hand.computeWorldMatrix(true);
    for (const axis of [Vector3.Up(), Vector3.Right(), Vector3.Forward()])
      expect(
        Vector3.Distance(
          Vector3.TransformNormal(axis, actual).normalize(),
          Vector3.TransformNormal(axis, orientation).normalize(),
        ),
      ).toBeLessThan(1e-6);
    expect(actual.determinant()).toBeLessThan(0);
    scene.dispose();
    engine.dispose();
  });
});
