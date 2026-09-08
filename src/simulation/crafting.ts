import type { InventoryData, Recipe } from "../core/types";
import { addItem, countItem, removeItem } from "./inventory";
export function craftTransaction(
  inventory: InventoryData,
  recipe: Recipe,
): { ok: boolean; reason: string } {
  for (const [id, count] of Object.entries(recipe.ingredients))
    if (countItem(inventory, id) < count)
      return { ok: false, reason: "材料不足" };
  const next = structuredClone(inventory);
  for (const [id, count] of Object.entries(recipe.ingredients))
    removeItem(next, id, count);
  if (!addItem(next, recipe.output, recipe.count))
    return { ok: false, reason: "背包空间不足，请先整理物品" };
  inventory.items = next.items;
  return { ok: true, reason: "" };
}
