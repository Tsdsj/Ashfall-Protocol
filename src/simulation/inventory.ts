import { getItem } from "../data/items";
import type { InventoryData, Stack } from "../core/types";
let localId = 0;
export const newInventory = (width = 10, height = 8): InventoryData => ({
  width,
  height,
  items: [],
});
export function dimensions(stack: Stack): [number, number] {
  const d = getItem(stack.id);
  return stack.rotated ? [d.height, d.width] : [d.width, d.height];
}
export function canPlace(
  inv: InventoryData,
  stack: Stack,
  x: number,
  y: number,
  ignore = stack.uid,
): boolean {
  const [w, h] = dimensions(stack);
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x + w > inv.width ||
    y + h > inv.height
  )
    return false;
  return inv.items.every((other) => {
    if (other.uid === ignore) return true;
    const [ow, oh] = dimensions(other);
    return (
      x + w <= other.x ||
      x >= other.x + ow ||
      y + h <= other.y ||
      y >= other.y + oh
    );
  });
}
export function findSpace(
  inv: InventoryData,
  stack: Stack,
): [number, number] | null {
  for (let y = 0; y < inv.height; y++)
    for (let x = 0; x < inv.width; x++)
      if (canPlace(inv, stack, x, y)) return [x, y];
  return null;
}
export function makeStack(id: string, count = 1, uid?: string): Stack {
  getItem(id);
  return {
    uid: uid ?? `item-${Date.now()}-${++localId}`,
    id,
    count,
    x: 0,
    y: 0,
    rotated: false,
    durability: 100,
    freshness: 100,
    ammo: 0,
    jammed: false,
    dirt: 0,
    attachments: [],
  };
}
export function countItem(inv: InventoryData, id: string): number {
  return inv.items.filter((i) => i.id === id).reduce((s, i) => s + i.count, 0);
}
export function weight(inv: InventoryData): number {
  return inv.items.reduce(
    (s, i) =>
      s +
      getItem(i.id).weight * i.count +
      i.attachments.reduce((a, id) => a + getItem(id).weight, 0),
    0,
  );
}
// The whole transaction runs on a copy, so a full bag never eats half a recipe or loot stack.
export function addItem(
  inv: InventoryData,
  id: string,
  count = 1,
  source?: Stack,
): boolean {
  if (!Number.isInteger(count) || count < 1) return false;
  const d = getItem(id),
    next = structuredClone(inv);
  let remaining = count;
  for (const stack of next.items)
    if (
      stack.id === id &&
      d.maxStack > 1 &&
      Math.abs(stack.freshness - (source?.freshness ?? 100)) < 10
    ) {
      const n = Math.min(d.maxStack - stack.count, remaining);
      stack.count += n;
      remaining -= n;
      if (!remaining) break;
    }
  while (remaining > 0) {
    const stack = source ? structuredClone(source) : makeStack(id);
    stack.uid = makeStack(id).uid;
    stack.count = Math.min(remaining, d.maxStack);
    let slot = findSpace(next, stack);
    if (!slot) {
      stack.rotated = !stack.rotated;
      slot = findSpace(next, stack);
    }
    if (!slot) return false;
    [stack.x, stack.y] = slot;
    next.items.push(stack);
    remaining -= stack.count;
  }
  inv.items = next.items;
  return true;
}
export function removeItem(inv: InventoryData, id: string, count = 1): boolean {
  if (!Number.isInteger(count) || count < 1 || countItem(inv, id) < count)
    return false;
  let left = count;
  for (const i of inv.items) {
    if (i.id !== id) continue;
    const n = Math.min(left, i.count);
    i.count -= n;
    left -= n;
    if (left === 0) break;
  }
  inv.items = inv.items.filter((i) => i.count > 0);
  return true;
}
export function removeUid(inv: InventoryData, uid: string, count = 1): boolean {
  const i = inv.items.find((i) => i.uid === uid);
  if (!i || count < 1 || !Number.isInteger(count) || i.count < count)
    return false;
  i.count -= count;
  inv.items = inv.items.filter((s) => s.count > 0);
  return true;
}
export function transfer(
  from: InventoryData,
  to: InventoryData,
  uid: string,
  count?: number,
): boolean {
  if (from === to) return false;
  const stack = from.items.find((i) => i.uid === uid);
  if (!stack) return false;
  const n = count ?? stack.count;
  if (n < 1 || n > stack.count || !Number.isInteger(n)) return false;
  if (!addItem(to, stack.id, n, stack)) return false;
  return removeUid(from, uid, n);
}
export function moveItem(
  inv: InventoryData,
  uid: string,
  x: number,
  y: number,
  rotate = false,
): boolean {
  const stack = inv.items.find((i) => i.uid === uid);
  if (!stack) return false;
  const candidate = {
    ...stack,
    rotated: rotate ? !stack.rotated : stack.rotated,
  };
  if (!canPlace(inv, candidate, x, y)) return false;
  Object.assign(stack, candidate, { x, y });
  return true;
}
export function splitItem(inv: InventoryData, uid: string): boolean {
  const source = inv.items.find((i) => i.uid === uid);
  if (!source || source.count < 2) return false;
  const candidate = structuredClone(source);
  candidate.uid = makeStack(source.id).uid;
  candidate.count = Math.floor(source.count / 2);
  const slot = findSpace(inv, candidate);
  if (!slot) return false;
  [candidate.x, candidate.y] = slot;
  source.count -= candidate.count;
  inv.items.push(candidate);
  return true;
}
export function sortInventory(inv: InventoryData): boolean {
  const next = { ...inv, items: [] as Stack[] };
  const sorted = [...inv.items].sort((a, b) => {
    const da = getItem(a.id),
      db = getItem(b.id);
    return (
      db.width * db.height - da.width * da.height || a.id.localeCompare(b.id)
    );
  });
  for (const i of sorted) {
    const s = structuredClone(i);
    let slot = findSpace(next, s);
    if (!slot) {
      s.rotated = !s.rotated;
      slot = findSpace(next, s);
    }
    if (!slot) return false;
    [s.x, s.y] = slot;
    next.items.push(s);
  }
  inv.items = next.items;
  return true;
}
export function validEntityId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 180 &&
    /^[A-Za-z0-9:_.+,-]+$/.test(id) &&
    !["__proto__", "constructor", "prototype"].includes(id)
  );
}
export function validateInventory(inv: InventoryData): boolean {
  try {
    return (
      Number.isInteger(inv.width) &&
      Number.isInteger(inv.height) &&
      inv.width > 0 &&
      inv.width <= 30 &&
      inv.height > 0 &&
      inv.height <= 30 &&
      inv.items.every(
        (i, n) =>
          validEntityId(i.uid) &&
          getItem(i.id) &&
          i.count > 0 &&
          Number.isInteger(i.count) &&
          i.count <= getItem(i.id).maxStack &&
          i.durability >= 0 &&
          i.durability <= 100 &&
          i.freshness >= 0 &&
          i.freshness <= 100 &&
          i.dirt >= 0 &&
          i.dirt <= 100 &&
          typeof i.jammed === "boolean" &&
          Number.isInteger(i.ammo) &&
          i.ammo >= 0 &&
          i.ammo <= Math.ceil((getItem(i.id).weapon?.magazine ?? 0) * 1.5) &&
          i.attachments.length <= 7 &&
          new Set(i.attachments).size === i.attachments.length &&
          i.attachments.every((a) =>
            [
              "scope",
              "reddot",
              "suppressor",
              "grip",
              "extendedmag",
              "laser",
              "weaponlight",
            ].includes(a),
          ) &&
          inv.items.findIndex((j) => j.uid === i.uid) === n &&
          canPlace(inv, i, i.x, i.y),
      )
    );
  } catch {
    return false;
  }
}
