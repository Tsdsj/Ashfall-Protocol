import { expect, it, vi } from "vitest";
import { Simulation } from "../src/simulation/simulation";
import { createWorld, DEFAULT_SETTINGS } from "../src/simulation/state";
import { addItem, countItem } from "../src/simulation/inventory";
import { FirstPersonMotionController } from "../src/rendering/first-person-motion";
import { weaponLayers } from "../src/audio/palette";

function setup(count = 4) {
  const sim = new Simulation(createWorld("grenade-playtest"));
  sim.state.player.inventory.items = [];
  addItem(sim.state.player.inventory, "grenade", count);
  const stacks = sim.state.player.inventory.items;
  sim.state.player.selected = 0;
  sim.state.player.quickSlots[0] = stacks.at(-1)!.uid;
  return sim;
}
const origin = { x: 100, y: 30, z: 100 },
  direction = { x: 0, y: 0, z: 1 };
it("consumes the selected stack at first release, clears only its exhausted shortcuts, and rejects duplicate input", () => {
  const sim = setup(),
    p = sim.state.player,
    selected = p.quickSlots[0];
  p.quickSlots[1] = selected;
  p.quickSlots[2] = p.inventory.items[0]!.uid;
  const feedback: string[] = [];
  sim.bus.on((e) => {
    if (e.type === "motion") feedback.push(e.text);
  });
  expect(sim.combat.throw(origin, direction)).toBe(true);
  expect(countItem(p.inventory, "grenade")).toBe(3);
  expect(p.inventory.items[0]!.count).toBe(3);
  expect(p.inventory.items.some((s) => s.uid === selected)).toBe(false);
  expect(p.quickSlots.slice(0, 2)).toEqual([null, null]);
  expect(p.quickSlots[2]).toBe(p.inventory.items[0]!.uid);
  expect(sim.combat.grenades).toHaveLength(1);
  expect(sim.combat.throw(origin, direction)).toBe(false);
  expect(countItem(p.inventory, "grenade")).toBe(3);
  expect(feedback).toEqual(["throw"]);
  sim.combat.update(0.66);
  expect(sim.combat.throw(origin, direction)).toBe(true);
  expect(countItem(p.inventory, "grenade")).toBe(2);
});
it("moves a live grenade, detonates exactly once after its fuse, and does not create feedback without inventory", () => {
  const sim = setup(1),
    detonate = vi.spyOn(sim.combat, "detonate").mockImplementation(() => {});
  sim.combat.throw(origin, direction);
  sim.combat.update(0.2);
  expect(sim.combat.grenades[0]!.position.z).toBeGreaterThan(origin.z);
  sim.combat.update(2.81);
  sim.combat.update(0.2);
  expect(detonate).toHaveBeenCalledTimes(1);
  expect(sim.combat.grenades).toHaveLength(0);
  expect(sim.combat.throw(origin, direction)).toBe(false);
});
it("plays a bounded throw gesture even when the final grenade leaves the hand", () => {
  const sim = setup(1),
    motion = new FirstPersonMotionController();
  sim.bus.on((e) => motion.feedback(e));
  motion.update(1 / 60, sim, DEFAULT_SETTINGS, false, 0);
  sim.combat.throw(origin, direction);
  motion.update(0.15, sim, DEFAULT_SETTINGS, false, 0);
  expect(motion.pose.interactionKind).toBe("throw");
  expect(motion.pose.interaction).toBeGreaterThan(0.4);
  motion.update(0.6, sim, DEFAULT_SETTINGS, false, 0);
  expect(motion.pose.interaction).toBe(0);
});
it("keeps combat samples within gain headroom and makes blasts audible beyond a few metres", () => {
  for (const kind of ["pistol", "rifle", "shotgun", "smg", "explosion"])
    for (const layer of weaponLayers(kind))
      expect(layer.volume).toBeLessThanOrEqual(1);
  const blast = weaponLayers("explosion")[0]!;
  const at30m = blast.volume / (1 + 1.2 * (30 / blast.refDistance! - 1));
  expect(at30m).toBeGreaterThan(0.35);
});
