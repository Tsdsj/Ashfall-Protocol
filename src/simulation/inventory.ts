import { getItem } from "../data/items";
import type {
  EquipSlot,
  InventoryData,
  PlayerData,
  Stack,
} from "../core/types";
let localId = 0;
export const newInventory = (width = 10, height = 8): InventoryData => ({
  width,
  height,
  items: [],
});
export function isWorn(inv: InventoryData, uid: string): boolean {
  return inv.equippedUids?.includes(uid) ?? false;
}
export function gridItems(inv: InventoryData): Stack[] {
  return inv.items.filter((i) => !isWorn(inv, i.uid));
}
export const CARRY_LIMIT = 38;
export function isOverweight(inv: InventoryData): boolean {
  return weight(inv) > CARRY_LIMIT + 1e-9;
}
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
    if (other.uid === ignore || isWorn(inv, other.uid)) return true;
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
  if (
    !i ||
    isWorn(inv, uid) ||
    count < 1 ||
    !Number.isInteger(count) ||
    i.count < count
  )
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
  if (!stack || isWorn(from, uid)) return false;
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
  if (!stack || isWorn(inv, uid)) return false;
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
  next.items = inv.items
    .filter((i) => isWorn(inv, i.uid))
    .map((i) => structuredClone(i));
  const sorted = gridItems(inv).sort((a, b) => {
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
      (inv.baseHeight === undefined ||
        (Number.isInteger(inv.baseHeight) &&
          inv.baseHeight > 0 &&
          inv.baseHeight <= inv.height)) &&
      (inv.equippedUids === undefined ||
        (Array.isArray(inv.equippedUids) &&
          new Set(inv.equippedUids).size === inv.equippedUids.length &&
          inv.equippedUids.every((uid) => {
            const item = inv.items.find((i) => i.uid === uid);
            return !!item && isWearable(item);
          }))) &&
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
          (isWorn(inv, i.uid) || canPlace(inv, i, i.x, i.y)),
      )
    );
  } catch {
    return false;
  }
}

/** Place at the released cell, or merge compatible stacks there; preserves both inventories on failure. */
export function transferAt(
  from: InventoryData,
  to: InventoryData,
  uid: string,
  x: number,
  y: number,
  rotate = false,
): { ok: boolean; merged: number; reason: string } {
  const sourceCopy = structuredClone(from),
    targetCopy = from === to ? sourceCopy : structuredClone(to),
    source = sourceCopy.items.find((i) => i.uid === uid);
  const fail = {
    ok: false,
    merged: 0,
    reason: "此处空间不足或与其他物品重叠。",
  };
  if (!source || isWorn(from, uid)) return fail;
  const destination = targetCopy.items.find((i) => {
    const [w, h] = dimensions(i);
    return (
      !isWorn(targetCopy, i.uid) &&
      i.uid !== uid &&
      x >= i.x &&
      x < i.x + w &&
      y >= i.y &&
      y < i.y + h
    );
  });
  if (
    destination &&
    destination.id === source.id &&
    getItem(source.id).maxStack > 1 &&
    Math.abs(destination.freshness - source.freshness) < 10
  ) {
    const n = Math.min(
      source.count,
      getItem(source.id).maxStack - destination.count,
    );
    if (n <= 0) return { ...fail, reason: "这个物资堆叠已满。" };
    destination.freshness =
      (destination.freshness * destination.count + source.freshness * n) /
      (destination.count + n);
    destination.count += n;
    source.count -= n;
    sourceCopy.items = sourceCopy.items.filter((i) => i.count > 0);
    from.items = sourceCopy.items;
    to.items = from === to ? sourceCopy.items : targetCopy.items;
    return { ok: true, merged: n, reason: "" };
  }
  const candidate = {
    ...source,
    rotated: rotate ? !source.rotated : source.rotated,
    x,
    y,
  };
  if (!canPlace(targetCopy, candidate, x, y)) return fail;
  if (from === to) Object.assign(source, candidate);
  else {
    sourceCopy.items = sourceCopy.items.filter((i) => i.uid !== uid);
    targetCopy.items.push(candidate);
  }
  from.items = sourceCopy.items;
  to.items = from === to ? sourceCopy.items : targetCopy.items;
  return { ok: true, merged: 0, reason: "" };
}

function isWearable(item: Stack): boolean {
  const slot = getItem(item.id).slot;
  return !!slot && !["primary", "secondary", "holster"].includes(slot);
}

/** Import legacy equipment references without deleting, re-identifying, or re-packing items. */
export function syncEquipmentInventory(
  player: Pick<PlayerData, "inventory" | "equipment">,
): boolean {
  const next = structuredClone(player.inventory);
  next.baseHeight ??= next.height;
  next.equippedUids = Object.entries(player.equipment)
    .filter(([slot, uid]) =>
      next.items.some(
        (i) => i.uid === uid && isWearable(i) && getItem(i.id).slot === slot,
      ),
    )
    .map(([, uid]) => uid!);
  const backpack = next.items.some(
    (i) => i.id === "backpack" && next.equippedUids!.includes(i.uid),
  );
  next.height = Math.min(30, next.baseHeight + (backpack ? 4 : 0));
  // Preserve positions whenever possible. Shrinking/releasing worn items may require packing.
  if (!validateInventory(next) && !sortInventory(next)) return false;
  if (!validateInventory(next)) return false;
  Object.assign(player.inventory, next);
  return true;
}

/** Swaps are atomic, including returning the previous garment to the grid. */
export function equipWearable(
  player: Pick<PlayerData, "inventory" | "equipment">,
  uid: string,
): boolean {
  const item = player.inventory.items.find((i) => i.uid === uid);
  if (!item || !isWearable(item)) return false;
  const next = structuredClone(player);
  if (!syncEquipmentInventory(next)) return false;
  next.equipment[getItem(item.id).slot!] = uid;
  if (!syncEquipmentInventory(next)) return false;
  Object.assign(player.inventory, next.inventory);
  player.equipment = next.equipment;
  return true;
}

/** Refuse an overflowing backpack removal; the caller can ask the player to free space. */
export function unequipWearable(
  player: Pick<PlayerData, "inventory" | "equipment">,
  slot: EquipSlot,
): boolean {
  const uid = player.equipment[slot];
  const item = player.inventory.items.find((i) => i.uid === uid);
  if (!item || !isWearable(item)) return false;
  const next = structuredClone(player);
  if (!syncEquipmentInventory(next)) return false;
  delete next.equipment[slot];
  if (!syncEquipmentInventory(next)) return false;
  Object.assign(player.inventory, next.inventory);
  player.equipment = next.equipment;
  return true;
}
