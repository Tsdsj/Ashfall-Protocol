import { expect, it } from "vitest";
import { Simulation } from "../src/simulation/simulation";
import { createWorld } from "../src/simulation/state";
import { exploredCells } from "../src/simulation/exploration";
import { deserialize, serialize } from "../src/save/storage";
import { mapView } from "../src/ui/world-views";
it("offers one-click full-map reveal only in creative mode without awarding story discoveries", () => {
  const normal = new Simulation(createWorld("survival-map"));
  expect(mapView(normal)).not.toContain('data-map-control="reveal"');
  const state = createWorld("creative-map");
  state.flags.push("creative-mode");
  const sim = new Simulation(state) as Simulation & {
    revealCreativeMap(): boolean;
  };
  expect(mapView(sim)).toContain('data-map-control="reveal"');
  expect(sim.revealCreativeMap()).toBe(true);
  expect(exploredCells(state).size).toBe(4096);
  expect(state.discovered).toHaveLength(0);
  expect(exploredCells(deserialize(serialize(state))).size).toBe(4096);
});
it("teleports to an exact safe map location, clears stale movement and rejects survival or invalid coordinates", () => {
  const state = createWorld("creative-teleport");
  state.flags.push("creative-mode");
  const sim = new Simulation(state) as Simulation & {
    teleportCreative(x: number, z: number): boolean;
  };
  expect(typeof sim.teleportCreative).toBe("function");
  sim.verticalVelocity = -50;
  expect(sim.teleportCreative(600, 400)).toBe(true);
  expect(state.player.position.x).toBe(600);
  expect(state.player.position.z).toBe(400);
  expect(state.player.position.y).toBeGreaterThanOrEqual(
    sim.collision.ground(600, 400),
  );
  expect(sim.verticalVelocity).toBe(0);
  const before = { ...state.player.position };
  expect(sim.teleportCreative(NaN, 0)).toBe(false);
  expect(sim.teleportCreative(3000, 0)).toBe(false);
  expect(state.player.position).toEqual(before);
  state.flags = state.flags.filter((f) => f !== "creative-mode");
  expect(sim.teleportCreative(0, 0)).toBe(false);
  expect(state.player.position).toEqual(before);
});
