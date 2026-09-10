import { expect, it } from "vitest";
import { ShadowRefreshBudget } from "../src/rendering/shadow-refresh";
const position = { x: 0, y: 2, z: 0 },
  direction = { x: 0, y: 0, z: 1 };
it("keeps high-refresh rendering independent while refreshing sunlight shadows 60 times per second", () => {
  const budget = new ShadowRefreshBudget();
  expect(budget.shouldRefresh(0, position, direction, 1, 16 / 9)).toBe(true);
  let count = 0;
  for (let i = 0; i < 240; i++)
    if (budget.shouldRefresh(1 / 240, position, direction, 1, 16 / 9)) count++;
  expect(count).toBe(60);
  for (let i = 0; i < 60; i++)
    expect(budget.shouldRefresh(1 / 60, position, direction, 1, 16 / 9)).toBe(
      true,
    );
});
it("immediately refreshes after a jump, rapid camera turn, zoom, viewport change or changed casters", () => {
  const budget = new ShadowRefreshBudget();
  budget.shouldRefresh(0, position, direction, 1, 16 / 9);
  expect(budget.shouldRefresh(0, position, direction, 1, 16 / 9)).toBe(false);
  expect(
    budget.shouldRefresh(0, { ...position, x: 10 }, direction, 1, 16 / 9),
  ).toBe(true);
  expect(
    budget.shouldRefresh(
      0,
      { ...position, x: 10 },
      { x: 1, y: 0, z: 0 },
      1,
      16 / 9,
    ),
  ).toBe(true);
  expect(
    budget.shouldRefresh(
      0,
      { ...position, x: 10 },
      { x: 1, y: 0, z: 0 },
      0.7,
      16 / 9,
    ),
  ).toBe(true);
  expect(
    budget.shouldRefresh(
      0,
      { ...position, x: 10 },
      { x: 1, y: 0, z: 0 },
      0.7,
      4 / 3,
    ),
  ).toBe(true);
  expect(
    budget.shouldRefresh(
      0,
      { ...position, x: 10 },
      { x: 1, y: 0, z: 0 },
      0.7,
      4 / 3,
      true,
    ),
  ).toBe(true);
});
it("snapshots Babylon vectors instead of retaining their accessor-backed storage", async () => {
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector");
  const budget = new ShadowRefreshBudget(),
    p = new Vector3(0, 2, 0),
    d = new Vector3(0, 0, 1);
  budget.shouldRefresh(0, p, d, 1, 16 / 9);
  p.x = 50;
  expect(budget.shouldRefresh(0, p, d, 1, 16 / 9)).toBe(true);
});
