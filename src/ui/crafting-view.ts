import { BUILDING_KINDS, ITEMS } from "../data/items";
import { countItem } from "../simulation/inventory";
import type { Simulation } from "../simulation/simulation";
import { icon, escapeHtml } from "./icons";
export function craftingView(
  sim: Simulation,
  filter: string,
  selectedId: string,
): string {
  const categories = [
      "全部",
      "野外制作",
      "医疗",
      "烹饪",
      "工具机械",
      "装备",
      "营地建造",
    ],
    recipes = sim.recipes.filter(
      (r) => filter === "全部" || r.category === filter,
    ),
    selected = sim.recipes.find((r) => r.id === selectedId) ?? recipes[0]!;
  const inv = sim.state.player.inventory;
  const status = sim.craftStatus(selected.id),
    available = status.ok;
  return `<div class="craft-layout"><nav class="filter-list" aria-label="配方类别">${categories.map((c) => `<button class="${filter === c ? "active" : ""}" data-action="craft-filter" data-filter="${c}">${c}<small>${c === "全部" ? sim.recipes.length : sim.recipes.filter((r) => r.category === c).length}</small></button>`).join("")}</nav><section><div class="column-heading"><strong>制作配方</strong><span>${recipes.length} 项</span></div><p class="field-help">入门：林务站门前可拾取旧帆布、废铁和小石块。2 布料可编 1 绳；铁镐需要 2 木材、2 废金属、1 绳，徒手即可制作。裸手可拾小石块，持镐采石收益更高。</p><div class="recipe-list">${recipes
    .map((r) => {
      const rowStatus = sim.craftStatus(r.id),
        ready = rowStatus.ok;
      return `<button class="recipe-row ${selected.id === r.id ? "selected" : ""}" data-action="select-recipe" data-id="${r.id}">${icon(r.output, 44)}<span class="recipe-copy"><strong>${r.name}${r.count > 1 ? " ×" + r.count : ""}</strong><small>${Object.entries(
        r.ingredients,
      )
        .map(([id, n]) => `${ITEMS[id]!.name} ${n}`)
        .join(
          " · ",
        )}</small></span><span class="recipe-status ${ready ? "" : "unavailable"}">${escapeHtml(rowStatus.reason)}</span></button>`;
    })
    .join(
      "",
    )}</div></section><aside class="recipe-detail"><div class="recipe-preview">${icon(selected.output, 120)}</div><h3>${ITEMS[selected.output]!.name}</h3><p>${ITEMS[selected.output]!.description}</p><div class="ingredient-list">${Object.entries(
    selected.ingredients,
  )
    .map(([id, n]) => {
      const have = countItem(inv, id);
      return `<div class="ingredient">${icon(id, 24)}<span>${ITEMS[id]!.name}</span><span class="quantity ${have >= n ? "good" : "warning"}">${have} / ${n}</span></div>`;
    })
    .join(
      "",
    )}</div><div class="station-line">设施：${{ hand: "徒手制作", fire: "燃烧的篝火", workbench: "附近的工作台", power: "通电的工作台" }[selected.station]} · ${selected.seconds} 秒</div><button class="primary craft-button" data-action="craft" data-id="${selected.id}" ${available && !sim.craftJob ? "" : "disabled"}>${available ? "开始制作" : escapeHtml(status.reason)}</button><div class="craft-progress"><i id="craft-progress" style="width:0%"></i></div><p class="field-help" style="margin-top:15px">${selected.description} 制作失败不会消耗材料。</p></aside></div>`;
}
export function buildingView(sim: Simulation): string {
  return `<div style="max-width:1160px;margin:auto"><div class="panel-title"><div><h2>建立你的安全地带</h2><p>${sim.creative ? "创造模式可直接选择组件。" : "先制作组件，再选中放置。"}木地基、墙体与屋顶采用 4 米网格拼接。</p></div><button class="secondary" data-action="open-crafting-building">制作建筑组件</button></div><div class="building-grid">${BUILDING_KINDS.map(
    ([id, name]) => {
      const n = sim.creative
        ? Infinity
        : countItem(sim.state.player.inventory, "kit_" + id);
      return `<button class="building-choice" data-action="choose-building" data-id="${id}" ${n ? "" : "disabled"}>${icon("kit_" + id, 56)}<strong>${name}</strong><small>${n ? "选择后进入放置模式" : "需要先制作组件"}</small>${n ? `<span class="count-tag">${n === Infinity ? "无限" : "×" + n}</span>` : ""}</button>`;
    },
  ).join(
    "",
  )}</div><div class="divider"></div><p class="field-help">放置时，鼠标选择位置，R 旋转，E 或鼠标左键确认，Esc 取消。篝火提供热源，睡袋允许休息与重生，发电机为附近照明和设备供电。</p></div>`;
}
