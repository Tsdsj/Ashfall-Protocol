import { describe, expect, it } from "vitest";
import { createWorld } from "../src/simulation/state";
import {
  exploredCells,
  recordExploration,
} from "../src/simulation/exploration";
import {
  clampMapView,
  clientToMap,
  defaultMapView,
  mapToWorld,
  worldToMap,
  zoomMapAt,
} from "../src/ui/map";

describe("map coordinates and direct manipulation", () => {
  it("inverts map coordinates after zoom and pan", () => {
    const view = { zoom: 3, panX: -630, panY: -980 };
    const p = worldToMap(640, -720, view);
    const world = mapToWorld(p.x, p.y, view);
    expect(world.x).toBeCloseTo(640);
    expect(world.z).toBeCloseTo(-720);
    expect(worldToMap(0, 2048)).toEqual({ x: 480, y: 0 });
  });
  it("keeps the wheel anchor fixed while zooming", () => {
    const before = defaultMapView(),
      anchor = { x: 300, y: 720 };
    const world = mapToWorld(anchor.x, anchor.y, before);
    const after = zoomMapAt(before, 2, anchor.x, anchor.y);
    expect(worldToMap(world.x, world.z, after)).toEqual(anchor);
    expect(zoomMapAt(after, 0.5, anchor.x, anchor.y)).toEqual(before);
  });
  it("bounds zoom/pan and respects contain letterboxing", () => {
    expect(clampMapView({ zoom: 99, panX: 500, panY: -99999 })).toEqual({
      zoom: 8,
      panX: 0,
      panY: -6720,
    });
    expect(clampMapView({ zoom: 0.1, panX: -30, panY: 20 })).toEqual({
      zoom: 1,
      panX: -0,
      panY: 0,
    });
    expect(
      clientToMap(150, 30, { left: 50, top: 30, width: 600, height: 400 }),
    ).toEqual({ x: 0, y: 0 });
    expect(
      clientToMap(550, 430, { left: 50, top: 30, width: 600, height: 400 }),
    ).toEqual({ x: 960, y: 960 });
  });
});

describe("persistent exploration", () => {
  it("records neighboring cells once and retains travelled areas after save/load", () => {
    const state = createWorld("map-test");
    state.player.position = { x: 0, y: 0, z: 0 };
    expect(recordExploration(state)).toBe(true);
    expect(exploredCells(state).size).toBe(9);
    const flags = state.flags.slice();
    expect(recordExploration(state)).toBe(false);
    expect(state.flags).toEqual(flags);
    state.player.position.x = 64;
    expect(recordExploration(state)).toBe(true);
    expect(exploredCells(state).size).toBe(12);
    const restored = structuredClone(state);
    expect([...exploredCells(restored)]).toEqual([...exploredCells(state)]);
  });
  it("bounds flags to the world and preserves discovered POI areas in old saves", () => {
    const state = createWorld("old-map");
    state.flags = ["story-preserved"];
    state.discovered = ["known"];
    expect(
      exploredCells(state, [
        { id: "known", x: -2048, z: -2048 },
        { id: "unknown", x: 512, z: 512 },
      ]).size,
    ).toBe(4);
    expect(state.flags).toContain("story-preserved");
    for (let z = -2048; z <= 2048; z += 64)
      for (let x = -2048; x <= 2048; x += 64) {
        state.player.position = { x, y: 0, z };
        recordExploration(state);
      }
    expect(exploredCells(state).size).toBe(4096);
    expect(
      state.flags.filter((f) => f.startsWith("map-explored:")).length,
    ).toBe(4096);
  });
});

it("places a waypoint on click but not drag, cancellation, or after disposal", async () => {
  const { vi } = await import("vitest");
  const { bindInteractiveMap } = await import("../src/ui/map");
  class Canvas extends EventTarget {
    width = 0;
    height = 0;
    style = { cursor: "", touchAction: "" };
    captured = new Set<number>();
    getContext() {
      return new Proxy({}, { get: () => () => {}, set: () => true });
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 960, height: 960 };
    }
    setPointerCapture(id: number) {
      this.captured.add(id);
    }
    hasPointerCapture(id: number) {
      return this.captured.has(id);
    }
    releasePointerCapture(id: number) {
      this.captured.delete(id);
    }
  }
  vi.stubGlobal("document", { createElement: () => new Canvas() });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  try {
    const state = createWorld("map-drag");
    const sim = {
      state,
      gen: { baseHeight: () => 0, height: () => 0, pois: [] },
      narrative: { unlockedRoutes: [], stopTrackingMainLead: vi.fn() },
    } as unknown as import("../src/simulation/simulation").Simulation;
    const canvas = new Canvas();
    const controls = bindInteractiveMap(
      canvas as unknown as HTMLCanvasElement,
      sim,
    );
    const send = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(
        Object.assign(new Event(type, { cancelable: true }), {
          button: 0,
          pointerId: 1,
          clientX: x,
          clientY: y,
        }),
      );
    send("pointerdown", 480, 480);
    send("pointerup", 480, 480);
    expect(state.waypoint).toEqual({ x: 0, y: 0, z: 0 });
    state.waypoint = null;
    send("pointerdown", 480, 480);
    send("pointermove", 600, 600);
    send("pointerup", 600, 600);
    expect(state.waypoint).toBeNull();
    send("pointerdown", 480, 480);
    send("pointercancel", 480, 480);
    expect(state.waypoint).toBeNull();
    controls();
    send("pointerdown", 480, 480);
    send("pointerup", 480, 480);
    expect(state.waypoint).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});
