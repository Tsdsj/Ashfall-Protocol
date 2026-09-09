import { describe, it, expect } from "vitest";
import { Simulation } from "../src/simulation/simulation";
import { createWorld } from "../src/simulation/state";
import { addItem, countItem } from "../src/simulation/inventory";
import { deserialize, serialize } from "../src/save/storage";

describe("有过程的交互与原子消耗", () => {
  it("饮用完成前不加水分、不消耗物品，完成后仅执行一次", () => {
    const sim = new Simulation(createWorld("drink-action")),
      p = sim.state.player;
    p.stats.hydration = 20;
    const uid = p.inventory.items.find((i) => i.id === "water")!.uid;
    expect(sim.actions.use(uid)).toBe(true);
    expect(sim.actions.pending?.kind).toBe("drink");
    sim.actions.update(0.5);
    expect(p.stats.hydration).toBe(20);
    expect(countItem(p.inventory, "water")).toBe(1);
    sim.actions.update(0.6);
    expect(p.stats.hydration).toBeGreaterThan(20);
    expect(countItem(p.inventory, "water")).toBe(0);
    const hydration = p.stats.hydration;
    sim.actions.update(10);
    expect(p.stats.hydration).toBe(hydration);
  });
  it("主动取消保留物资和身体状态", () => {
    const sim = new Simulation(createWorld("cancel-action")),
      p = sim.state.player;
    const before = structuredClone(p);
    sim.actions.use(p.inventory.items.find((i) => i.id === "water")!.uid);
    sim.actions.update(0.4);
    sim.actions.cancel();
    sim.actions.update(2);
    expect(p).toEqual(before);
    expect(sim.actions.pending).toBeNull();
  });
  it("操作中将物品移走会取消，不凭空产生效果", () => {
    const sim = new Simulation(createWorld("move-action")),
      p = sim.state.player;
    p.stats.hydration = 20;
    const uid = p.inventory.items.find((i) => i.id === "water")!.uid;
    sim.actions.use(uid);
    sim.actions.drop(uid);
    sim.actions.update(2);
    expect(p.stats.hydration).toBe(20);
    expect(sim.actions.pending).toBeNull();
    expect(
      Object.values(sim.state.containers).some(
        (c) => countItem(c.inventory, "water") === 1,
      ),
    ).toBe(true);
  });
  it("重复点击不会叠加队列或重复消耗", () => {
    const sim = new Simulation(createWorld("repeat-action")),
      p = sim.state.player;
    addItem(p.inventory, "water", 2);
    const uid = p.inventory.items.find((i) => i.id === "water")!.uid;
    expect(sim.actions.use(uid)).toBe(true);
    expect(sim.actions.use(uid)).toBe(false);
    sim.actions.update(3);
    expect(countItem(p.inventory, "water")).toBe(2);
  });
  it("离开搜索范围取消动作，不执行搜索结果", () => {
    const sim = new Simulation(createWorld("range-action"));
    let searched = false;
    sim.actions.begin(
      "search",
      "搜索",
      1,
      () => {
        searched = true;
        return true;
      },
      { target: { ...sim.state.player.position } },
    );
    sim.state.player.position.x += 5;
    sim.actions.update(2);
    expect(searched).toBe(false);
    expect(sim.actions.pending).toBeNull();
  });
  it("受到明显攻击会打断包扎，保留尚未使用的绷带", () => {
    const sim = new Simulation(createWorld("hit-action")),
      p = sim.state.player;
    addItem(p.inventory, "bandage");
    p.stats.bleeding = 2;
    sim.actions.use(p.inventory.items.find((i) => i.id === "bandage")!.uid);
    sim.actions.update(0.3);
    sim.damage(10, "测试攻击");
    sim.actions.update(2);
    expect(p.stats.bleeding).toBeGreaterThan(0);
    expect(countItem(p.inventory, "bandage")).toBe(1);
    expect(sim.actions.pending).toBeNull();
  });
  it("动作中保存和重载不会消耗物品或恢复半次治疗", () => {
    const sim = new Simulation(createWorld("save-action"));
    sim.state.player.stats.hydration = 20;
    sim.actions.use(
      sim.state.player.inventory.items.find((i) => i.id === "water")!.uid,
    );
    sim.actions.update(0.3);
    const restored = new Simulation(deserialize(serialize(sim.state)));
    restored.actions.update(3);
    expect(restored.actions.pending).toBeNull();
    expect(restored.state.player.stats.hydration).toBe(20);
    expect(countItem(restored.state.player.inventory, "water")).toBe(1);
  });
  it("制作与双手动作互斥，取消制作保留材料", () => {
    const sim = new Simulation(createWorld("hands-busy")),
      p = sim.state.player;
    addItem(p.inventory, "wood", 3);
    addItem(p.inventory, "rope", 1);
    expect(sim.startCraft("spear")).toBe(true);
    expect(
      sim.actions.use(p.inventory.items.find((i) => i.id === "water")!.uid),
    ).toBe(false);
    sim.cancelCraft();
    expect(countItem(p.inventory, "wood")).toBe(3);
    expect(countItem(p.inventory, "spear")).toBe(0);
    expect(
      sim.actions.use(p.inventory.items.find((i) => i.id === "water")!.uid),
    ).toBe(true);
    expect(sim.startCraft("spear")).toBe(false);
  });
});
