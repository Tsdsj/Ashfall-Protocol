import { ITEM_LIST } from "../data/items";
import type { Simulation } from "../simulation/simulation";
import { categoryLabel } from "./item-presentation";
import { icon, escapeHtml as esc } from "./icons";
export function creativeView(sim: Simulation, category: string): string {
  if (!sim.creative) return "<p>仅创造练习模式可使用物资目录。</p>";
  const categories = [
    "全部",
    ...new Set(ITEM_LIST.map((item) => item.category)),
  ];
  const items = ITEM_LIST.filter(
    (item) => category === "全部" || item.category === category,
  );
  return `<div class="craft-layout"><nav class="filter-list" aria-label="创造物资类别">${categories.map((c) => `<button data-action="creative-filter" data-filter="${esc(c)}" class="${c === category ? "active" : ""}">${c === "全部" ? c : esc(categoryLabel(ITEM_LIST.find((item) => item.category === c)!.id))}</button>`).join("")}</nav><section><div class="panel-title"><div><h2>创造物资</h2><p>F6 切换飞行；空格上升、Ctrl 下降、Shift 加速。取物仍需背包有空位。</p></div></div><div class="recipe-list">${items.map((item) => `<article class="recipe-row">${icon(item.id, 44)}<span class="recipe-copy"><strong>${esc(item.name)}</strong><small>${esc(item.description)}</small></span><span class="button-row"><button class="secondary" data-action="creative-give" data-id="${item.id}" data-count="1">取 1</button>${item.maxStack > 1 ? `<button data-action="creative-give" data-id="${item.id}" data-count="${item.maxStack}">取一组</button>` : ""}</span></article>`).join("")}</div></section><aside class="recipe-detail"><h3>创造练习</h3><p>用于自由探索、体验装备和营地搭建。你不会受到伤害，体力无限，可以自由飞行并直接取得物品；建筑组件不消耗材料。飞行会忽略碰撞，便于检查场景，退出飞行后恢复正常碰撞。</p><p>故事任务仍按自己的进度推进，不会自动替你完成调查。</p><button class="secondary" data-action="open-building">打开建造</button></aside></div>`;
}
