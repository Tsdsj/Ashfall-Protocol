import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/core/game";
import { InputController } from "../src/core/input";
import { DEFAULT_SETTINGS } from "../src/simulation/state";
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const canvas = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    requestPointerLock: vi.fn(),
  });
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as unknown,
    hidden: false,
    hasFocus: () => true,
    exitPointerLock: vi.fn(),
  });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("HTMLInputElement", class {});
  vi.stubGlobal("HTMLSelectElement", class {});
  vi.stubGlobal("HTMLTextAreaElement", class {});
  return {
    canvas,
    doc,
    input: new InputController(
      canvas as unknown as HTMLCanvasElement,
      structuredClone(DEFAULT_SETTINGS),
    ),
  };
}
describe("focus and pointer ownership", () => {
  it("ignores gameplay keys without mouse ownership and suppresses bound browser defaults only in game", () => {
    const { doc, canvas, input } = setup();
    const key = (code: string) =>
      Object.assign(new Event("keydown", { cancelable: true }), { code });
    window.dispatchEvent(key("KeyW"));
    expect(input.held.size).toBe(0);
    doc.pointerLockElement = canvas;
    const tab = key("Tab");
    window.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    const full = key("F11");
    window.dispatchEvent(full);
    expect(full.defaultPrevented).toBe(false);
  });
  it("ignores fallback mouse movement originating outside the canvas", () => {
    const { input } = setup();
    input.fallback = true;
    input.aiming = true;
    document.dispatchEvent(
      Object.assign(new Event("mousemove"), { movementX: 50, movementY: 20 }),
    );
    expect(input.mouse()).toEqual({ x: 0, y: 0 });
  });
  it("does not silently switch to drag controls when pointer lock rejects", async () => {
    const { doc, canvas, input } = setup();
    canvas.requestPointerLock.mockRejectedValue(new Error("not focused"));
    const game = Object.assign(Object.create(Game.prototype), {
      active: true,
      frameError: false,
      resumeGeneration: 0,
      input,
      canvas,
      settings: structuredClone(DEFAULT_SETTINGS),
      sim: { narrative: { frame: () => ({}) } },
      audio: {
        resumeDialogue: () => Promise.resolve(true),
        unlock: () => Promise.resolve(),
      },
      ui: {
        screen: "pause",
        show(s: string) {
          this.screen = s;
        },
        setLocked: vi.fn(),
        toast: vi.fn(),
      },
    });
    await game.resume();
    expect(input.fallback).toBe(false);
    expect(game.ui.setLocked).toHaveBeenLastCalledWith(false);
    expect(doc.pointerLockElement).toBe(null);
  });
});

it("waits for event-only pointer lock and cancels pending capture on blur", async () => {
  const { canvas, doc, input } = setup();
  const pending = input.lock();
  doc.pointerLockElement = canvas;
  doc.dispatchEvent(new Event("pointerlockchange"));
  await pending;
  doc.pointerLockElement = null;
  const cancelled = expect(input.lock()).rejects.toThrow("cancelled");
  input.held.add("KeyW");
  input.mouseDown = true;
  window.dispatchEvent(new Event("blur"));
  await cancelled;
  expect(input.held.size).toBe(0);
  expect(input.mouseDown).toBe(false);
  expect(input.fallback).toBe(false);
});
it("keeps Alt walking but leaves Alt Tab and F11 to the browser", () => {
  const { canvas, doc, input } = setup();
  doc.pointerLockElement = canvas;
  const alt = Object.assign(new Event("keydown", { cancelable: true }), {
    code: "AltLeft",
    altKey: true,
  });
  window.dispatchEvent(alt);
  expect(input.down("walk")).toBe(true);
  const tab = Object.assign(new Event("keydown", { cancelable: true }), {
    code: "Tab",
    altKey: true,
  });
  window.dispatchEvent(tab);
  expect(tab.defaultPrevented).toBe(false);
});
