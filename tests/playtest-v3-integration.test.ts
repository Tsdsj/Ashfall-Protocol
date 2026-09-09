import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation/simulation";
import { createWorld, DEFAULT_SETTINGS } from "../src/simulation/state";
import { LocomotionController } from "../src/simulation/locomotion";
import { addItem, countItem, newInventory } from "../src/simulation/inventory";
import { craftingView } from "../src/ui/crafting-view";
import { narrativeJournal, conversationView } from "../src/ui/narrative-view";
import { newGameView } from "../src/ui/views";
import { serialize, deserialize } from "../src/save/storage";

describe("coherent story and navigation", () => {
  it("introduces the player and people, follows the next lead, and respects manual navigation", () => {
    const state = createWorld("guided-story");
    state.narrative.seenSequences.push("opening");
    const sim = new Simulation(state);
    sim.state.actors = {};
    const n = sim.narrative;
    expect(n.mainLead?.id).toBe("ranger-supplies");
    expect(sim.state.waypoint).toEqual(n.mainLead?.position);
    expect(narrativeJournal(sim, "briefing")).toContain("随车维修员");
    expect(narrativeJournal(sim, "people")).toContain("诊所护士");
    expect(conversationView(sim, "米拉")).toContain("主要联络人");
    for (const id of ["ranger-supplies", "ranger-shelter", "ranger-radio"]) {
      sim.state.player.position = { ...n.mainLead!.position };
      expect(n.interact(id)).toBe(true);
      n.update(0);
    }
    expect(n.mainLead?.id).toBe("medical-record");
    sim.state.player.position = { ...n.mainLead!.position };
    n.stopTrackingMainLead();
    sim.state.waypoint = { x: 100, y: 0, z: 100 };
    expect(n.interact("medical-record")).toBe(true);
    n.update(0);
    expect(n.mainLead?.id).toBe("missing-record");
    expect(sim.state.waypoint.x).toBe(100);
    n.trackMainLead();
    expect(sim.state.waypoint).toEqual(n.mainLead?.position);
  });
});
describe("creative practice", () => {
  it("is explicitly selected, persists, permits supplies/flight and remains unavailable in survival", () => {
    expect(newGameView()).toContain('name="creative"');
    const normal = new Simulation(createWorld("normal"));
    expect(normal.giveCreative("rifle")).toBe(false);
    const state = createWorld("creative");
    state.flags.push("creative-mode");
    const sim = new Simulation(state);
    expect(sim.god).toBe(true);
    expect(sim.giveCreative("stone", 5)).toBe(true);
    expect(countItem(state.player.inventory, "stone")).toBe(5);
    expect(sim.giveCreative("__proto__", 1)).toBe(false);
    expect(sim.toggleFlight()).toBe(true);
    const y = state.player.position.y;
    sim.update(0.05, {
      forward: 0,
      side: 0,
      jump: true,
      brake: false,
      sprint: false,
    });
    expect(state.player.position.y).toBeGreaterThan(y);
    sim.update(0.05, {
      forward: 0,
      side: 0,
      jump: false,
      descend: true,
      brake: false,
      sprint: false,
    });
    expect(state.player.position.y).toBeCloseTo(y);
    const loaded = new Simulation(deserialize(serialize(state)));
    expect(loaded.creative && loaded.flying && loaded.god).toBe(true);
  });
});
it("keeps 38kg at the normal movement boundary and makes sprint duration practical", () => {
  const motion = new LocomotionController();
  const input = {
    forward: 1,
    side: 0,
    yaw: 0,
    stance: "stand" as const,
    sprint: true,
    walk: false,
    aiming: false,
    swimming: false,
    weight: 38,
    stamina: 100,
    fracture: false,
    temperature: 37,
    grounded: true,
  };
  motion.step(1 / 60, input);
  expect(motion.gait).toBe("sprint");
  expect(motion.targetSpeed).toBe(6.3);
  motion.step(1 / 60, { ...input, weight: 38.1 });
  expect(motion.gait).not.toBe("sprint");
  expect(DEFAULT_SETTINGS.keys.sprint).toBe("ShiftLeft");
});
it("uses one crafting status for output room and required station rather than claiming missing materials", () => {
  const sim = new Simulation(createWorld("craft-reasons"));
  sim.state.player.inventory = newInventory(1, 1);
  sim.state.player.equipment = {};
  addItem(sim.state.player.inventory, "cloth", 2);
  const rope = sim.recipes.find((r) => r.output === "rope")!;
  expect(sim.craftStatus(rope.id).ok).toBe(true);
  const bench = sim.recipes.find((r) => r.station === "workbench")!;
  expect(sim.craftStatus(bench.id).reason).toContain("工作台");
  expect(craftingView(sim, "全部", bench.id)).toContain(
    sim.craftStatus(bench.id).reason,
  );
});
