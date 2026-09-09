import { describe, expect, it } from "vitest";
import {
  cameraPreferences,
  DEFAULT_VERTICAL_FOV,
  zoomFov,
} from "../src/core/camera-settings";
import { DEFAULT_SETTINGS } from "../src/simulation/state";

describe("first-person projection calibration", () => {
  it("uses a natural 16:9 field while keeping the explicit vertical angle", () => {
    expect(DEFAULT_SETTINGS.fov).toBe(DEFAULT_VERTICAL_FOV);
    const horizontal =
      (Math.atan((Math.tan((DEFAULT_SETTINGS.fov * Math.PI) / 360) * 16) / 9) *
        360) /
      Math.PI;
    expect(horizontal).toBeGreaterThan(90);
    expect(horizontal).toBeLessThan(95);
  });
  it("updates the old default once and preserves custom or already-calibrated preferences", () => {
    expect(cameraPreferences(null).fov).toBe(60);
    expect(cameraPreferences({ fov: 80 }).fov).toBe(60);
    expect(cameraPreferences({ fov: 72 }).fov).toBe(72);
    expect(cameraPreferences({ fov: 80, cameraProfile: 1 }).fov).toBe(80);
  });
  it("preserves fourfold scope magnification across player FOV settings", () => {
    for (const fov of [45, 60, 80, 105]) {
      const scoped = zoomFov(fov, 4);
      expect(
        Math.tan((fov * Math.PI) / 360) / Math.tan((scoped * Math.PI) / 360),
      ).toBeCloseTo(4, 8);
    }
  });
});
