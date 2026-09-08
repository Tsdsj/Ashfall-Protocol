import { random, choose } from "../core/random";
import type { InventoryData } from "../core/types";
import { addItem, newInventory } from "../simulation/inventory";
export const CONTAINER_TYPES = [
  "旧木柜",
  "救援箱",
  "急救柜",
  "工具箱",
  "弹药箱",
  "军械柜",
  "汽车后备箱",
  "冷藏柜",
  "旅行背包",
  "行李箱",
  "文件柜",
  "床头柜",
  "食品货架",
  "维修抽屉",
  "工业托盘",
  "封存货箱",
  "实验样本柜",
  "防水桶",
  "铁皮储物柜",
  "钓鱼箱",
  "保险箱",
  "弹药袋",
];
const tables: Record<string, string[]> = {
  ranger: [
    "wood",
    "cloth",
    "rope",
    "bandage",
    "water",
    "beans",
    "hatchet",
    "stone",
    "mushroom",
    "nails",
  ],
  house: [
    "cloth",
    "water",
    "beans",
    "crackers",
    "rag",
    "wood",
    "soda",
    "beanie",
    "seeds",
    "energydrink",
  ],
  cabin: [
    "wood",
    "rope",
    "rice",
    "water",
    "fish",
    "seeds",
    "hide",
    "fishingrod",
    "hatchet",
    "boots",
  ],
  store: [
    "beans",
    "cannedmeat",
    "energybar",
    "crackers",
    "rice",
    "soda",
    "water",
    "energydrink",
    "filter",
    "jacket",
  ],
  medical: [
    "bandage",
    "tourniquet",
    "painkiller",
    "antibiotics",
    "disinfectant",
    "splint",
    "firstaid",
    "rag",
    "mask",
  ],
  military: [
    "pistol",
    "pistol45",
    "shotgun",
    "rifle",
    "military",
    "smg",
    "ammo9",
    "ammo45",
    "ammo556",
    "ammo762",
    "shell",
    "vest",
    "plate",
    "grenade",
    "scope",
    "suppressor",
    "grip",
    "reddot",
    "heavyarmor",
    "laser",
    "extendedmag",
    "weaponlight",
  ],
  industrial: [
    "scrap",
    "parts",
    "electronics",
    "fuel",
    "wrench",
    "battery",
    "tire",
    "nails",
    "shovel",
    "radio",
  ],
  warehouse: [
    "scrap",
    "wood",
    "parts",
    "rope",
    "cloth",
    "nails",
    "battery",
    "fuel",
    "crowbar",
    "gloves",
    "pants",
  ],
  office: [
    "electronics",
    "cloth",
    "water",
    "energybar",
    "radio",
    "filter",
    "backpack",
  ],
  lab: [
    "antibiotics",
    "firstaid",
    "electronics",
    "battery",
    "filter",
    "mask",
    "disinfectant",
    "heavyarmor",
  ],
  radio: ["electronics", "parts", "water", "radio", "battery"],
};
export function generateLoot(
  seed: string,
  id: string,
  kind: string,
  danger: number,
  amount = 1,
): InventoryData {
  const inv = newInventory(8, 6),
    rng = random(seed + ":loot:" + id),
    table = tables[kind] ?? tables.house!;
  for (
    let n = 0;
    n < Math.max(2, Math.round((4 + Math.floor(rng() * 4)) * amount));
    n++
  ) {
    const item = choose(rng, table);
    let count = 1;
    if (item.startsWith("ammo")) count = 8 + Math.floor(rng() * 16);
    else if (
      ["wood", "stone", "scrap", "cloth", "nails", "parts"].includes(item)
    )
      count = 2 + Math.floor(rng() * 5);
    addItem(inv, item, count);
  }
  if (danger >= 4 && rng() > 0.7) addItem(inv, "firstaid");
  // Guaranteed starter resources prevent an unlucky world seed from blocking the first survival loop.
  if (id === "pine-0:0") {
    inv.items = [];
    for (const [item, n] of Object.entries({
      beans: 2,
      bandage: 2,
      cloth: 5,
      wood: 5,
      stone: 4,
      nails: 6,
    }))
      addItem(inv, item, n);
  }
  if (id === "pine-0:1") {
    inv.items = [];
    for (const [item, n] of Object.entries({
      pistol: 1,
      ammo9: 24,
      water: 2,
      hatchet: 1,
      rope: 2,
      seeds: 2,
    }))
      addItem(inv, item, n);
  }
  if (id === "fort-0:0") addItem(inv, "keycard");
  if (id === "industry-0:0") {
    addItem(inv, "radio");
    addItem(inv, "electronics", 4);
    addItem(inv, "battery");
  }
  inv.items.forEach((i, n) => (i.uid = id + ":item:" + n));
  return inv;
}
