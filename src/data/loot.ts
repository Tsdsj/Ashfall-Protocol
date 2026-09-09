import { random, choose } from "../core/random";
import type { InventoryData } from "../core/types";
import { addItem, newInventory } from "../simulation/inventory";
import { ITEMS } from "./items";
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
export const UNIQUE_POI_LOOT: Record<string, string> = {
  "fort-2:1": "raven_vest",
  "lab-2:0": "r07_injector",
  "mine-3:1": "mining_coat",
};
export const GUARANTEED_POI_SUPPLIES: Record<string, Record<string, number>> = {
  ...Object.fromEntries(
    Object.entries(UNIQUE_POI_LOOT).map(([id, item]) => [id, { [item]: 1 }]),
  ),
  "pine-0:0": { beans: 2, bandage: 2, cloth: 5, wood: 5, stone: 4, nails: 6 },
  "pine-0:1": { pistol: 1, ammo9: 24, water: 2, hatchet: 1, rope: 2, seeds: 2 },
  "pine-1:0": { bandage: 4, disinfectant: 2, antibiotics: 1 },
  "pine-3:0": { cannedmeat: 2, beans: 2, water: 2 },
  "fort-0:0": { keycard: 1, ammo556: 12 },
  "industry-0:0": { radio: 1, electronics: 4, battery: 1, wrench: 1, fuel: 2 },
  "industry-7:0": { electronics: 3, battery: 1, crowbar: 1 },
  "lake-1:0": { filter: 4, electronics: 2 },
  "mine-0:0": { fuel: 2, parts: 2, mask: 1 },
  "lab-0:0": { fuel: 1, electronics: 2 },
};
const containerNames: Record<string, string[]> = {
  medical: ["诊疗急救柜", "药品储存柜", "病房补给柜"],
  military: ["封存军械箱", "巡逻弹药柜", "执勤装备柜"],
  industrial: ["维修工具箱", "电力备件柜", "燃料物资箱"],
  warehouse: ["材料托盘", "封存运输箱", "后勤工具柜"],
  store: ["罐头食品架", "饮品周转箱", "生活用品柜"],
  lab: ["隔离应急柜", "实验设备箱", "维护备件柜"],
  ranger: ["林务生存物资", "巡林应急装备", "林务工具柜"],
  radio: ["广播台备件", "线路维修箱", "值班补给柜"],
};
export function containerLabel(kind: string, index: number): string {
  return (containerNames[kind] ?? ["厨房储物柜", "旅行行李箱", "床边抽屉"])[
    index % 3
  ]!;
}
export function lootTier(danger: number): "low" | "medium" | "high" {
  return danger >= 4 ? "high" : danger >= 2.5 ? "medium" : "low";
}
export function generateLoot(
  seed: string,
  id: string,
  kind: string,
  danger: number,
  amount = 1,
): InventoryData {
  const inv = newInventory(8, 6),
    rng = random(seed + ":loot:" + id),
    tier = lootTier(danger),
    source = tables[kind] ?? tables.house!,
    table = source.filter(
      (id) =>
        tier === "high" ||
        (tier === "medium"
          ? !["heavyarmor", "military", "scope"].includes(id)
          : !["rare", "military", "experimental"].includes(
              ITEMS[id]?.rarity ?? "common",
            ) &&
            ![
              "rifle",
              "shotgun",
              "smg",
              "firstaid",
              "scope",
              "suppressor",
              "plate",
              "heavyarmor",
            ].includes(id)),
    );
  // Reserve guaranteed quest/survival items first: random weapons cannot consume their space.
  for (const [item, n] of Object.entries(GUARANTEED_POI_SUPPLIES[id] ?? {})) {
    if (!addItem(inv, item, n))
      throw new Error("Guaranteed loot exceeds container capacity: " + id);
  }
  if (tier === "high") {
    const signature: Record<string, string> = {
      military: "rifle",
      lab: "firstaid",
      industrial: "battery",
      warehouse: "wrench",
      medical: "antibiotics",
      store: "cannedmeat",
    };
    if (signature[kind]) addItem(inv, signature[kind]!);
  }
  const rolls = Math.max(
    2,
    Math.round(
      ((tier === "high" ? 6 : tier === "medium" ? 5 : 3) +
        Math.floor(rng() * 3)) *
        amount,
    ),
  );
  for (let n = 0; n < rolls; n++) {
    const item = choose(rng, table.length ? table : tables.house!);
    let count = 1;
    if (item.startsWith("ammo"))
      count =
        (tier === "high" ? 16 : tier === "medium" ? 10 : 6) +
        Math.floor(rng() * 10);
    else if (
      ["wood", "stone", "scrap", "cloth", "nails", "parts"].includes(item)
    )
      count = 2 + Math.floor(rng() * 5);
    addItem(inv, item, count);
  }
  if (danger >= 4 && rng() > 0.7) addItem(inv, "firstaid");
  inv.items.forEach((i, n) => (i.uid = id + ":item:" + n));
  return inv;
}
