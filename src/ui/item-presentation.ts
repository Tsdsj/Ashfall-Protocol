import { ITEMS } from "../data/items";
import type { Category } from "../core/types";

const categories: Record<Category, string> = {
  weapon: "武器",
  ammo: "弹药",
  food: "食物",
  drink: "饮水",
  medical: "医疗",
  tool: "工具",
  material: "材料",
  clothing: "衣物",
  armor: "护甲",
  electronic: "电子",
  quest: "任务",
  building: "建造",
};
const names: Record<string, string> = {
  knife: "小刀",
  hatchet: "手斧",
  pickaxe: "镐头",
  crowbar: "撬棍",
  spear: "木矛",
  machete: "砍刀",
  beans: "白豆罐头",
  cannedmeat: "肉罐头",
  energybar: "能量棒",
  crackers: "薄饼",
  rice: "大米",
  rawmeat: "生肉",
  water: "饮用水",
  dirtywater: "未净化水",
  boiledwater: "煮沸水",
  soda: "汽水",
  energydrink: "提神饮料",
  firstaid: "急救包",
  bandage: "绷带",
  rag: "布条",
  painkiller: "止痛片",
  antibiotics: "抗生素",
  battery: "蓄电池",
  tire: "轮胎",
  electronics: "电子元件",
  parts: "机械零件",
  seeds: "蔬菜种子",
  filter: "净水片",
  hammer: "锤子",
  wrench: "扳手",
  shovel: "铲子",
  fishingrod: "钓竿",
  torch: "火把",
  r07_injector: "R-07针剂",
  ammo9: "9mm",
  ammo45: ".45",
  ammo556: "5.56mm",
  ammo762: "7.62mm",
  shell: "12号霰弹",
  arrow: "箭矢",
  protocol: "原始档案",
};
function definition(id: string) {
  return Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
}
/** Plain text: call escapeHtml when embedding this value into HTML. */
export function shortName(id: string): string {
  if (Object.hasOwn(names, id)) return names[id]!;
  const item = definition(id);
  return item
    ? Array.from(item.name.replace(/组件$/, "")).slice(0, 6).join("")
    : "未知物品";
}
export function categoryClass(id: string): string {
  const category =
    definition(id)?.category ?? (id === "pickaxe" ? "tool" : "material");
  return `item-category-${category}`;
}
export function categoryLabel(id: string): string {
  const category =
    definition(id)?.category ?? (id === "pickaxe" ? "tool" : "material");
  return categories[category];
}
