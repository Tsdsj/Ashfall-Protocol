import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/data/items";
import { createWorld } from "../src/simulation/state";
import { Simulation } from "../src/simulation/simulation";
import { addItem, newInventory } from "../src/simulation/inventory";
import { grid, inventoryView, itemDetail } from "../src/ui/inventory-view";

describe("playtest inventory presentation", () => {
  it("hides worn clothing from cells while preserving selectable equipment and expanded capacity", () => {
    const sim = new Simulation(createWorld("ui-worn"));
    const p = sim.state.player;
    const jacket = p.inventory.items.find((i) => i.id === "jacket")!;
    const cells = grid(p.inventory, "player", sim, "");
    expect(cells).not.toContain(`data-uid="${jacket.uid}"`);
    expect(cells).toContain("--cols:10;--rows:12");
    expect(cells.match(/class="grid-cell"/g)).toHaveLength(120);
    expect(cells).toContain('class="inventory-grid-scroll"');
    const view = inventoryView(sim, "", jacket.uid, "player");
    expect(view).toContain(`data-uid="${jacket.uid}"`);
    expect(view).toContain("卸下装备");
    expect(view).toContain("穿戴中 · 不占格");
    expect(view).toContain("2 组物资 · 10 × 12 格");
    expect(view).not.toContain("装备仍占用背包空间");
  });
  it("shows short names and category text for visually similar material stacks", () => {
    const sim = new Simulation(createWorld("ui-categories"));
    const inv = newInventory();
    addItem(inv, "tire");
    addItem(inv, "battery");
    const html = grid(inv, "loot", sim, "");
    expect(html).toContain("item-category-material");
    expect(html).toContain('class="grid-category">材料</span>');
    expect(html).toContain('class="grid-item-name">轮胎</span>');
    expect(html).toContain('class="grid-item-name">蓄电池</span>');
  });
  it("distinguishes unit weight, whole stack weight, and installed attachment weight", () => {
    const inv = newInventory();
    addItem(inv, "beans", 3);
    const food = itemDetail(inv.items[0], "player", inv);
    expect(food).toContain("单件 0.40 kg");
    expect(food).toContain("整堆 1.20 kg · 3 件");
    addItem(inv, "knife");
    const knife = inv.items.find((i) => i.id === "knife")!;
    knife.attachments = ["scope"];
    const detailed = itemDetail(knife, "player", inv);
    expect(detailed).toContain(
      `整堆 ${(ITEMS.knife!.weight + ITEMS.scope!.weight).toFixed(2)} kg · 1 件（含配件）`,
    );
  });
  it("keeps the exact 38kg boundary normal and marks excess as overweight", () => {
    const sim = new Simulation(createWorld("ui-weight"));
    sim.state.player.inventory = newInventory();
    sim.state.player.equipment = {};
    addItem(sim.state.player.inventory, "stone", 95);
    expect(inventoryView(sim, "", "", "player")).toContain(
      "38.00 / 38.00 kg · 正常",
    );
    addItem(sim.state.player.inventory, "nails");
    expect(inventoryView(sim, "", "", "player")).toContain("38.04 / 38.00 kg · 超重");
  });
});
