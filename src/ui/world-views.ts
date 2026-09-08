import { REGIONS, STORY } from "../world/generator";
import { BUILDING_KINDS, ITEMS } from "../data/items";
import { weight } from "../simulation/inventory";
import type { Simulation } from "../simulation/simulation";
import { grid } from "./inventory-view";
import { icon, escapeHtml } from "./icons";
export function mapView(sim: Simulation) {
  return `<div class="map-layout"><section><div class="panel-title"><div><h2>灰谷自治区</h2><p>已发现 ${sim.state.discovered.length} / ${sim.gen.pois.length} 处地点。点击地图设置导航标记，重复点击同一处可清除。</p></div></div><div class="map-legend"><span><i></i>已探索</span><span><i style="background:var(--warning)"></i>无线电事件</span><span><i style="background:var(--ink)"></i>你的位置</span></div><div class="map-frame"><canvas id="world-map" aria-label="灰谷世界地图，显示探索区域、当前位置与世界事件"></canvas><div class="map-scale">256 m / 格 · GREYVALE SURVEY 2037</div></div></section><aside class="map-sidebar"><div class="column-heading"><strong>区域档案</strong><span>危险等级</span></div><div class="region-list">${REGIONS.map((r) => `<div class="region-row"><h3>${r.name}</h3><small class="mono">${r.english}</small><div class="region-risk">${[1, 2, 3, 4, 5].map((n) => `<i class="risk-dot ${n <= r.danger ? "filled" : ""}"></i>`).join("")}<span style="margin-left:8px">${r.danger} / 5</span></div></div>`).join("")}</div></aside></div>`;
}
export function journalView(sim: Simulation, id: string) {
  const entries = sim.state.journal.filter((i) => STORY[i]),
    key = entries.includes(id) ? id : (entries.at(-1) ?? "crash"),
    entry = STORY[key]!;
  return `<div class="journal-layout"><nav class="journal-list" aria-label="已找到的记录">${entries.map((e, n) => `<button class="journal-entry ${key === e ? "active" : ""}" data-action="journal-entry" data-id="${e}"><small class="mono">档案 ${String(n + 1).padStart(3, "0")}</small><strong>${STORY[e]!.title}</strong></button>`).join("")}</nav><article class="journal-reader"><div class="file-meta">GREYVALE ARCHIVE / FIELD RECORD</div><h2>${entry.title}</h2><p>${entry.text}</p><div class="journal-clue"><span>下一条线索</span>${entry.clue}</div><div class="divider"></div><p class="field-help">你也可以暂时放下这些记录。在灰谷活下去，从来不只有一种方式。</p></article></div>`;
}
export function bodyView(sim: Simulation) {
  const s = sim.state.player.stats;
  const stats = [
    ["氧气", s.oxygen, "/ 100"],
    ["生命", s.health, "/ 100"],
    ["血量", s.blood, "/ 100"],
    ["体力", s.stamina, "/ 100"],
    ["能量", s.energy, "/ 100"],
    ["水分", s.hydration, "/ 100"],
    ["体温", s.temperature, "°C"],
    ["疲劳", s.fatigue, "%"],
    ["湿度", s.wetness, "%"],
    ["疼痛", s.pain, "%"],
    ["负重", weight(sim.state.player.inventory), "kg"],
  ] as const;
  const conditions = [];
  if (s.bleeding > 0)
    conditions.push([
      "正在流血",
      "血量会持续下降。使用医用绷带或止血带，干净布条只能缓解较轻的伤口。",
    ]);
  if (s.fracture)
    conditions.push([
      "骨折",
      "移动速度下降，无法冲刺。制作或找到夹板以固定伤处。",
    ]);
  if (s.infection > 0)
    conditions.push([
      "伤口感染",
      "感染会逐渐损害健康。使用消毒剂、抗生素或急救包。",
    ]);
  if (s.poison > 0)
    conditions.push([
      "中毒与不适",
      "可能来自未处理的饮水、生食或污染区域。急救包可以治疗，轻症会逐渐消退。",
    ]);
  if (s.temperature < 35)
    conditions.push(["低温", "尽快找到室内或燃烧的篝火，换上保暖衣物并烘干。"]);
  if (!conditions.length)
    conditions.push([
      "身体状况稳定",
      "保持饮水和食物补给。尽量在疲劳积累前，找到安全的地方休息。",
    ]);
  return `<div class="body-layout"><section><div class="panel-title"><div><h2>身体状况</h2><p>环境、负重和伤口都会影响你的行动。</p></div></div><div class="body-stats">${stats.map(([name, val, unit]) => `<div class="body-stat"><div class="name">${name}</div><div class="value">${Number(val).toFixed(name === "体温" || name === "负重" ? 1 : 0)} <small>${unit}</small></div></div>`).join("")}</div></section><section><div class="column-heading"><strong>状态与处置</strong></div><div class="condition-list">${conditions.map(([title, text]) => `<div class="condition-card"><h3>${title}</h3><p>${text}</p></div>`).join("")}</div><button class="secondary" data-action="open-inventory" style="margin-top:24px">打开背包使用补给</button></section></div>`;
}
export function vehicleView(sim: Simulation, id: string) {
  const v = sim.state.vehicles.find((v) => v.id === id);
  if (!v) return "<p>车辆不在附近。</p>";
  const attrs = [
    ["fuel", "燃料", v.fuel, "燃料 ×1"],
    ["health", "车身", v.health, "废金属 ×2"],
    ["engine", "引擎", v.engine, "机械零件 ×2"],
    ["battery", "蓄电池", v.battery, "蓄电池 ×1"],
    ["tires", "轮胎", v.tires * 25, "轮胎 ×1"],
  ] as const;
  return `<div class="vehicle-layout"><section><div class="panel-title"><div><h2>${v.kind === "pickup" ? "林务皮卡" : "灰谷越野车"}</h2><p>引擎和电池需保持可用状态，4 个轮胎必须齐全。</p></div></div><div class="vehicle-stats">${attrs.map(([key, name, value, cost]) => `<div class="vehicle-stat"><small>${name}</small><div class="value">${key === "tires" ? v.tires + " / 4" : Math.round(value) + "%"}</div><button class="secondary" data-action="service-vehicle" data-id="${id}" data-kind="${key}" ${value >= 100 ? "disabled" : ""}>${key === "fuel" ? "加油" : "维修"} · ${cost}</button></div>`).join("")}</div><div class="button-row" style="margin-top:25px"><button class="primary" data-action="enter-vehicle" data-id="${id}" ${v.fuel > 0 && v.health > 0 && v.engine >= 20 && v.battery >= 15 && v.tires >= 4 ? "" : "disabled"}>进入驾驶位</button></div><p class="field-help" style="margin-top:18px">W / S 加速与倒车，A / D 转向，空格制动，E 下车。车辆会吸引远处的感染者。</p></section><section class="vehicle-inventory"><div class="column-heading"><strong>车载储物箱</strong><button data-action="open-vehicle-storage" data-id="${id}">管理物资</button></div>${grid(v.inventory, "vehicle:" + id, sim, "")}</section></div>`;
}
export function structureView(sim: Simulation, id: string) {
  const b = sim.state.structures.find((b) => b.id === id);
  if (!b) return "<p>这个设施已经不在这里。</p>";
  const name = BUILDING_KINDS.find((p) => p[0] === b.kind)?.[1] ?? b.kind;
  return `<div style="max-width:720px;margin:auto"><div class="panel-title"><div><h2>${name}</h2><p>耐久 ${Math.round(b.health)}% ${["campfire", "generator", "raincollector"].includes(b.kind) ? "· 储量 " + Math.round(b.fuel) : ""}</p></div>${icon("kit_" + b.kind, 64)}</div><div class="divider"></div><p class="muted">${b.kind === "campfire" ? "火光可以驱散寒冷。烹饪需要燃烧的火源，木材可以延长燃烧时间。" : b.kind === "generator" ? "燃烧燃料，为 16 米内的设备供电。配电接线盒可将供电范围扩展至 30 米。运行噪音会吸引感染者。" : b.kind === "bed" ? "安全休息 6 小时，恢复体力和部分生命。睡醒后，此处将成为新的重生点。附近有敌人时无法入睡。" : b.kind === "planter" ? "使用种子播种，成熟后收获食物与下一轮的种子。雨水能促进作物生长。" : b.kind === "raincollector" ? "降雨期间收集饮水。储量达到 20 后可以装满一瓶。" : b.kind === "fridge" ? "接入运行中的发电机后，显著减慢食物腐败。" : b.kind === "workbench" ? "更复杂的工具、零件与装备需要工作台。接通电力后还可以制作复装弹药。" : "营地中的持久设施，可以维修或回收重新放置。"}</p><div class="button-row" style="margin-top:28px">${["campfire", "generator", "light", "door", "gate"].includes(b.kind) ? `<button class="primary" data-action="structure-toggle" data-id="${id}">${b.active ? "关闭 / 熄灭" : "开启 / 点燃"}</button>` : ""}${["campfire", "generator"].includes(b.kind) ? `<button data-action="structure-fuel" data-id="${id}">添加燃料</button>` : ""}${b.kind === "bed" ? `<button class="primary" data-action="sleep" data-id="${id}">安全休息 6 小时</button>` : ""}${["campfire", "workbench"].includes(b.kind) ? '<button data-action="open-crafting">打开制作菜单</button>' : ""}${b.inventory ? `<button class="primary" data-action="open-structure-storage" data-id="${id}">管理物资</button>` : ""}${b.kind === "planter" ? `<button class="primary" data-action="structure-toggle" data-id="${id}">${b.growth >= 100 ? "收获作物" : b.plantedAt ? "查看生长进度" : "播种"}</button>` : ""}${b.kind === "raincollector" ? `<button class="primary" data-action="structure-toggle" data-id="${id}">装满饮水瓶</button>` : ""}</div><div class="divider"></div><div class="button-row"><button class="secondary" data-action="structure-repair" data-id="${id}" ${b.health >= 100 ? "disabled" : ""}>维修 · 木材 ×2</button><button class="secondary" data-action="structure-reclaim" data-id="${id}">${b.kind === "campfire" ? "拆除并回收部分材料" : "回收组件"}</button></div></div>`;
}
export const TRADES = [
  { pay: "scrap", cost: 4, item: "bandage", count: 2 },
  { pay: "scrap", cost: 6, item: "water", count: 2 },
  { pay: "hide", cost: 2, item: "ammo9", count: 18 },
  { pay: "electronics", cost: 2, item: "antibiotics", count: 1 },
  { pay: "rawmeat", cost: 3, item: "fuel", count: 2 },
  { pay: "ore", cost: 4, item: "battery", count: 1 },
];
export function tradeView() {
  return `<div class="trade-list"><div class="panel-title"><div><h2>米拉 · 幸存的医护员</h2><p>“物资可以交换，消息也是。不要走进没有退路的房间。”</p></div></div><p class="field-help">她提到，渡鸦要塞的军械库里留下了一张研究站访问卡。广播站缺少的元件，或许还能在黑岭工业区找到。</p><div class="divider"></div>${TRADES.map((t, n) => `<div class="trade-row">${icon(t.item, 42)}<div><h3>${ITEMS[t.item]!.name} ×${t.count}</h3><p>交换：${ITEMS[t.pay]!.name} ×${t.cost}</p></div><button data-action="trade" data-index="${n}">交换物资</button></div>`).join("")}</div>`;
}
export function safeMessage(text: string): string {
  return escapeHtml(text);
}
