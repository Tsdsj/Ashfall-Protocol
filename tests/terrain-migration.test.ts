import { expect, it } from "vitest";
import { createWorld } from "../src/simulation/state";
import { deserialize, serialize } from "../src/save/storage";
import {
  legacyTerrainHeight,
  TERRAIN_REVISION,
} from "../src/save/terrain-migration";
import { WorldGenerator } from "../src/world/generator";
import { newInventory } from "../src/simulation/inventory";
it("lifts legacy camps and supported objects once, preserving the stacked building and contents", () => {
  const s = createWorld("ashfall"),
    gen = new WorldGenerator(s.seed);
  s.flags = s.flags.filter((f) => f !== TERRAIN_REVISION);
  const position = { x: -104, y: legacyTerrainHeight(gen, -104, 88), z: 88 };
  expect(position.y).toBeCloseTo(-5.833144893445993);
  const base = {
    id: "build:1",
    kind: "foundation",
    position: { ...position },
    rotation: 0,
    health: 100,
    fuel: 0,
    active: false,
    growth: 0,
    plantedAt: 0,
  };
  s.structures.push(
    base,
    {
      ...base,
      id: "build:2",
      kind: "floor",
      position: { x: -102, y: position.y + 3.22, z: 88 },
    },
    {
      ...base,
      id: "build:3",
      kind: "workbench",
      position: { x: -103, y: position.y + 0.22, z: 88 },
      inventory: newInventory(),
    },
  );
  s.player.position = { ...position };
  s.player.spawn = { ...position };
  s.containers["drop:1"] = {
    id: "drop:1",
    name: "旧背包",
    type: "dropped",
    position: { ...position },
    inventory: newInventory(),
    searched: true,
    openedAt: 0,
  };
  const upgraded = deserialize(serialize(s)),
    ground = gen.height(-104, 88);
  expect(upgraded.structures[0]!.position.y).toBeCloseTo(ground);
  expect(upgraded.structures[1]!.position.y).toBeCloseTo(ground + 3.22);
  expect(upgraded.structures[2]!.position.y).toBeCloseTo(ground + 0.22);
  expect(upgraded.player.position.y).toBeCloseTo(ground);
  expect(upgraded.player.spawn.y).toBeCloseTo(ground);
  expect(upgraded.containers["drop:1"]!.position.y).toBeCloseTo(ground);
  expect(deserialize(serialize(upgraded))).toEqual(upgraded);
});
it("leaves authored underground floors and new-world saves in place", () => {
  const s = createWorld("ashfall");
  expect(deserialize(serialize(s))).toEqual(s);
  s.flags = s.flags.filter((f) => f !== TERRAIN_REVISION);
  s.player.position = { x: -104, y: -35, z: 88 };
  expect(deserialize(serialize(s)).player.position.y).toBe(-35);
});

it("keeps adjacent legacy foundations and their walls connected", () => {
  const s = createWorld("ashfall"),
    gen = new WorldGenerator(s.seed);
  s.flags = s.flags.filter((f) => f !== TERRAIN_REVISION);
  const b = {
    id: "build:1",
    kind: "foundation",
    position: { x: -8, y: 0, z: 152 },
    rotation: 0,
    health: 100,
    fuel: 0,
    active: false,
    growth: 0,
    plantedAt: 0,
  };
  expect(legacyTerrainHeight(gen, -8, 152)).toBe(0);
  expect(legacyTerrainHeight(gen, -8, 156)).toBe(0);
  s.structures.push(
    b,
    { ...b, id: "build:2", position: { x: -8, y: 0, z: 156 } },
    { ...b, id: "build:3", kind: "wall", position: { x: -8, y: 0.22, z: 158 } },
  );
  const loaded = deserialize(serialize(s));
  const lift = Math.max(gen.height(-8, 152), gen.height(-8, 156));
  expect(loaded.structures[0]!.position.y).toBeCloseTo(lift);
  expect(loaded.structures[1]!.position.y).toBeCloseTo(lift);
  expect(loaded.structures[2]!.position.y).toBeCloseTo(lift + 0.22);
});
