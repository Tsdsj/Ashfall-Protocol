import { afterEach, expect, it, vi } from "vitest";
import { measureDisplayCadence } from "../src/core/display-cadence";
afterEach(() => vi.unstubAllGlobals());
function environment() {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { hidden: false, hasFocus: () => true }),
  );
  let callback: FrameRequestCallback = () => {},
    pending = false;
  vi.stubGlobal("requestAnimationFrame", (next: FrameRequestCallback) => {
    callback = next;
    pending = true;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    pending = false;
  });
  return (hz: number) => {
    for (let i = 1; i < 400 && pending; i++) {
      pending = false;
      callback((i * 1000) / hz);
    }
  };
}
it("measures delivered 240 Hz callbacks without assuming a 60 Hz screen", async () => {
  const frames = environment(),
    result = measureDisplayCadence();
  frames(240);
  expect(await result).toBeCloseTo(240, 2);
});
it("cancels the diagnostic immediately when the user changes applications", async () => {
  environment();
  const result = expect(measureDisplayCadence()).rejects.toThrow("前台");
  window.dispatchEvent(new Event("blur"));
  await result;
});
