import { describe, it, expect } from "vitest";
import {
  addItem,
  equipWearable,
  gridItems,
  isOverweight,
  newInventory,
  sortInventory,
  syncEquipmentInventory,
  transfer,
  unequipWearable,
  validateInventory,
  weight,
} from "../src/simulation/inventory";
import { Simulation } from "../src/simulation/simulation";
import { createWorld } from "../src/simulation/state";
import { deserialize, serialize } from "../src/save/storage";

describe("playtest wearable inventory", () => {
  it("imports legacy saves, frees worn cells, and expands backpack exactly once", () => {
    const old = createWorld("gear-old");
    old.player.inventory.height = 8;
    delete old.player.inventory.baseHeight;
    delete old.player.inventory.equippedUids;
    const beforeWeight = weight(old.player.inventory);
    const ids = old.player.inventory.items.map((i) => i.uid);
    const loaded = deserialize(serialize(old));
    const inv = loaded.player.inventory;
    expect(inv.height).toBe(12);
    expect(gridItems(inv).map((i) => i.id)).toEqual(["knife", "water"]);
    expect(weight(inv)).toBe(beforeWeight);
    expect(inv.items.map((i) => i.uid)).toEqual(ids);
    expect(loaded.player.quickSlots).toEqual(old.player.quickSlots);
    expect(deserialize(serialize(loaded)).player.inventory).toEqual(inv);
  });
  it("wearing frees real cells, swaps and removal preserve every UID and total weight", () => {
    const player = { inventory: newInventory(2, 4), equipment: {} };
    addItem(player.inventory, "jacket");
    addItem(player.inventory, "jacket");
    const [a, b] = player.inventory.items;
    const kg = weight(player.inventory);
    expect(equipWearable(player, a!.uid)).toBe(true);
    expect(addItem(player.inventory, "boots")).toBe(true);
    expect(equipWearable(player, b!.uid)).toBe(true);
    expect(gridItems(player.inventory).some((i) => i.uid === a!.uid)).toBe(
      true,
    );
    const before = structuredClone(player);
    expect(unequipWearable(player, "chest")).toBe(false);
    expect(player).toEqual(before);
    expect(weight(player.inventory)).toBeGreaterThan(kg);
    expect(validateInventory(player.inventory)).toBe(true);
    expect(sortInventory(player.inventory)).toBe(true);
    expect(gridItems(player.inventory)).toHaveLength(2);
  });
  it("backpack capacity admits extra loot and rejects overflow removal without losing items", () => {
    const player = { inventory: newInventory(2, 2), equipment: {} };
    addItem(player.inventory, "backpack");
    const backpack = player.inventory.items[0]!;
    expect(equipWearable(player, backpack.uid)).toBe(true);
    expect(player.inventory.height).toBe(6);
    for (let n = 0; n < 3; n++)
      expect(addItem(player.inventory, "jacket")).toBe(true);
    const before = structuredClone(player);
    expect(unequipWearable(player, "back")).toBe(false);
    expect(player).toEqual(before);
    expect(transfer(player.inventory, newInventory(), backpack.uid)).toBe(
      false,
    );
    expect(player).toEqual(before);
  });
  it("can remove and re-equip an empty backpack without accumulating capacity", () => {
    const player = { inventory: newInventory(2, 2), equipment: {} };
    addItem(player.inventory, "backpack");
    const uid = player.inventory.items[0]!.uid;
    for (let n = 0; n < 3; n++) {
      expect(equipWearable(player, uid)).toBe(true);
      expect(player.inventory.height).toBe(6);
      expect(unequipWearable(player, "back")).toBe(true);
      expect(player.inventory.height).toBe(2);
      expect(validateInventory(player.inventory)).toBe(true);
    }
  });
  it("accepts exact weight boundary including float rounding but rejects excess", () => {
    const inv = newInventory();
    // Material weights are configurable: derive quantity from the current definition.
    for (let n = 0; n < 95; n++) expect(addItem(inv, "stone")).toBe(true);
    expect(weight(inv)).toBeCloseTo(38);
    expect(isOverweight(inv)).toBe(false);
    expect(addItem(inv, "nails")).toBe(true);
    expect(isOverweight(inv)).toBe(true);
  });
  it("actual use toggles worn equipment and dropping cannot duplicate it", () => {
    const sim = new Simulation(createWorld("gear-actions"));
    const p = sim.state.player;
    const jacket = p.inventory.items.find((i) => i.id === "jacket")!;
    const before = Object.keys(sim.state.containers).length;
    expect(sim.actions.drop(jacket.uid)).toBe(false);
    expect(Object.keys(sim.state.containers)).toHaveLength(before);
    expect(sim.actions.use(jacket.uid)).toBe(true);
    expect(gridItems(p.inventory).some((i) => i.uid === jacket.uid)).toBe(true);
    expect(sim.actions.use(jacket.uid)).toBe(true);
    expect(gridItems(p.inventory).some((i) => i.uid === jacket.uid)).toBe(
      false,
    );
    expect(deserialize(serialize(sim.state)).player).toEqual(p);
  });
  it("respawn releases every worn item into a valid retrievable death bag", () => {
    const sim = new Simulation(createWorld("gear-respawn"));
    const original = sim.state.player.inventory.items.map((i) => i.uid);
    expect(sim.actions.respawn()).toBe(true);
    const bag = Object.values(sim.state.containers).find((c) =>
      c.id.startsWith("deathbag"),
    )!;
    expect(bag.inventory.equippedUids).toBeUndefined();
    expect(
      gridItems(bag.inventory)
        .map((i) => i.uid)
        .sort(),
    ).toEqual(original.sort());
    expect(validateInventory(bag.inventory)).toBe(true);
    const backpack = bag.inventory.items.find((i) => i.id === "backpack")!;
    expect(
      transfer(bag.inventory, sim.state.player.inventory, backpack.uid),
    ).toBe(true);
    expect(deserialize(serialize(sim.state)).player).toEqual(sim.state.player);
  });
  it("rejects forged worn IDs and invalid clothing assignments", () => {
    const inv = newInventory();
    addItem(inv, "knife");
    inv.equippedUids = [inv.items[0]!.uid];
    expect(validateInventory(inv)).toBe(false);
    inv.equippedUids = ["missing"];
    expect(validateInventory(inv)).toBe(false);
    expect(
      syncEquipmentInventory({ inventory: newInventory(), equipment: {} }),
    ).toBe(true);
  });
});
