import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { expect, it, vi } from "vitest";
import {
  horizonIndices,
  HORIZON_SEGMENTS,
  HORIZON_SIZE,
} from "../src/world/terrain-data";
import { Simulation } from "../src/simulation/simulation";
import { createWorld, DEFAULT_SETTINGS } from "../src/simulation/state";
import { FirstPersonMotionController } from "../src/rendering/first-person-motion";
import { addItem } from "../src/simulation/inventory";
it("steers right in forward drive and reverses steering only while physically reversing", () => {
  const sim = new Simulation(createWorld("steering"));
  sim.god = true;
  const v = sim.state.vehicles[0]!;
  Object.assign(v, {
    speed: 4,
    yaw: 0,
    health: 100,
    fuel: 100,
    engine: 100,
    tires: 4,
  });
  sim.state.player.vehicle = v.id;
  vi.spyOn(sim.collision, "move").mockImplementation((p, dx, dz) => ({
    ...p,
    x: p.x + dx,
    z: p.z + dz,
  }));
  const input = {
    forward: 1,
    side: 1,
    sprint: false,
    jump: false,
    brake: false,
  };
  sim.update(1 / 60, input);
  expect(v.yaw).toBeGreaterThan(0);
  v.speed = -1;
  v.yaw = 0;
  sim.update(1 / 60, { ...input, forward: -1 });
  expect(v.yaw).toBeLessThan(0);
  for (let i = 0; i < 180 && v.speed <= 0; i++)
    sim.update(1 / 60, { ...input, side: 0 });
  expect(v.speed).toBeGreaterThan(0);
  const yaw = v.yaw;
  sim.update(1 / 60, input);
  expect(v.yaw).toBeGreaterThan(yaw);
});
it("blends FOV when the equipped scope changes without waiting for a new aim input", () => {
  const sim = new Simulation(createWorld("fov-switch")),
    motion = new FirstPersonMotionController();
  addItem(sim.state.player.inventory, "rifle", 1);
  const rifle = sim.state.player.inventory.items.find((i) => i.id === "rifle")!;
  rifle.attachments = ["scope"];
  sim.state.player.quickSlots[0] = rifle.uid;
  sim.state.player.selected = 0;
  for (let i = 0; i < 90; i++)
    motion.update(1 / 60, sim, DEFAULT_SETTINGS, true, 0);
  const previous = motion.pose.fov;
  rifle.attachments = [];
  const next = motion.update(1 / 60, sim, DEFAULT_SETTINGS, true, 0).fov;
  expect(Math.abs(next - previous)).toBeLessThan(5);
  for (let i = 0; i < 90; i++)
    motion.update(1 / 60, sim, DEFAULT_SETTINGS, true, 0);
  expect(motion.pose.fov).toBeCloseTo(DEFAULT_SETTINGS.fov * 0.72, 1);
});

it("removes distant terrain only within loaded near-terrain chunks and restores it on unload", () => {
  const loaded = new Set(["-1,0", "0,0"]),
    indices = horizonIndices(loaded),
    n = HORIZON_SEGMENTS,
    step = HORIZON_SIZE / n;
  for (let i = 0; i < indices.length; i += 6) {
    const a = indices[i]!,
      x = a % (n + 1),
      z = Math.floor(a / (n + 1));
    const key =
      Math.floor(((x + 0.5) * step - HORIZON_SIZE / 2) / 256) +
      "," +
      Math.floor(((z + 0.5) * step - HORIZON_SIZE / 2) / 256);
    expect(loaded.has(key)).toBe(false);
  }
  expect(horizonIndices(new Set()).length - indices.length).toBe(2 * 4 * 4 * 6);
});

it("keeps the horizon front-facing when streamed chunks replace its index buffer", () => {
  const n = HORIZON_SEGMENTS,
    positions: number[] = [];
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) positions.push(x, 0, z);
  for (const loaded of [new Set<string>(), new Set(["-1,0", "0,0"])]) {
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, horizonIndices(loaded), normals);
    const up = normals.filter((_, i) => i % 3 === 1);
    expect(up.some((y) => y > 0.99)).toBe(true);
    expect(up.every((y) => y >= 0)).toBe(true);
  }
});
