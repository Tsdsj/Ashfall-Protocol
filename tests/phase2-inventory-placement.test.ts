import { describe, it, expect } from "vitest";
import {
  addItem,
  newInventory,
  transferAt,
  countItem,
  makeStack,
  validateInventory,
} from "../src/simulation/inventory";
describe("拖拽落点与合并事务", () => {
  it("跨容器保留释放格、旋转、原耐久，不自动搬到另一格", () => {
    const from = newInventory(),
      to = newInventory(6, 5);
    addItem(from, "rifle");
    const item = from.items[0]!;
    item.durability = 38;
    expect(transferAt(from, to, item.uid, 1, 3, true).ok).toBe(true);
    expect(to.items[0]).toMatchObject({
      uid: item.uid,
      x: 1,
      y: 3,
      rotated: true,
      durability: 38,
    });
    expect(from.items).toHaveLength(0);
    expect(validateInventory(to)).toBe(true);
  });
  it("越界或重叠失败时两侧保持原样", () => {
    const from = newInventory(),
      to = newInventory(2, 2);
    addItem(from, "rifle");
    addItem(to, "beans");
    const before = [structuredClone(from), structuredClone(to)];
    expect(transferAt(from, to, from.items[0]!.uid, 1, 1).ok).toBe(false);
    expect([from, to]).toEqual(before);
  });
  it("同背包部分合并不丢数量，不改变剩余物品的位置", () => {
    const inv = newInventory();
    const a = makeStack("ammo9", 55),
      b = makeStack("ammo9", 20);
    a.x = 0;
    b.x = 2;
    inv.items = [a, b];
    expect(transferAt(inv, inv, b.uid, 0, 0)).toMatchObject({
      ok: true,
      merged: 5,
    });
    expect(countItem(inv, "ammo9")).toBe(75);
    expect(inv.items.find((i) => i.uid === b.uid)).toMatchObject({
      count: 15,
      x: 2,
    });
    expect(validateInventory(inv)).toBe(true);
  });
  it("跨容器完全合并移除空源堆；满堆不消耗源物资", () => {
    const from = newInventory(),
      to = newInventory();
    addItem(from, "ammo9", 5);
    addItem(to, "ammo9", 55);
    expect(transferAt(from, to, from.items[0]!.uid, 0, 0).merged).toBe(5);
    expect(from.items).toHaveLength(0);
    addItem(from, "ammo9", 3);
    const source = structuredClone(from);
    expect(transferAt(from, to, from.items[0]!.uid, 0, 0).ok).toBe(false);
    expect(from).toEqual(source);
  });
});
