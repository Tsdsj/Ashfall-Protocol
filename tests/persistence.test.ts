import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { SaveSystem, deserialize, serialize } from "../src/save/storage";
import { createWorld } from "../src/simulation/state";
import { Simulation } from "../src/simulation/simulation";
import { addItem, countItem } from "../src/simulation/inventory";
import { populate } from "../src/simulation/population";
import { scatterTrees } from "../src/world/scatter";

describe("持久化与世界状态", () => {
  it("IndexedDB 异步事务保存、列出、读取和删除均有效", async () => {
    const store = new SaveSystem(),
      state = createWorld("database", "真实事务");
    await store.save(state, "test-slot");
    expect((await store.list()).some((s) => s.id === "test-slot")).toBe(true);
    expect(await store.load("test-slot")).toEqual(state);
    await store.delete("test-slot");
    await expect(store.load("test-slot")).rejects.toThrow();
  });
  it("旧版 v1 存档补入默认世界规则且不丢失玩家数据", () => {
    const state = createWorld("legacy"),
      raw = JSON.parse(serialize(state));
    raw.version = 1;
    delete raw.rules;
    const restored = deserialize(JSON.stringify(raw));
    expect(restored.rules.dayLength).toBe(60);
    expect(restored.player).toEqual(state.player);
  });
  it("回收初始营地后不会被世界生成器重复生成", () => {
    const sim = new Simulation(createWorld("camp"));
    expect(sim.building.reclaim("ranger-bench")).toBe(true);
    populate(sim);
    expect(sim.state.structures.some((b) => b.id === "ranger-bench")).toBe(
      false,
    );
    expect(countItem(sim.state.player.inventory, "kit_workbench")).toBe(1);
  });
  it("种植箱收获新鲜作物，不能凭空获得罐头", () => {
    const sim = new Simulation(createWorld("farm"));
    sim.state.structures.push({
      id: "farm",
      kind: "planter",
      position: { ...sim.state.player.position },
      rotation: 0,
      health: 100,
      fuel: 0,
      active: false,
      growth: 100,
      plantedAt: 1,
    });
    expect(sim.building.interact("farm")).toBe(true);
    expect(countItem(sim.state.player.inventory, "turnip")).toBe(3);
    expect(countItem(sim.state.player.inventory, "seeds")).toBe(2);
    expect(sim.state.structures.find((b) => b.id === "farm")!.growth).toBe(0);
  });
  it("回收装满物品的箱子会保留箱子和全部内容", () => {
    const sim = new Simulation(createWorld("storage"));
    const inventory = { width: 4, height: 4, items: [] };
    addItem(inventory, "wood", 4);
    sim.state.structures.push({
      id: "box",
      kind: "storage",
      position: { ...sim.state.player.position },
      rotation: 0,
      health: 100,
      fuel: 0,
      active: false,
      growth: 0,
      plantedAt: 0,
      inventory,
    });
    expect(sim.building.reclaim("box")).toBe(false);
    expect(
      sim.state.structures.find((b) => b.id === "box")!.inventory!.items[0]!
        .count,
    ).toBe(4);
  });
  it("树干碰撞与渲染使用相同的散布规则", () => {
    const sim = new Simulation(createWorld("tree-collision"));
    const tree = scatterTrees(sim.gen, 0, 0)[0]!;
    expect(
      sim.collision.blocked(tree.position.x, tree.position.y, tree.position.z),
    ).toBe(true);
  });
  it("破碎窗户能够传递视线，完整窗户仍阻隔碰撞", () => {
    const sim = new Simulation(createWorld("window"));
    const p = sim.gen.pois.find((p) => p.id === "pine-0")!,
      z = p.z - (p.depth / 2) * 0.46,
      y = sim.gen.poiHeight(p) + 1.7;
    const from = { x: p.x + p.width / 2 - 2, y, z },
      to = { x: p.x + p.width / 2 + 2, y, z };
    expect(sim.collision.visible(from, to)).toBe(false);
    sim.state.destroyed.push(p.id + ":glass:1:" + z);
    expect(sim.collision.visible(from, to)).toBe(true);
  });
  it("世界时长配置会改变时间推进速度", () => {
    const fast = new Simulation(
        createWorld("clock", "fast", "standard", { dayLength: 30 }),
      ),
      slow = new Simulation(
        createWorld("clock", "slow", "standard", { dayLength: 90 }),
      );
    const input = {
      forward: 0,
      side: 0,
      sprint: false,
      jump: false,
      brake: false,
    };
    for (let n = 0; n < 60; n++) {
      fast.update(0.05, input);
      slow.update(0.05, input);
    }
    expect((fast.state.time - 15.4) / (slow.state.time - 15.4)).toBeCloseTo(3);
  });
  it("武器卡壳和脏污独立保存，换一把武器不继承卡壳", () => {
    const sim = new Simulation(createWorld("jam"));
    addItem(sim.state.player.inventory, "pistol");
    addItem(sim.state.player.inventory, "rifle");
    const pistol = sim.state.player.inventory.items.find(
        (i) => i.id === "pistol",
      )!,
      rifle = sim.state.player.inventory.items.find((i) => i.id === "rifle")!;
    sim.actions.use(pistol.uid);
    sim.combat.jammed = true;
    pistol.dirt = 82;
    sim.actions.use(rifle.uid);
    expect(sim.combat.jammed).toBe(false);
    const restored = deserialize(serialize(sim.state));
    expect(
      restored.player.inventory.items.find((i) => i.id === "pistol")!.jammed,
    ).toBe(true);
    expect(
      restored.player.inventory.items.find((i) => i.id === "pistol")!.dirt,
    ).toBe(82);
  });
  it("拆除篝火返还部分材料，不能刷出满燃料组件", () => {
    const sim = new Simulation(createWorld("fuel"));
    expect(sim.building.reclaim("ranger-fire")).toBe(true);
    expect(countItem(sim.state.player.inventory, "kit_campfire")).toBe(0);
    expect(countItem(sim.state.player.inventory, "wood")).toBe(1);
    expect(countItem(sim.state.player.inventory, "stone")).toBe(3);
  });
  it("导入拒绝字符串坐标、非法装备引用和超量弹匣", () => {
    const a = createWorld("invalid");
    const raw = JSON.parse(serialize(a));
    raw.player.position.x = "12";
    expect(() => deserialize(JSON.stringify(raw))).toThrow();
    const bad = JSON.parse(serialize(a));
    bad.player.equipment.head = bad.player.inventory.items[0].uid;
    expect(() => deserialize(JSON.stringify(bad))).toThrow();
    const magazine = JSON.parse(serialize(a));
    magazine.player.inventory.items[0].ammo = 100;
    expect(() => deserialize(JSON.stringify(magazine))).toThrow();
  });
  it("睡眠同步消耗燃料和新鲜度，出血时不能睡眠", () => {
    const sim = new Simulation(createWorld("sleep"));
    sim.state.actors = {};
    const p = sim.state.player.position;
    sim.state.structures.push({
      id: "sleep-bed",
      kind: "bed",
      position: { ...p },
      rotation: 0,
      health: 100,
      fuel: 0,
      active: false,
      growth: 0,
      plantedAt: 0,
    });
    const fire = sim.state.structures.find((b) => b.kind === "campfire")!;
    fire.active = true;
    fire.fuel = 20;
    addItem(sim.state.player.inventory, "rawmeat");
    sim.state.player.stats.bleeding = 1;
    expect(sim.actions.sleep("sleep-bed")).toBe(false);
    sim.state.player.stats.bleeding = 0;
    expect(sim.actions.sleep("sleep-bed")).toBe(true);
    expect(fire.fuel).toBe(0);
    expect(fire.active).toBe(false);
    expect(
      sim.state.player.inventory.items.find((i) => i.id === "rawmeat")!
        .freshness,
    ).toBeLessThan(90);
  });
});
