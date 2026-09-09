import type { Recipe, Station } from "../core/types";
const recipes: Recipe[] = [];
function add(
  id: string,
  name: string,
  output: string,
  ingredients: Record<string, number>,
  station: Station = "hand",
  category = "野外制作",
  count = 1,
  seconds = 2,
) {
  recipes.push({
    id,
    name,
    output,
    ingredients,
    station,
    category,
    count,
    seconds,
    description:
      station === "fire"
        ? "需要附近有燃烧中的火源。"
        : station === "workbench"
          ? "需要附近的工作台。"
          : station === "power"
            ? "需要通电的工作台。"
            : "可以徒手完成。",
  });
}
add("rag", "裁剪布条", "rag", { cloth: 1 }, "hand", "医疗", 2);
add("rope", "编织绳索", "rope", { cloth: 2 });
add(
  "bandage",
  "制作绷带",
  "bandage",
  { rag: 2, disinfectant: 1 },
  "hand",
  "医疗",
  2,
);
add("splint", "制作夹板", "splint", { wood: 1, rag: 2 }, "hand", "医疗");
add("hatchet", "制作手斧", "hatchet", { wood: 2, stone: 3, rope: 1 });
add("pickaxe", "制作简易铁镐", "pickaxe", { wood: 2, scrap: 2, rope: 1 });
add("spear", "削制木矛", "spear", { wood: 3, rope: 1 });
add("bow", "制作木弓", "bow", { wood: 3, rope: 2 });
add("arrow", "削制箭矢", "arrow", { wood: 1, stone: 1 }, "hand", "野外制作", 6);
add("hammer", "制作工务锤", "hammer", { wood: 1, scrap: 2 });
add("torch", "制作松脂火把", "torch", { wood: 1, cloth: 1, fat: 1 });
add("fishrod", "制作钓竿", "fishingrod", { wood: 2, rope: 2, scrap: 1 });
add("cookmeat", "烤制鲜肉", "cookedmeat", { rawmeat: 1 }, "fire", "烹饪", 1, 6);
add("cookfish", "炭火烤鱼", "cookedfish", { fish: 1 }, "fire", "烹饪", 1, 5);
add("boil", "煮沸饮水", "boiledwater", { dirtywater: 1 }, "fire", "烹饪", 1, 5);
add(
  "purify",
  "净化水源",
  "water",
  { dirtywater: 1, filter: 1 },
  "hand",
  "烹饪",
);
add(
  "porridge",
  "熬制米粥",
  "porridge",
  { rice: 1, water: 1 },
  "fire",
  "烹饪",
  2,
  5,
);
add(
  "stew",
  "烹制野外炖汤",
  "stew",
  { rawmeat: 1, mushroom: 2, water: 1 },
  "fire",
  "烹饪",
  2,
  8,
);
add("nails", "锻制钉子", "nails", { scrap: 1 }, "workbench", "工具机械", 8);
add(
  "parts",
  "加工机械零件",
  "parts",
  { scrap: 3, nails: 2 },
  "workbench",
  "工具机械",
  2,
);
add(
  "smelt",
  "熔炼铁矿",
  "scrap",
  { ore: 2, wood: 1 },
  "fire",
  "工具机械",
  3,
  6,
);
add(
  "radio",
  "组装修复收发器",
  "radio",
  { electronics: 4, scrap: 2, parts: 2 },
  "workbench",
  "工具机械",
);
add(
  "ammo",
  "复装 9mm 弹药",
  "ammo9",
  { scrap: 3, parts: 1 },
  "power",
  "工具机械",
  12,
  5,
);
add(
  "jacket",
  "缝制林务夹克",
  "jacket",
  { hide: 3, cloth: 2, rope: 1 },
  "workbench",
  "装备",
);
add(
  "backpack",
  "缝制旅行背包",
  "backpack",
  { hide: 2, cloth: 4, rope: 2 },
  "workbench",
  "装备",
);
add(
  "vest",
  "制作防刺背心",
  "vest",
  { hide: 2, scrap: 4, cloth: 3 },
  "workbench",
  "装备",
);
const costs: [string, string, Record<string, number>, Station][] = [
  ["foundation", "木地基", { wood: 5, rope: 1 }, "hand"],
  ["wall", "木墙", { wood: 4, nails: 2 }, "hand"],
  ["door", "营地木门", { wood: 3, scrap: 1 }, "hand"],
  ["window", "开窗墙", { wood: 3, nails: 2 }, "hand"],
  ["floor", "木地板", { wood: 3, nails: 2 }, "hand"],
  ["roof", "斜屋顶", { wood: 4, cloth: 2 }, "hand"],
  ["stairs", "木台阶", { wood: 3, nails: 2 }, "hand"],
  ["fence", "防护围栏", { wood: 3, rope: 1 }, "hand"],
  ["gate", "营地大门", { wood: 5, scrap: 1 }, "hand"],
  ["storage", "储物箱", { wood: 3, nails: 2 }, "hand"],
  ["workbench", "工作台", { wood: 5, scrap: 3 }, "hand"],
  ["bed", "野外睡袋", { cloth: 4, rope: 1 }, "hand"],
  ["campfire", "石圈篝火", { wood: 3, stone: 4 }, "hand"],
  [
    "generator",
    "便携发电机",
    { scrap: 8, parts: 4, electronics: 2 },
    "workbench",
  ],
  ["light", "营地照明灯", { scrap: 1, electronics: 1 }, "workbench"],
  ["fridge", "保温冰箱", { scrap: 5, parts: 2, electronics: 2 }, "workbench"],
  ["planter", "种植箱", { wood: 4 }, "hand"],
  ["raincollector", "雨水收集器", { cloth: 3, scrap: 2, wood: 2 }, "hand"],
  ["wire", "配电接线盒", { electronics: 1, scrap: 1 }, "workbench"],
];
for (const [id, name, cost, station] of costs)
  add("build_" + id, "制作" + name, "kit_" + id, cost, station, "营地建造");
export const RECIPES = recipes;
