import { InputController } from "../src/core/input";
import { keyboardBindings, safeBinding } from "../src/core/key-bindings";
import { targetBearing } from "../src/ui/compass";
import { afterEach, expect, it, vi } from "vitest";
import { GameUI } from "../src/ui/ui";
import { Game } from "../src/core/game";
import { DEFAULT_SETTINGS, createWorld } from "../src/simulation/state";
import { Simulation } from "../src/simulation/simulation";
import { inventoryView } from "../src/ui/inventory-view";

afterEach(() => vi.unstubAllGlobals());
it("does not fade the entire handbook again when switching between its tabs", () => {
  const add = vi.fn();
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  const ui = Object.assign(Object.create(GameUI.prototype), {
    settings: structuredClone(DEFAULT_SETTINGS),
    screen: "inventory",
    render: vi.fn(),
    layer: { querySelector: () => ({ classList: { add } }) },
  });
  ui.show("crafting");
  expect(add).not.toHaveBeenCalledWith("panel-entering");
});
it("provides a bearing marker in the compass, separate from target distance", () => {
  const ui = Object.assign(Object.create(GameUI.prototype), {
    settings: DEFAULT_SETTINGS,
  });
  expect(ui.hudHTML()).toContain('id="compass-target"');
});
it("exposes creative supplies directly inside the backpack", () => {
  const s = createWorld("creative-backpack");
  s.flags.push("creative-mode");
  const sim = new Simulation(s);
  expect(inventoryView(sim, "", "", "")).toContain(
    'data-action="creative-give"',
  );
});
it("cancels placement when Escape unlock is delivered before the keyboard event", () => {
  const canvas = Object.assign(new EventTarget(), { focus: vi.fn() });
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: canvas as unknown,
    hasFocus: () => true,
    hidden: false,
    querySelector: () => null,
  });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", new EventTarget());
  for (const name of [
    "HTMLElement",
    "HTMLInputElement",
    "HTMLSelectElement",
    "HTMLTextAreaElement",
  ])
    vi.stubGlobal(name, class {});
  const ui = {
    screen: "play",
    locked: true,
    setLocked(locked: boolean) {
      this.locked = locked;
    },
    render: vi.fn(),
    show(screen: string) {
      this.screen = screen;
    },
  };
  const game = Object.assign(Object.create(Game.prototype), {
    canvas,
    ui,
    active: true,
    settings: structuredClone(DEFAULT_SETTINGS),
    sim: {
      building: { active: true },
      actions: { pending: null },
      craftJob: null,
    },
    input: { fallback: false, active: false, unlock: vi.fn() },
    audio: { pauseDialogue: vi.fn() },
  });
  game.bind();
  const finalCanvas = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    requestPointerLock: vi.fn(),
  });
  game.canvas = finalCanvas;
  doc.pointerLockElement = finalCanvas;
  game.input = new InputController(
    finalCanvas as unknown as HTMLCanvasElement,
    game.settings,
  );
  game.bindPointerButtons?.();
  canvas.dispatchEvent(
    Object.assign(new Event("mousedown", { cancelable: true }), { button: 2 }),
  );
  expect(game.sim.building.active).toBe(true);
  finalCanvas.dispatchEvent(
    Object.assign(new Event("mousedown", { cancelable: true }), { button: 2 }),
  );
  expect(game.sim.building.active).toBe(false);
  expect(game.input.aiming).toBe(false);
  game.sim.building.active = true;
  doc.pointerLockElement = null;
  doc.dispatchEvent(new Event("pointerlockchange"));
  window.dispatchEvent(
    Object.assign(new Event("keydown", { cancelable: true }), {
      code: "Escape",
    }),
  );
  expect(game.sim.building.active).toBe(false);
  expect(ui.screen).toBe("play");
});
it("avoids Ctrl and Alt as held gameplay bindings, which form unpreventable browser shortcuts", () => {
  expect(DEFAULT_SETTINGS.keys.crouch).not.toMatch(/Control|Meta/);
  expect(DEFAULT_SETTINGS.keys.walk).not.toMatch(/Alt|Meta/);
});

it("migrates old modifier bindings while preserving custom keys and avoiding duplicates", () => {
  const old = {
    ...DEFAULT_SETTINGS.keys,
    forward: "KeyT",
    walk: "AltLeft",
    crouch: "ControlLeft",
    flight: "F6",
  };
  const keys = keyboardBindings(DEFAULT_SETTINGS.keys, old);
  expect(keys.forward).toBe("KeyT");
  expect(new Set(Object.values(keys)).size).toBe(Object.keys(keys).length);
  expect(Object.values(keys).every(safeBinding)).toBe(true);
});
it("maps compass targets relative to yaw across north and behind the player", () => {
  const origin = { x: 0, y: 0, z: 0 };
  expect(targetBearing(origin, 0, { x: 0, y: 0, z: 100 }).percent).toBe(50);
  expect(targetBearing(origin, 0, { x: 100, y: 0, z: 0 }).percent).toBe(100);
  expect(targetBearing(origin, 0, { x: -100, y: 0, z: 0 }).percent).toBe(0);
  const aroundNorth = targetBearing(origin, Math.PI * 2 - 0.05, {
    x: 0,
    y: 0,
    z: 100,
  });
  expect(aroundNorth.relative).toBeCloseTo((0.05 * 180) / Math.PI);
  expect(targetBearing(origin, 0, { x: 10, y: 0, z: -100 }).behind).toBe(true);
});
it("does not swallow browser shortcuts while a keybinding prompt is open", () => {
  vi.stubGlobal("document", { hasFocus: () => true, hidden: false });
  const game = Object.assign(Object.create(Game.prototype), {
    ui: {
      screen: "settings",
      binding: "forward",
      toast: vi.fn(),
      render: vi.fn(),
    },
    settings: structuredClone(DEFAULT_SETTINGS),
  });
  for (const event of [
    { code: "KeyL", ctrlKey: true },
    { code: "ArrowLeft", altKey: true },
    { code: "F5" },
    { code: "F11" },
  ]) {
    const key = Object.assign(
      new Event("keydown", { cancelable: true }),
      event,
    );
    game.key(key);
    expect(key.defaultPrevented).toBe(false);
  }
});
it("finds unused ordinary keys even when custom bindings occupy all preferred migration candidates", () => {
  const actions = Object.keys(DEFAULT_SETTINGS.keys);
  const values = [
    "KeyT",
    "KeyU",
    "KeyX",
    "KeyL",
    "KeyI",
    "KeyK",
    "KeyO",
    "KeyN",
    "KeyP",
    "KeyY",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyE",
    "KeyR",
    "KeyF",
    "KeyG",
    "KeyB",
    "KeyC",
  ];
  const old = Object.fromEntries(
    actions.slice(0, values.length).map((key, i) => [key, values[i]!]),
  ) as Record<string, string>;
  const migrated = keyboardBindings(DEFAULT_SETTINGS.keys, old);
  expect(new Set(Object.values(migrated)).size).toBe(actions.length);
  expect(Object.values(migrated).every(safeBinding)).toBe(true);
});
it("lets the crouch key work during a skippable nonblocking sequence", () => {
  vi.stubGlobal("document", {
    hasFocus: () => true,
    hidden: false,
    pointerLockElement: {},
  });
  for (const name of [
    "HTMLElement",
    "HTMLInputElement",
    "HTMLSelectElement",
    "HTMLTextAreaElement",
  ])
    vi.stubGlobal(name, class {});
  const sim = new Simulation(createWorld("crouch-sequence"));
  vi.spyOn(sim.narrative, "frame").mockReturnValue({
    skippable: true,
    blocking: false,
  } as ReturnType<Simulation["narrative"]["frame"]>);
  const skip = vi.fn();
  const game = Object.assign(Object.create(Game.prototype), {
    ui: { screen: "play" },
    active: true,
    settings: structuredClone(DEFAULT_SETTINGS),
    sim,
    input: { active: true },
    skipSequence: skip,
  });
  game.key(
    Object.assign(new Event("keydown", { cancelable: true }), {
      code: DEFAULT_SETTINGS.keys.crouch,
    }),
  );
  expect(skip).not.toHaveBeenCalled();
  expect(sim.state.player.stance).toBe("crouch");
});
