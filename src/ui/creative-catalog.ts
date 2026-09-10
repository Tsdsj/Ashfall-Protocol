import { ITEM_LIST } from "../data/items";
import { icon, escapeHtml as esc } from "./icons";
import { categoryClass, categoryLabel, shortName } from "./item-presentation";
export function creativeCatalog(category: string): string {
  const categories = [
    "全部",
    ...new Set(ITEM_LIST.map((item) => item.category)),
  ];
  const items = ITEM_LIST.filter(
    (item) => category === "全部" || item.category === category,
  );
  return `<div class="creative-catalog"><div class="column-heading"><strong>创造物资</strong><span>${items.length} 种</span></div><p class="field-help">单击取 1 个；Shift + 单击取一组。物品直接放入左侧背包。</p><div class="creative-filters" role="group" aria-label="创造物资分类">${categories.map((c) => `<button class="${c === category ? "active" : ""}" data-action="creative-filter" data-filter="${esc(c)}">${c === "全部" ? c : categoryLabel(ITEM_LIST.find((item) => item.category === c)!.id)}</button>`).join("")}</div><div class="creative-item-grid" aria-label="创造物资目录">${items.map((item) => `<button class="creative-item ${categoryClass(item.id)}" data-action="creative-give" data-id="${item.id}" data-count="1" data-stack="${item.maxStack}" title="${esc(item.name)} · 单击取1个，Shift取${item.maxStack}个" aria-label="取 ${esc(item.name)}">${icon(item.id, 40)}<span>${esc(shortName(item.id))}</span><small>∞</small></button>`).join("")}</div></div>`;
}
