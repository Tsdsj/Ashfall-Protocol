import type { Category, ItemDef, WeaponDef } from "../core/types";
const defs: ItemDef[] = [];
function item(
  id: string,
  name: string,
  category: Category,
  description: string,
  overrides: Partial<ItemDef> = {},
) {
  defs.push({
    id,
    name,
    category,
    description,
    weight: 0.2,
    width: 1,
    height: 1,
    maxStack: 10,
    rarity: "common",
    icon: category,
    color: "#b7b7a1",
    value: 3,
    ...overrides,
  });
}
function weapon(
  id: string,
  name: string,
  description: string,
  stats: WeaponDef,
  overrides: Partial<ItemDef> = {},
) {
  item(id, name, "weapon", description, {
    weight: 1.2,
    width: 1,
    height: 3,
    maxStack: 1,
    value: 25,
    weapon: stats,
    ...overrides,
  });
}
weapon(
  "knife",
  "残刃小刀",
  "运输事故后仅存的刀具。安静，适合剥取猎物和切割布料。",
  { damage: 24, range: 2.3, interval: 0.52, stamina: 7, recoil: 0.04 },
  { weight: 0.4, height: 2 },
);
weapon("hatchet", "林务手斧", "厚刃短斧，用于伐木、拆除与近战。", {
  damage: 42,
  range: 2.6,
  interval: 0.85,
  stamina: 13,
  recoil: 0.06,
});
weapon("crowbar", "赤锈撬棍", "撬开封锁的门，也能打碎窗户。", {
  damage: 35,
  range: 2.8,
  interval: 0.7,
  stamina: 11,
  recoil: 0.05,
});
weapon(
  "spear",
  "灰枝木矛",
  "磨尖的长木杆。保持距离比硬拼更可靠。",
  { damage: 38, range: 3.8, interval: 0.95, stamina: 12, recoil: 0.035 },
  { height: 4, weight: 1.6 },
);
weapon(
  "machete",
  "巡林砍刀",
  "修剪林木的长刃，出手迅速。",
  { damage: 45, range: 2.9, interval: 0.6, stamina: 10, recoil: 0.04 },
  { rarity: "uncommon" },
);
weapon(
  "pistol",
  "微光 P9",
  "民用 9mm 手枪。控制射速，留意剩余弹药。",
  {
    damage: 32,
    range: 110,
    interval: 0.25,
    stamina: 0,
    ammo: "ammo9",
    magazine: 12,
    velocity: 340,
    reload: 1.6,
    recoil: 0.055,
    penetration: 0.15,
  },
  { height: 2, weight: 0.8, rarity: "uncommon", value: 50 },
);
weapon(
  "pistol45",
  "夜巡 P45",
  "大口径半自动手枪。弹容量小，近距离威力高。",
  {
    damage: 43,
    range: 90,
    interval: 0.34,
    stamina: 0,
    ammo: "ammo45",
    magazine: 8,
    velocity: 270,
    reload: 1.8,
    recoil: 0.085,
    penetration: 0.2,
  },
  { height: 2, weight: 1, rarity: "rare", value: 70 },
);
weapon(
  "shotgun",
  "雨燕 S12",
  "泵动霰弹枪。近距离散布，逐次压动护木。",
  {
    damage: 12,
    range: 45,
    interval: 0.9,
    stamina: 0,
    ammo: "shell",
    magazine: 5,
    velocity: 380,
    reload: 2.7,
    recoil: 0.15,
    pellets: 7,
    penetration: 0.1,
  },
  { height: 4, weight: 3.2, rarity: "rare", value: 85 },
);
weapon(
  "rifle",
  "山脊 R7",
  "民用猎枪，远距离精确射击。",
  {
    damage: 74,
    range: 280,
    interval: 1.05,
    stamina: 0,
    ammo: "ammo762",
    magazine: 5,
    velocity: 760,
    reload: 2.5,
    recoil: 0.1,
    penetration: 0.6,
  },
  { height: 4, weight: 3.4, rarity: "rare", value: 110 },
);
weapon(
  "military",
  "渡鸦 A5",
  "封锁部队制式步枪。高射速，消耗大量弹药。",
  {
    damage: 39,
    range: 250,
    interval: 0.12,
    stamina: 0,
    ammo: "ammo556",
    magazine: 30,
    velocity: 890,
    reload: 2.3,
    recoil: 0.045,
    penetration: 0.45,
  },
  { height: 4, weight: 3.5, rarity: "military", value: 150 },
);
weapon(
  "bow",
  "白蜡木弓",
  "没有枪声的狩猎工具。箭矢有明显下坠。",
  {
    damage: 65,
    range: 65,
    interval: 1.1,
    stamina: 8,
    ammo: "arrow",
    magazine: 1,
    velocity: 65,
    reload: 0.9,
    recoil: 0.015,
  },
  { height: 4, weight: 0.9, rarity: "uncommon" },
);
weapon(
  "smg",
  "回声 C9",
  "紧凑冲锋枪。短点射比持续倾泻更容易控制。",
  {
    damage: 26,
    range: 110,
    interval: 0.09,
    stamina: 0,
    ammo: "ammo9",
    magazine: 24,
    velocity: 370,
    reload: 1.9,
    recoil: 0.038,
    penetration: 0.18,
  },
  { height: 3, weight: 2.1, rarity: "military", value: 100 },
);
for (const [id, name, weight] of [
  ["ammo9", "9mm 弹药", 0.012],
  ["ammo45", ".45 弹药", 0.02],
  ["ammo556", "5.56mm 弹药", 0.013],
  ["ammo762", "7.62mm 弹药", 0.023],
  ["shell", "12 号霰弹", 0.045],
  ["arrow", "木制箭矢", 0.04],
] as const)
  item(id, name, "ammo", "按武器口径装填，弹药无法凭空补充。", {
    weight,
    maxStack: id === "arrow" ? 12 : 60,
    value: 1,
  });
for (const [id, name, energy, hydration, weight, description] of [
  ["beans", "白豆罐头", 32, 8, 0.4, "无需加热，可直接食用。"],
  ["cannedmeat", "炖肉罐头", 40, 2, 0.4, "封口完好，热量充足。"],
  ["energybar", "谷物能量棒", 22, -2, 0.08, "轻便的应急口粮。"],
  ["crackers", "军用薄饼", 26, -5, 0.15, "干燥易储存，食用后需要饮水。"],
  ["rice", "袋装大米", 8, -3, 0.5, "需用清水和火源煮熟。"],
  ["rawmeat", "新鲜生肉", 12, -2, 0.4, "生食有感染风险。请在火边烹饪。"],
  ["cookedmeat", "烤肉", 42, 0, 0.35, "温热的蛋白质来源。"],
  ["mushroom", "棕盖菇", 10, 2, 0.08, "林下可食用蘑菇，生食有轻微风险。"],
  ["turnip", "耐寒萝卜", 20, 12, 0.25, "种植箱收获的新鲜蔬菜。"],
  ["stew", "野外炖汤", 55, 25, 0.6, "肉、蘑菇和净水煮成的浓汤。"],
  ["porridge", "米粥", 38, 15, 0.35, "温热的米粥。"],
  ["fish", "水库鲜鱼", 10, 0, 0.35, "湖中捕获的鱼，烹饪后再吃。"],
  ["cookedfish", "烤鱼", 32, 5, 0.3, "熟透的鱼肉。"],
] as const)
  item(id, name, "food", description, {
    energy,
    hydration,
    weight,
    perishable: [
      "turnip",
      "rawmeat",
      "cookedmeat",
      "mushroom",
      "stew",
      "porridge",
      "fish",
      "cookedfish",
    ].includes(id),
    maxStack: 6,
  });
for (const [id, name, hydration, energy, description] of [
  ["water", "密封饮用水", 42, 0, "事故后带着的一瓶净水。"],
  ["soda", "柑橘汽水", 26, 8, "甜味可以短暂缓解疲劳。"],
  ["energydrink", "提神饮料", 20, 12, "可降低少量疲劳。"],
  ["dirtywater", "未处理的水", 35, 0, "来自自然水源，可能含有病原体。"],
  ["boiledwater", "煮沸的水", 45, 0, "经过加热处理的安全饮水。"],
] as const)
  item(id, name, "drink", description, {
    hydration,
    energy,
    weight: 0.5,
    height: 2,
    maxStack: 4,
  });
for (const [id, name, healing, cure, description] of [
  ["rag", "干净布条", 3, "bleed1", "临时压迫止血，对严重伤口效果有限。"],
  ["bandage", "医用绷带", 12, "bleed", "包扎所有出血伤口。"],
  ["tourniquet", "止血带", 4, "bleed", "快速止住大量出血，但会增加疼痛。"],
  ["painkiller", "止痛片", 0, "pain", "暂时减轻疼痛。"],
  ["antibiotics", "抗生素", 5, "infection", "治疗伤口感染。"],
  ["disinfectant", "消毒剂", 2, "infection", "清洁伤口并减轻感染。"],
  ["splint", "简易夹板", 0, "fracture", "固定骨折，恢复移动能力。"],
  ["firstaid", "野战急救包", 55, "all", "包扎、消毒并恢复生命和血量。"],
] as const)
  item(id, name, "medical", description, {
    healing,
    cure,
    weight: id === "firstaid" ? 0.6 : 0.12,
    maxStack: 6,
    value: id === "firstaid" ? 30 : 8,
  });
for (const [id, name, weight, description] of [
  ["wood", "木材", 0.55, "从树木和倒木采集。可加工成营地部件。"],
  ["stone", "石块", 0.4, "可砌篝火，也可制成简陋工具。"],
  ["scrap", "废金属", 0.3, "拆解车辆和工业物件获得。"],
  ["cloth", "布料", 0.1, "可缝制、包扎或编绳。"],
  ["rope", "绳索", 0.15, "捆扎和建造必需品。"],
  ["nails", "钉子", 0.04, "连接木制结构。"],
  ["parts", "机械零件", 0.25, "用于车辆、工具与发电机维修。"],
  ["electronics", "电子元件", 0.12, "修复广播与组装电力设施。"],
  ["fuel", "燃料", 0.7, "为车辆、发电机和火源提供能量。"],
  ["hide", "兽皮", 0.5, "狩猎获得，可缝制装备。"],
  ["bone", "兽骨", 0.2, "制作工具与肥料。"],
  ["fat", "动物脂肪", 0.15, "可制作火把和燃料。"],
  ["ore", "铁矿石", 0.7, "矿区出产，可熔炼成金属。"],
  ["seeds", "耐寒蔬菜种子", 0.02, "可播种在种植箱内。"],
  ["battery", "蓄电池", 1.8, "车辆启动与电力设施需要的电池。"],
  ["tire", "备用轮胎", 2.5, "修复车辆轮胎。"],
  ["filter", "净水片", 0.01, "将未处理的水变为饮用水。"],
] as const)
  item(id, name, "material", description, {
    weight,
    maxStack: id === "battery" || id === "tire" ? 2 : 30,
    value: id === "electronics" ? 12 : 3,
  });
for (const [id, name, description] of [
  ["hammer", "工务锤", "制作、修复建筑。"],
  ["wrench", "维修扳手", "维修车辆与发电机。"],
  ["shovel", "野外铲", "采集矿石和整理土壤。"],
  ["fishingrod", "简易钓竿", "在湖岸使用，可以钓鱼。"],
  ["torch", "松脂火把", "提供温暖的光源，增加被发现的概率。"],
] as const)
  item(id, name, "tool", description, {
    height: 3,
    maxStack: 1,
    weight: 0.8,
    value: 15,
  });
for (const [id, name, slot, insulation] of [
  ["beanie", "羊毛帽", "head", 0.12],
  ["jacket", "林务夹克", "chest", 0.3],
  ["gloves", "工作手套", "hands", 0.08],
  ["pants", "耐磨长裤", "legs", 0.18],
  ["boots", "山地靴", "feet", 0.1],
  ["backpack", "旅行背包", "back", 0.04],
  ["mask", "过滤面罩", "face", 0.02],
] as const)
  item(id, name, "clothing", "保暖与防护装备。装备后生效。", {
    slot,
    insulation,
    weight: 0.5,
    width: 2,
    height: 2,
    maxStack: 1,
    value: 18,
  });
for (const [id, name, protection] of [
  ["vest", "轻型防刺背心", 0.2],
  ["plate", "巡逻防弹背心", 0.45],
  ["heavyarmor", "封锁重型护甲", 0.65],
] as const)
  item(id, name, "armor", "保护躯干，耐久会随着受击下降。", {
    slot: "vest",
    protection,
    weight: protection * 9,
    width: 2,
    height: 3,
    maxStack: 1,
    rarity: protection > 0.4 ? "military" : "uncommon",
    value: 80,
  });
for (const [id, name] of [
  ["scope", "四倍瞄准镜"],
  ["reddot", "反射瞄具"],
  ["suppressor", "消声器"],
  ["grip", "垂直握把"],
  ["extendedmag", "扩容弹匣"],
  ["laser", "激光指示器"],
  ["weaponlight", "战术枪灯"],
] as const)
  item(
    id,
    name,
    "electronic",
    "选择后安装在当前装备的枪械上。可在武器详情卸下。",
    { weight: 0.2, maxStack: 1, value: 30, rarity: "rare" },
  );
item(
  "keycard",
  "渡鸦访问卡",
  "quest",
  "可解锁地下研究站。军事基地内遗留的通行凭证。",
  { maxStack: 1, weight: 0.01, rarity: "military", value: 0 },
);
item(
  "protocol",
  "ASHFALL 原始档案",
  "quest",
  "核验地下四方终端后复制的完整档案。最终控制台的公开、销毁或保留选择都需要它。",
  { maxStack: 1, weight: 0.1, rarity: "experimental", value: 0 },
);
item(
  "raven_vest",
  "渡鸦侦察员护甲",
  "armor",
  "要塞军械官留下的轻量复合护甲。仅在渡鸦装备库的封存箱中找到。",
  {
    slot: "vest",
    protection: 0.57,
    weight: 3.2,
    width: 2,
    height: 3,
    maxStack: 1,
    rarity: "military",
    icon: "armor",
    value: 110,
  },
);
item(
  "r07_injector",
  "R-07 净化注射器",
  "medical",
  "冷冻仓中的一次性实验制剂。恢复生命并处置出血、感染和中毒；使用后不会再生。",
  {
    healing: 45,
    cure: "all",
    weight: 0.15,
    maxStack: 1,
    rarity: "experimental",
    icon: "medical",
    value: 150,
  },
);
item(
  "mining_coat",
  "老矿工的隔寒外套",
  "clothing",
  "矿区检修站保留的厚实外套。较高保暖能力适合长时间雨夜探索。",
  {
    slot: "chest",
    insulation: 0.65,
    weight: 2.2,
    width: 2,
    height: 2,
    maxStack: 1,
    rarity: "rare",
    icon: "cloth",
    value: 90,
  },
);
item(
  "radio",
  "修复用收发器",
  "electronic",
  "与电池和电子元件一起修复广播台。",
  { maxStack: 1, weight: 0.5, height: 2, value: 50 },
);
item(
  "grenade",
  "破片手榴弹",
  "weapon",
  "装备快捷栏后按 G 投掷；引信燃烧后爆炸。",
  { maxStack: 3, weight: 0.4, value: 20 },
);
const pieces = [
  ["foundation", "木地基"],
  ["wall", "木墙"],
  ["door", "营地木门"],
  ["window", "开窗墙"],
  ["floor", "木地板"],
  ["roof", "斜屋顶"],
  ["stairs", "木台阶"],
  ["fence", "防护围栏"],
  ["gate", "营地大门"],
  ["storage", "储物箱"],
  ["workbench", "工作台"],
  ["bed", "野外睡袋"],
  ["campfire", "石圈篝火"],
  ["generator", "便携发电机"],
  ["light", "营地照明灯"],
  ["fridge", "保温冰箱"],
  ["planter", "种植箱"],
  ["raincollector", "雨水收集器"],
  ["wire", "配电接线盒"],
] as const;
for (const [id, name] of pieces)
  item(
    "kit_" + id,
    name + "组件",
    "building",
    "在建造菜单选择后，使用预览放置。可回收并重新安置。",
    {
      structure: id,
      width: 2,
      height: 2,
      weight: id === "generator" ? 3 : 1,
      maxStack: 4,
      icon: id,
      value: 20,
    },
  );
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  defs.map((d) => [d.id, d]),
);
export const ITEM_LIST = defs;
export const BUILDING_KINDS = pieces;
export function getItem(id: string): ItemDef {
  const def = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
  if (!def) throw new Error("未知物品：" + id);
  return def;
}
