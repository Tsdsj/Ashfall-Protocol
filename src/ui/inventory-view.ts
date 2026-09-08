import { ITEMS } from "../data/items";
import { dimensions, weight } from "../simulation/inventory";
import type { EquipSlot, InventoryData, Stack } from "../core/types";
import type { Simulation } from "../simulation/simulation";
import { icon, escapeHtml } from "./icons";
export function grid(
  inv: InventoryData,
  source: string,
  sim: Simulation,
  selectedUid: string,
): string {
  const cells = Array.from(
    { length: inv.width * inv.height },
    () => '<i class="grid-cell"></i>',
  ).join("");
  return `<div class="inventory-grid" data-grid="${source}" style="--cols:${inv.width};--rows:${inv.height}" aria-label="${source === "player" ? "玩家背包" : "物资容器"}">${cells}${inv.items
    .map((i) => {
      const d = ITEMS[i.id]!,
        [w, h] = dimensions(i),
        equipped = Object.values(sim.state.player.equipment).includes(i.uid);
      return `<button class="grid-item ${d.rarity} ${selectedUid === i.uid ? "selected" : ""}" draggable="true" data-action="select-item" data-uid="${i.uid}" data-source="${source}" style="--x:${i.x};--y:${i.y};--w:${w};--h:${h}" title="${d.name} ×${i.count} · 双击${source === "player" ? "使用 / 装备" : "取走"}" aria-label="${d.name}，数量 ${i.count}"><span class="item-svg">${icon(i.id, 60)}</span>${i.count > 1 ? `<span class="count">${i.count}</span>` : ""}${equipped ? '<span class="equipped-mark" title="已装备"></span>' : ""}</button>`;
    })
    .join("")}</div>`;
}
const slots: [EquipSlot, string, string][] = [
  ["head", "头部", "beanie"],
  ["face", "面部", "medical"],
  ["chest", "上装", "jacket"],
  ["hands", "手套", "gloves"],
  ["legs", "长裤", "pants"],
  ["feet", "鞋靴", "boots"],
  ["back", "背包", "backpack"],
  ["vest", "护甲", "armor"],
];
export function resolveInventory(
  sim: Simulation,
  source: string,
): InventoryData | undefined {
  if (source === "player") return sim.state.player.inventory;
  if (source.startsWith("structure:"))
    return sim.state.structures.find((b) => b.id === source.slice(10))
      ?.inventory;
  if (source.startsWith("vehicle:"))
    return sim.state.vehicles.find((v) => v.id === source.slice(8))?.inventory;
  return sim.state.containers[source]?.inventory;
}
export function itemDetail(item: Stack | undefined, source: string): string {
  if (!item)
    return `<div class="selected-detail"><div class="detail-art">${icon("backpack", 64)}</div><div class="detail-main"><h3>随身物资</h3><p>选择物品查看详情。双击使用或装备，拖拽整理位置，R 旋转选中的物品。</p></div></div>`;
  const d = ITEMS[item.id]!,
    player = source === "player";
  return `<div class="selected-detail"><div class="detail-art">${icon(item.id, 70)}</div><div class="detail-main"><h3>${d.name}</h3><p>${d.description}</p><div class="detail-attrs"><span>${(d.weight * item.count).toFixed(2)} kg</span><span>${d.width} × ${d.height}</span>${d.weapon || d.slot ? `<span>耐久 ${Math.round(item.durability)}%</span>` : ""}${d.perishable ? `<span>新鲜度 ${Math.round(item.freshness)}%</span>` : ""}${d.weapon ? `<span>伤害 ${d.weapon.damage} / 射程 ${d.weapon.range}m</span>` : ""}</div><div class="button-row">${player ? `<button data-action="use-item" data-uid="${item.uid}">${d.weapon || d.category === "tool" ? "装备武器" : d.slot ? "穿戴装备" : d.category === "electronic" ? "安装配件" : d.structure ? "打开建造" : "使用物品"}</button><button class="secondary" data-action="drop-item" data-uid="${item.uid}">放下</button>${item.count > 1 ? `<button class="secondary" data-action="split-item" data-uid="${item.uid}">拆分</button>` : ""}<button class="secondary" data-action="rotate-item" data-uid="${item.uid}">旋转</button>${d.weapon || d.slot ? `<button class="secondary" data-action="repair-item" data-uid="${item.uid}">维修 · 2 废金属</button>` : ""}` : `<button class="primary" data-action="take-item" data-uid="${item.uid}" data-source="${source}">取走物品</button>`}</div>${player ? `<div class="slot-assign">快捷栏 ${[0, 1, 2, 3, 4].map((n) => `<button data-action="assign-slot" data-uid="${item.uid}" data-slot="${n}" title="分配到快捷栏 ${n + 1}">${n + 1}</button>`).join("")}</div>` : ""}${item.attachments.length ? `<div class="slot-assign">配件 ${item.attachments.map((id) => `<button data-action="detach" data-uid="${item.uid}" data-id="${id}">${ITEMS[id]!.name} ×</button>`).join("")}</div>` : ""}</div></div>`;
}
export function inventoryView(
  sim: Simulation,
  nearbySource: string,
  selectedUid: string,
  selectedSource: string,
): string {
  const p = sim.state.player,
    nearby = resolveInventory(sim, nearbySource),
    selected = resolveInventory(sim, selectedSource)?.items.find(
      (i) => i.uid === selectedUid,
    );
  const kg = weight(p.inventory);
  const nearbyName =
    sim.state.containers[nearbySource]?.name ??
    (nearbySource.startsWith("vehicle") ? "车辆储物空间" : "营地储物空间");
  return `<div class="inventory-layout"><section class="equipment-column"><div class="column-heading"><strong>幸存者装备</strong><span>载重</span></div><div class="equipment-slots">${slots
    .map(([slot, label, fallback]) => {
      const i = p.inventory.items.find((i) => i.uid === p.equipment[slot]);
      return `<button class="equip-slot ${i ? "" : "empty"}" data-action="select-item" data-source="player" data-uid="${i?.uid ?? ""}">${icon(i?.id ?? fallback, 30)}<span class="equip-copy"><span>${label}</span>${i ? ITEMS[i.id]!.name : "未装备"}</span></button>`;
    })
    .join(
      "",
    )}</div><div class="divider"></div><small>装备仍占用背包空间。绿色标记表示当前穿戴或持有。</small></section><section class="inventory-main"><div class="column-heading"><strong>随身背包</strong><button class="secondary" data-action="sort-inventory">整理</button></div>${grid(p.inventory, "player", sim, selectedUid)}<div class="inventory-meta"><span class="mono ${kg > 38 ? "warning" : ""}">${kg.toFixed(1)} / 38.0 kg</span><span>${p.inventory.items.length} 组物资</span></div><div class="carry-meter"><i style="width:${Math.min(100, (kg / 38) * 100)}%"></i></div>${itemDetail(selected, selectedSource)}</section><section class="nearby-column"><div class="column-heading"><strong>${nearby ? escapeHtml(nearbyName) : "附近物资"}</strong>${nearby ? `<button class="secondary" data-action="take-all" data-source="${nearbySource}" ${nearby.items.length ? "" : "disabled"}>全部取走</button>` : ""}</div>${nearby ? grid(nearby, nearbySource, sim, selectedUid) : `<div class="nearby-empty">${icon("storage", 44)}<p>靠近柜子、箱子或遗留物，按 E 搜索其中的物资。</p></div>`}<div class="inventory-meta"><span>${nearby ? "可拖拽物品，在两侧空间之间转移。" : "物品不会凭空刷新，请继续探索。"}</span></div>${nearby && !nearby.items.length ? '<p class="field-help" style="margin-top:20px">已经搜空。这里暂时没有可拿取的物资。</p>' : ""}</section></div>`;
}
