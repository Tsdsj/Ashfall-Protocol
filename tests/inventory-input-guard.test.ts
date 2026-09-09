import { afterEach, expect, it, vi } from "vitest";
import { bindInventoryInputGuard } from "../src/ui/input-guard";

afterEach(() => vi.unstubAllGlobals());
it("prevents item shift selection without blocking normal drag, text or forms", () => {
  class ElementStub {
    constructor(readonly kind: string) {}
    closest(selector: string) {
      if (selector.includes("input,"))
        return this.kind === "form" ? this : null;
      return this.kind === "item" || this.kind === "form" ? this : null;
    }
  }
  vi.stubGlobal("Element", ElementStub);
  vi.stubGlobal("Node", class {});
  const root = new EventTarget();
  bindInventoryInputGuard(root as HTMLElement);
  const dispatch = (kind: string, type: string, shiftKey = false) => {
    const e = Object.assign(new Event(type, { cancelable: true }), {
      button: 0,
      shiftKey,
    });
    Object.defineProperty(e, "target", { value: new ElementStub(kind) });
    root.dispatchEvent(e);
    return e.defaultPrevented;
  };
  expect(dispatch("item", "mousedown", true)).toBe(true);
  expect(dispatch("item", "mousedown")).toBe(false);
  expect(dispatch("item", "selectstart")).toBe(true);
  expect(dispatch("item", "dragstart")).toBe(false);
  for (const kind of ["text", "form"]) {
    expect(dispatch(kind, "mousedown", true)).toBe(false);
    expect(dispatch(kind, "selectstart")).toBe(false);
  }
});
