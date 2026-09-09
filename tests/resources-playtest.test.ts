import { ITEMS } from "../src/data/items";
import { expect, it } from "vitest";
import type { Interaction } from "../src/core/types";
import { WorldGenerator } from "../src/world/generator";
import { Simulation } from "../src/simulation/simulation";
import { createWorld } from "../src/simulation/state";
import { addItem, countItem } from "../src/simulation/inventory";
import { deserialize, serialize } from "../src/save/storage";
function target(
  r: ReturnType<WorldGenerator["resources"]>[number],
): Interaction {
  return {
    id: r.id,
    name: r.resource,
    type: "resource",
    resource: r.resource,
    position: { x: r.x, y: 0, z: r.z },
  };
}
it("guarantees visible ranger starter materials and stable unique IDs in the correct chunks", () => {
  for (const seed of ["ashfall", "starter-1", "starter-2"]) {
    const gen = new WorldGenerator(seed),
      resources = gen.resources(0, 0);
    const starter = resources.filter((r) => r.id.startsWith("starter-ranger"));
    expect(starter.map((r) => r.resource).sort()).toEqual([
      "cloth",
      "scrap",
      "stone",
      "wood",
    ]);
    expect(new Set(resources.map((r) => r.id)).size).toBe(resources.length);
    expect(gen.resources(0, 0)).toEqual(resources);
    for (const r of starter)
      expect(Math.hypot(r.x - 14, r.z - 16)).toBeLessThan(20);
    expect(
      gen
        .resources(-1, -1)
        .filter((r) => r.id.startsWith("starter"))
        .map((r) => r.id),
    ).toEqual(["starter-wood", "starter-stone", "starter-wood2"]);
  }
});
it("lets a bare-handed player collect finite materials, weave rope and make a working pickaxe", () => {
  const sim = new Simulation(createWorld("resource-route")),
    p = sim.state.player;
  p.inventory.items = [];
  p.quickSlots.fill(null);
  for (const r of sim.gen
    .resources(0, 0)
    .filter((r) => r.id.startsWith("starter-ranger"))) {
    expect(sim.actions.gather(target(r))).toBe(true);
    expect(sim.actions.gather(target(r))).toBe(false);
  }
  expect(countItem(p.inventory, "stone")).toBe(3);
  expect(countItem(p.inventory, "cloth")).toBe(2);
  expect(sim.startCraft("rope")).toBe(true);
  sim.tickCraft(3);
  expect(countItem(p.inventory, "rope")).toBe(1);
  expect(sim.startCraft("pickaxe")).toBe(true);
  sim.tickCraft(3);
  const pickaxe = p.inventory.items.find((i) => i.id === "pickaxe")!;
  expect(pickaxe).toBeDefined();
  p.quickSlots[p.selected] = pickaxe.uid;
  const stone = target(
    sim.gen.resources(-1, -1).find((r) => r.id === "starter-stone")!,
  );
  expect(sim.actions.gather(stone)).toBe(true);
  expect(countItem(p.inventory, "stone")).toBe(10);
  expect(p.inventory.items.find((i) => i.uid === pickaxe.uid)!.durability).toBe(
    99,
  );
  const reloaded = new Simulation(deserialize(serialize(sim.state))!);
  expect(reloaded.actions.gather(stone)).toBe(false);
  expect(countItem(reloaded.state.player.inventory, "stone")).toBe(10);
});
it("requires a usable equipped pickaxe for its bonus and leaves resources untouched when inventory is full", () => {
  const sim = new Simulation(createWorld("pickaxe-rules")),
    p = sim.state.player;
  p.inventory.items = [];
  addItem(p.inventory, "pickaxe");
  const tool = p.inventory.items.find((i) => i.id === "pickaxe")!;
  p.quickSlots[p.selected] = tool.uid;
  tool.durability = 0;
  const stone = { id: "test-stone", resource: "stone", x: 0, z: 0 };
  expect(sim.actions.gather(target(stone))).toBe(true);
  expect(countItem(p.inventory, "stone")).toBe(3);
  p.inventory.items.find((i) => i.uid === tool.uid)!.durability = 50;
  p.inventory.items.find((i) => i.id === "stone")!.count =
    ITEMS.stone!.maxStack;
  while (addItem(p.inventory, "pickaxe")) {
    /* fill the remaining grid */
  }
  while (addItem(p.inventory, "stone")) {
    /* fill single-cell gaps */
  }
  expect(sim.actions.gather(target({ ...stone, id: "full-stone" }))).toBe(
    false,
  );
  expect(sim.state.destroyed).not.toContain("full-stone");
  expect(p.inventory.items.find((i) => i.uid === tool.uid)!.durability).toBe(
    50,
  );
});

it("lets an equipped pickaxe extract ore without a shovel or hatchet", () => {
  const sim = new Simulation(createWorld("pickaxe-ore")),
    p = sim.state.player;
  p.inventory.items = [];
  const ore = target({ id: "test-ore", resource: "ore", x: 0, z: 0 });
  expect(sim.actions.gather(ore)).toBe(false);
  expect(sim.state.destroyed).not.toContain(ore.id);
  addItem(p.inventory, "pickaxe");
  p.quickSlots[p.selected] = p.inventory.items[0]!.uid;
  expect(sim.actions.gather(ore)).toBe(true);
  expect(countItem(p.inventory, "ore")).toBe(4);
  expect(sim.actions.gather(ore)).toBe(false);
});
