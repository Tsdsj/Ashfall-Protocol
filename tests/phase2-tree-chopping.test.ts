import { describe, expect, it } from "vitest";
import { createWorld } from "../src/simulation/state";
import { Simulation } from "../src/simulation/simulation";
import { scatterTrees } from "../src/world/scatter";
import { addItem, countItem, newInventory } from "../src/simulation/inventory";
import { deserialize, serialize } from "../src/save/storage";
import { ITEMS } from "../src/data/items";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { EnvironmentAssetLibrary } from "../src/rendering/environment-assets";

function setup(item = "hatchet", full = false) {
  const sim = new Simulation(createWorld("tree-harvest-regression"));
  sim.state.actors = {};
  const tree = scatterTrees(sim.gen, -1, -1).find((tree) => {
    const p = { ...tree.position, z: tree.position.z - 1.5 };
    const hit = sim.collision.ray(
      { ...p, y: p.y + 1.68 },
      { x: 0, y: 0, z: 1 },
      2.6,
    );
    return (
      hit?.collider.id === tree.id &&
      !sim.collision.blocked(p.x, p.y, p.z, 0.31, 1.75)
    );
  })!;
  expect(tree).toBeDefined();
  sim.state.player.position = { ...tree.position, z: tree.position.z - 1.5 };
  sim.state.player.yaw = 0;
  sim.state.player.pitch = 0;
  sim.state.player.inventory = full
    ? newInventory(ITEMS[item]!.width, ITEMS[item]!.height)
    : newInventory();
  expect(addItem(sim.state.player.inventory, item, 1)).toBe(true);
  sim.state.player.quickSlots = [
    sim.state.player.inventory.items[0]!.uid,
    null,
    null,
    null,
    null,
  ];
  sim.state.player.selected = 0;
  sim.state.player.equipment = {};
  const strike = () => {
    const p = sim.state.player.position;
    expect(sim.combat.fire({ ...p, y: p.y + 1.68 }, { x: 0, y: 0, z: 1 })).toBe(
      true,
    );
    sim.combat.update(1);
  };
  return { sim, tree, strike };
}

describe("axe hits on real forest trees", () => {
  it("collects wood on the fourth contact frame, removes collision and cannot award twice", () => {
    const { sim, tree, strike } = setup();
    for (let n = 1; n <= 3; n++) {
      strike();
      expect(sim.combat.treeProgress(tree.id)).toBe(n);
      expect(countItem(sim.state.player.inventory, "wood")).toBe(0);
    }
    strike();
    expect(countItem(sim.state.player.inventory, "wood")).toBe(7);
    expect(sim.state.destroyed.filter((id) => id === tree.id)).toHaveLength(1);
    expect(
      sim.collision
        .nearby(tree.position.x, tree.position.z, 3)
        .some((c) => c.id === tree.id),
    ).toBe(false);
    strike();
    expect(countItem(sim.state.player.inventory, "wood")).toBe(7);
  });
  it("does not grant wood before the axe contacts the trunk or from a knife", () => {
    const { sim, tree } = setup();
    const p = sim.state.player.position;
    sim.combat.fire({ ...p, y: p.y + 1.68 }, { x: 0, y: 0, z: 1 });
    sim.combat.update(0.05);
    expect(sim.combat.treeProgress(tree.id)).toBe(0);
    const knife = setup("knife");
    knife.strike();
    expect(knife.sim.combat.treeProgress(knife.tree.id)).toBe(0);
    expect(countItem(knife.sim.state.player.inventory, "wood")).toBe(0);
  });
  it("keeps the tree and final chop available when the backpack cannot hold the reward", () => {
    const { sim, tree, strike } = setup("hatchet", true);
    for (let n = 0; n < 4; n++) strike();
    expect(sim.state.destroyed).not.toContain(tree.id);
    expect(sim.combat.treeProgress(tree.id)).toBe(3);
    sim.state.player.inventory.width += 4;
    sim.state.player.inventory.height += 4;
    strike();
    expect(countItem(sim.state.player.inventory, "wood")).toBe(7);
    expect(sim.state.destroyed).toContain(tree.id);
  });
  it("preserves felled trees and collected wood after a real save round-trip", () => {
    const { sim, tree, strike } = setup();
    for (let n = 0; n < 4; n++) strike();
    const restored = new Simulation(deserialize(serialize(sim.state)));
    expect(restored.state.destroyed).toContain(tree.id);
    expect(countItem(restored.state.player.inventory, "wood")).toBe(7);
    expect(
      restored.collision
        .nearby(tree.position.x, tree.position.z, 3)
        .some((c) => c.id === tree.id),
    ).toBe(false);
  });
  it("removes the matching thin instance across LOD selection without changing its neighbour", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      library = new EnvironmentAssetLibrary(scene);
    const source = MeshBuilder.CreateBox("tree-test", {}, scene);
    const meshes = library.instances(
      [source],
      [Matrix.Translation(0, 0, 0), Matrix.Translation(10, 0, 0)],
      "tree-batch",
      0,
      100,
      ["tree:a", "tree:b"],
    );
    expect(meshes[0]!.thinInstanceCount).toBe(2);
    library.hideInstances(new Set(["tree:a"]));
    library.updateFocus({ x: 10, y: 0, z: 0 });
    expect(meshes[0]!.thinInstanceCount).toBe(1);
    expect(meshes[0]!.thinInstanceGetWorldMatrices()[0]!.m[12]).toBe(10);
    library.dispose();
    source.dispose();
    scene.dispose();
    engine.dispose();
  });
});
