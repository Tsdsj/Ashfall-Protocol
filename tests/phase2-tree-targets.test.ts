import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { GameRenderer } from "../src/rendering/renderer";
import { EffectsRenderer } from "../src/rendering/effects";
import { createWorld } from "../src/simulation/state";
import { Simulation } from "../src/simulation/simulation";
import { spawnActor } from "../src/simulation/population";

function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new UniversalCamera(
    "target-test",
    new Vector3(0, 1.68, 0),
    scene,
  );
  camera.setTarget(new Vector3(0, 1.68, 10));
  const sim = new Simulation(createWorld("tree-targets"));
  sim.state.actors = {};
  vi.spyOn(sim.collision, "ray").mockReturnValue({
    distance: 2,
    normal: { x: 0, y: 0, z: -1 },
    collider: {
      id: "tree:0,0:0",
      minX: -0.2,
      maxX: 0.2,
      minY: 0,
      maxY: 4,
      minZ: 2,
      maxZ: 2.4,
      material: "wood",
    },
  });
  vi.spyOn(sim.collision, "visible").mockReturnValue(true);
  const mesh = MeshBuilder.CreateBox(
    "foreground",
    { width: 0.6, height: 1.8, depth: 0.4 },
    scene,
  );
  mesh.position.set(0, 1, 1);
  mesh.computeWorldMatrix(true);
  const ctx = {
    scene,
    camera,
    sim,
    menuMode: false,
    world: { chunks: new Map() },
    narrativeWorld: { target: () => null },
    eventWorld: { target: () => null },
  } as unknown as GameRenderer;
  return {
    scene,
    engine,
    camera,
    sim,
    mesh,
    target: () => GameRenderer.prototype.target.call(ctx),
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}
afterEach(() => vi.restoreAllMocks());
describe("tree interaction occlusion", () => {
  it("selects the foreground corpse instead of a tree behind it", () => {
    const s = setup();
    try {
      const a = spawnActor(s.sim, "corpse", "boar", { x: 0, y: 0, z: 1 });
      a.health = 0;
      s.mesh.metadata = { actorId: a.id };
      expect(s.target()?.id).toBe(a.id);
    } finally {
      s.dispose();
    }
  });
  it("does not label a live foreground animal as the tree behind it", () => {
    const s = setup();
    try {
      const a = spawnActor(s.sim, "living", "boar", { x: 0, y: 0, z: 1 });
      s.mesh.metadata = { actorId: a.id };
      expect(s.target()).toBeNull();
    } finally {
      s.dispose();
    }
  });
  it("selects a foreground container but not one behind the tree", () => {
    const s = setup();
    try {
      s.mesh.metadata = {
        interaction: {
          id: "box",
          type: "container",
          name: "补给箱",
          position: { x: 0, y: 1, z: 1 },
        },
      };
      expect(s.target()?.id).toBe("box");
      s.mesh.position.z = 3;
      s.mesh.computeWorldMatrix(true);
      expect(s.target()?.id).toBe("tree:0,0:0");
    } finally {
      s.dispose();
    }
  });
  it("keeps the corpse fallback ahead of a tree when its animated mesh was missed", () => {
    const s = setup();
    try {
      s.mesh.setEnabled(false);
      const a = spawnActor(s.sim, "corpse-fallback", "boar", {
        x: 0,
        y: 0,
        z: 1,
      });
      a.health = 0;
      s.camera.setTarget(new Vector3(0, 1.08, 0.825));
      expect(s.target()?.id).toBe(a.id);
    } finally {
      s.dispose();
    }
  });
  it("uses chips for axe contact instead of leaving a bullet decal after felling", () => {
    const s = setup();
    try {
      const decals: unknown[] = [];
      const ctx = {
        scene: s.scene,
        sim: s.sim,
        sparks: [],
        decals,
        mats: { simple: () => new StandardMaterial("mark", s.scene) },
      } as unknown as EffectsRenderer;
      EffectsRenderer.prototype.event.call(ctx, {
        type: "hit",
        kind: "wall",
        text: "wood",
        material: "wood",
        weapon: "hatchet",
        position: { x: 0, y: 1, z: 1 },
        normal: { x: 0, y: 0, z: -1 },
      });
      expect(decals).toHaveLength(0);
      EffectsRenderer.prototype.event.call(ctx, {
        type: "hit",
        kind: "wall",
        text: "wood",
        material: "wood",
        weapon: "pistol",
        position: { x: 0, y: 1, z: 1 },
        normal: { x: 0, y: 0, z: -1 },
      });
      expect(decals).toHaveLength(1);
    } finally {
      s.dispose();
    }
  });
});
