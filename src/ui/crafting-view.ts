import { BUILDING_KINDS, ITEMS } from "../data/items";
import { RECIPES } from "../data/recipes";
import { countItem } from "../simulation/inventory";
import { craftTransaction } from "../simulation/crafting";
import type { Simulation } from "../simulation/simulation";
import { icon } from "./icons";
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
    recipes = RECIPES.filter((r) => filter === "全部" || r.category === filter),
    selected = RECIPES.find((r) => r.id === selectedId) ?? recipes[0]!;
  const inv = sim.state.player.inventory;
  const available =
    craftTransaction(structuredClone(inv), selected).ok &&
    sim.stationAvailable(selected.station);
  return `<div class="craft-layout"><nav class="filter-list" aria-label="配方类别">${categories.map((c) => `<button class="${filter === c ? "active" : ""}" data-action="craft-filter" data-filter="${c}">${c}<small>${c === "全部" ? RECIPES.length : RECIPES.filter((r) => r.category === c).length}</small></button>`).join("")}</nav><section><div class="column-heading"><strong>制作配方</strong><span>${recipes.length} 项</span></div><div class="recipe-list">${recipes
    .map((r) => {
      const ready =
        Object.entries(r.ingredients).every(
          ([id, n]) => countItem(inv, id) >= n,
        ) && sim.stationAvailable(r.station);
      return `<button class="recipe-row ${selected.id === r.id ? "selected" : ""}" data-action="select-recipe" data-id="${r.id}">${icon(r.output, 44)}<span class="recipe-copy"><strong>${r.name}${r.count > 1 ? " ×" + r.count : ""}</strong><small>${Object.entries(
        r.ingredients,
      )
        .map(([id, n]) => `${ITEMS[id]!.name} ${n}`)
        .join(
          " · ",
        )}</small></span><span class="recipe-status ${ready ? "" : "unavailable"}">${ready ? "可以制作" : "材料 / 设施不足"}</span></button>`;
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
    )}</div><div class="station-line">设施：${{ hand: "徒手制作", fire: "燃烧的篝火", workbench: "附近的工作台", power: "通电的工作台" }[selected.station]} · ${selected.seconds} 秒</div><button class="primary craft-button" data-action="craft" data-id="${selected.id}" ${available && !sim.craftJob ? "" : "disabled"}>${sim.craftJob ? "制作中…" : available ? "开始制作" : "材料或设施不足"}</button><div class="craft-progress"><i id="craft-progress" style="width:0%"></i></div><p class="field-help" style="margin-top:15px">${selected.description} 制作失败不会消耗材料。</p></aside></div>`;
}
export function buildingView(sim: Simulation): string {
  return `<div style="max-width:1160px;margin:auto"><div class="panel-title"><div><h2>建立你的安全地带</h2><p>先制作组件，再选中放置。木地基、墙体与屋顶采用 4 米网格拼接。</p></div><button class="secondary" data-action="open-crafting-building">制作建筑组件</button></div><div class="building-grid">${BUILDING_KINDS.map(
    ([id, name]) => {
      const n = countItem(sim.state.player.inventory, "kit_" + id);
      return `<button class="building-choice" data-action="choose-building" data-id="${id}" ${n ? "" : "disabled"}>${icon("kit_" + id, 56)}<strong>${name}</strong><small>${n ? "选择后进入放置模式" : "需要先制作组件"}</small>${n ? `<span class="count-tag">×${n}</span>` : ""}</button>`;
    },
  ).join(
    "",
  )}</div><div class="divider"></div><p class="field-help">放置时，鼠标选择位置，R 旋转，E 或鼠标左键确认，Esc 取消。篝火提供热源，睡袋允许休息与重生，发电机为附近照明和设备供电。</p></div>`;
}
