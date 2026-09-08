import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { populate, spawnActor } from "../src/simulation/population";
import { describe, it, expect } from "vitest";
import {
  addItem,
  newInventory,
  transfer,
  removeItem,
  moveItem,
  splitItem,
  validateInventory,
  countItem,
  makeStack,
  weight,
} from "../src/simulation/inventory";
import { createWorld, initialStats } from "../src/simulation/state";
import { generatePOIs, WorldGenerator } from "../src/world/generator";
import { generateLoot, CONTAINER_TYPES } from "../src/data/loot";
import { ITEM_LIST, ITEMS, BUILDING_KINDS } from "../src/data/items";
import { RECIPES } from "../src/data/recipes";
import { ENEMIES } from "../src/data/enemies";
import { craftTransaction } from "../src/simulation/crafting";
import { applyDamage, updateSurvival } from "../src/simulation/survival";
import { serialize, deserialize } from "../src/save/storage";
import { Simulation } from "../src/simulation/simulation";

describe("网格背包的守恒与边界", () => {
  it("空格不足时完全回滚添加，不会产生半个事务", () => {
    const inv = newInventory(1, 1);
    addItem(inv, "wood", 29);
    const before = structuredClone(inv);
    expect(addItem(inv, "wood", 2)).toBe(false);
    expect(inv).toEqual(before);
  });
  it("堆叠、拆分、转移保持物品总量", () => {
    const a = newInventory(4, 4),
      b = newInventory(4, 4);
    addItem(a, "ammo9", 75);
    expect(a.items.map((i) => i.count)).toEqual([60, 15]);
    expect(splitItem(a, a.items[0]!.uid)).toBe(true);
    const uid = a.items[0]!.uid;
    expect(transfer(a, b, uid, 10)).toBe(true);
    expect(countItem(a, "ammo9") + countItem(b, "ammo9")).toBe(75);
    expect(validateInventory(a)).toBe(true);
    expect(validateInventory(b)).toBe(true);
  });
  it("禁止覆盖和越界；旋转后允许横向放置", () => {
    const inv = newInventory(4, 2),
      s = makeStack("rifle");
    s.rotated = true;
    inv.items.push(s);
    expect(validateInventory(inv)).toBe(true);
    addItem(inv, "beans");
    expect(moveItem(inv, s.uid, 1, 0)).toBe(false);
    expect(moveItem(inv, s.uid, 0, 0, true)).toBe(false);
  });
  it("禁止负数量和向自身转移", () => {
    const inv = newInventory();
    addItem(inv, "wood", 3);
    expect(removeItem(inv, "wood", -1)).toBe(false);
    expect(transfer(inv, inv, inv.items[0]!.uid)).toBe(false);
    expect(countItem(inv, "wood")).toBe(3);
  });
  it("满包转移失败保留源物品", () => {
    const a = newInventory(),
      b = newInventory(1, 1);
    addItem(a, "rifle");
    addItem(b, "stone", 30);
    const before = structuredClone(a);
    expect(transfer(a, b, a.items[0]!.uid)).toBe(false);
    expect(a).toEqual(before);
  });
  it("装备和配件的重量计入负重", () => {
    const inv = newInventory();
    addItem(inv, "pistol");
    inv.items[0]!.attachments = ["scope"];
    expect(weight(inv)).toBeCloseTo(ITEMS.pistol!.weight + ITEMS.scope!.weight);
  });
});
describe("种子与内容分布", () => {
  it("同种子复现地图，换种子改变地图", () => {
    expect(generatePOIs("a")).toEqual(generatePOIs("a"));
    expect(generatePOIs("a")).not.toEqual(generatePOIs("b"));
  });
  it("分块边界共享完全相同高度", () => {
    const g = new WorldGenerator("test");
    for (let z = -256; z <= 512; z += 8)
      expect(g.height(256, z)).toBe(new WorldGenerator("test").height(256, z));
  });
  it("不同种子的城市道路与建筑入口保持同一标高", () => {
    for (const seed of ["urban-a", "urban-b", "urban-c"]) {
      const g = new WorldGenerator(seed);
      const city = g.pois.filter((p) => p.region === "city");
      expect(city.length).toBeGreaterThan(0);
      const level = g.poiHeight(city[0]!);
      for (const p of city) {
        expect(g.poiHeight(p)).toBe(level);
        expect(g.height(p.x, p.z - p.depth / 2 - 2)).toBe(level);
        expect(g.height(p.x, p.z)).toBe(level);
      }
    }
  });
  it("旧存档城市容器调整高度时保留搜索状态和剩余物资", () => {
    const sim = new Simulation(createWorld("urban-save"));
    const poi = sim.gen.pois.find((p) => p.region === "city")!;
    const container = sim.state.containers[poi.id + ":0"]!;
    container.position.y = -40;
    container.searched = true;
    container.inventory.items.pop();
    const inventory = structuredClone(container.inventory);
    populate(sim);
    expect(container.position.y).toBe(sim.gen.poiHeight(poi) + 0.5);
    expect(container.searched).toBe(true);
    expect(container.inventory).toEqual(inventory);
  });
  it("保证最小内容数量与全部引用可解析", () => {
    expect(ITEM_LIST.length).toBeGreaterThanOrEqual(30);
    for (const [kind, n] of [
      ["food", 8],
      ["drink", 5],
      ["medical", 8],
      ["clothing", 5],
      ["armor", 3],
    ] as const)
      expect(
        ITEM_LIST.filter((i) => i.category === kind).length,
      ).toBeGreaterThanOrEqual(n);
    expect(ITEM_LIST.filter((i) => i.weapon).length).toBeGreaterThanOrEqual(8);
    expect(
      ITEM_LIST.filter((i) => i.weapon?.ammo && i.id !== "bow").length,
    ).toBeGreaterThanOrEqual(5);
    expect(RECIPES.length).toBeGreaterThanOrEqual(20);
    expect(BUILDING_KINDS.length).toBeGreaterThanOrEqual(10);
    expect(CONTAINER_TYPES.length).toBeGreaterThanOrEqual(20);
    expect(generatePOIs("a").length).toBeGreaterThanOrEqual(50);
    expect(
      Object.values(ENEMIES).filter((e) => e.animal).length,
    ).toBeGreaterThanOrEqual(3);
    for (const r of RECIPES) {
      expect(ITEMS[r.output]).toBeDefined();
      for (const id of Object.keys(r.ingredients))
        expect(ITEMS[id]).toBeDefined();
    }
  });
  it("搜刮分布可复现且格子合法", () => {
    for (const p of generatePOIs("loot")) {
      const a = generateLoot("a", p.id, p.kind, p.danger),
        b = generateLoot("a", p.id, p.kind, p.danger);
      expect(a.items.map((i) => [i.id, i.count])).toEqual(
        b.items.map((i) => [i.id, i.count]),
      );
      expect(validateInventory(a)).toBe(true);
    }
  });
  it("新手与主线关键物品不会被随机数阻断", () => {
    expect(
      countItem(generateLoot("unlucky", "pine-0:1", "ranger", 1), "pistol"),
    ).toBe(1);
    for (let n = 0; n < 30; n++)
      expect(
        countItem(
          generateLoot("seed" + n, "fort-0:0", "military", 5),
          "keycard",
        ),
      ).toBe(1);
  });
});
describe("制作与使用", () => {
  it("制作成功消耗材料并提供产物", () => {
    const inv = newInventory();
    addItem(inv, "wood", 3);
    addItem(inv, "rope", 1);
    const r = RECIPES.find((r) => r.id === "spear")!;
    expect(craftTransaction(inv, r).ok).toBe(true);
    expect(countItem(inv, "wood")).toBe(0);
    expect(countItem(inv, "spear")).toBe(1);
  });
  it("输出放不下时材料仍完整存在", () => {
    const inv = newInventory(1, 2);
    addItem(inv, "wood", 3);
    addItem(inv, "rope", 1);
    const before = structuredClone(inv);
    expect(
      craftTransaction(
        inv,
        RECIPES.find((r) => r.id === "spear")!,
      ).ok,
    ).toBe(false);
    expect(inv).toEqual(before);
  });
  it("治疗、食物与装备效果改变同一份玩家状态", () => {
    const sim = new Simulation(createWorld("use"));
    addItem(sim.state.player.inventory, "bandage");
    sim.damage(20, "test");
    const id = sim.state.player.inventory.items.find(
      (i) => i.id === "bandage",
    )!.uid;
    sim.actions.use(id);
    expect(sim.state.player.stats.bleeding).toBe(0);
    expect(sim.state.player.stats.health).toBeGreaterThan(80);
    expect(countItem(sim.state.player.inventory, "bandage")).toBe(0);
  });
});
describe("伤害与生存", () => {
  it("护甲保护躯干，头部伤害独立", () => {
    expect(applyDamage(initialStats(), 20, "chest", 0.5)).toBe(10);
    expect(applyDamage(initialStats(), 20, "head", 0.5)).toBe(50);
  });
  it("持续脱水最终致死", () => {
    const p = createWorld("survival").player;
    p.stats.hydration = 0;
    for (let n = 0; n < 400; n++)
      updateSurvival(p, 1, {
        weather: "clear",
        time: 12,
        indoors: false,
        nearFire: false,
        moving: false,
        sprinting: false,
        swimming: false,
        difficulty: 1,
      });
    expect(p.stats.health).toBe(0);
  });
  it("雨夜使身体湿透和降温，火源能够恢复", () => {
    const p = createWorld("rain").player;
    const env = {
      weather: "rain" as const,
      time: 23,
      indoors: false,
      nearFire: false,
      moving: false,
      sprinting: false,
      swimming: false,
      difficulty: 1,
    };
    for (let n = 0; n < 300; n++) updateSurvival(p, 1, env);
    expect(p.stats.wetness).toBeGreaterThan(90);
    expect(p.stats.temperature).toBeLessThan(36);
    for (let n = 0; n < 120; n++)
      updateSurvival(p, 1, { ...env, indoors: true, nearFire: true });
    expect(p.stats.wetness).toBe(0);
    expect(p.stats.temperature).toBeGreaterThan(36);
  });
});
describe("战斗与存档闭环", () => {
  it("弹药消耗、换弹与热切换取消均受状态约束", () => {
    const sim = new Simulation(createWorld("combat"));
    addItem(sim.state.player.inventory, "pistol");
    addItem(sim.state.player.inventory, "ammo9", 20);
    const gun = sim.state.player.inventory.items.find(
      (i) => i.id === "pistol",
    )!;
    sim.actions.use(gun.uid);
    expect(sim.combat.fire({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 1 })).toBe(
      false,
    );
    expect(sim.combat.reload()).toBe(true);
    sim.combat.update(2);
    expect(gun.ammo).toBe(12);
    expect(countItem(sim.state.player.inventory, "ammo9")).toBe(8);
    expect(sim.combat.fire({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 1 })).toBe(
      true,
    );
    expect(gun.ammo).toBe(11);
    sim.combat.cooldown = 0;
    sim.combat.reload();
    sim.state.player.selected = 1;
    sim.combat.update(2);
    expect(gun.ammo).toBe(11);
    expect(countItem(sim.state.player.inventory, "ammo9")).toBe(8);
  });
  it("Babylon Vector3 相机射出的弹丸能够命中真实 AI，而不是生成 NaN 坐标", () => {
    const sim = new Simulation(createWorld("combat"));
    sim.state.actors = {};
    const actor = spawnActor(sim, "target", "walker", { x: -9, y: 0, z: -22 });
    addItem(sim.state.player.inventory, "pistol");
    const gun = sim.state.player.inventory.items.find(
      (i) => i.id === "pistol",
    )!;
    sim.actions.use(gun.uid);
    gun.ammo = 12;
    expect(
      sim.combat.fire(new Vector3(-9, 1.1, -30), new Vector3(0, 0, 1), true),
    ).toBe(true);
    for (let n = 0; n < 12; n++) sim.combat.update(1 / 120);
    expect(actor.health).toBeLessThan(70);
    expect(
      sim.combat.projectiles.every(
        (b) =>
          Number.isFinite(b.position.x) &&
          Number.isFinite(b.position.y) &&
          Number.isFinite(b.position.z),
      ),
    ).toBe(true);
  });
  it("投掷物从相机坐标开始并经过重力积分", () => {
    const sim = new Simulation(createWorld("grenade"));
    addItem(sim.state.player.inventory, "grenade");
    expect(
      sim.combat.throw(new Vector3(-9, 2, -30), new Vector3(0, 0, 1)),
    ).toBe(true);
    expect(sim.combat.grenades[0]!.position).toEqual({ x: -9, y: 2, z: -30 });
    sim.combat.update(0.1);
    expect(sim.combat.grenades[0]!.position.z).toBeGreaterThan(-30);
    expect(countItem(sim.state.player.inventory, "grenade")).toBe(0);
  });
  it("世界、搜刮、基地和车辆数据完整往返", () => {
    const sim = new Simulation(createWorld("save"));
    sim.state.structures.push({
      id: "test-build",
      kind: "storage",
      position: { x: 9, y: 0, z: -20 },
      rotation: 0,
      health: 80,
      fuel: 0,
      active: false,
      inventory: newInventory(),
      growth: 0,
      plantedAt: 0,
    });
    addItem(sim.state.structures.at(-1)!.inventory!, "wood", 12);
    sim.state.containers["pine-0:0"]!.searched = true;
    sim.state.vehicles[0]!.fuel = 7;
    expect(deserialize(serialize(sim.state))).toEqual(sim.state);
  });
  it("拒绝未知 schema、损坏库存和非有限状态", () => {
    expect(() => deserialize('{"version":2}')).toThrow();
    const s = createWorld("bad");
    s.player.stats.health = Infinity;
    expect(() => serialize(s)).toThrow();
    const s2 = createWorld("bad2");
    s2.player.inventory.items[0]!.count = -1;
    expect(() => serialize(s2)).toThrow();
  });
  it("关闭的门会阻挡角色，开门后可穿行", () => {
    const sim = new Simulation(createWorld("doors"));
    const p = sim.gen.pois.find((p) => p.id === "pine-0")!;
    expect(sim.collision.blocked(p.x, 0, p.z - p.depth / 2)).toBe(true);
    sim.actions.door(p.id);
    expect(sim.collision.blocked(p.x, 0, p.z - p.depth / 2)).toBe(false);
  });
  it("死亡掉落背包并从营地恢复，灰烬难度阻止重生", () => {
    const sim = new Simulation(createWorld("death"));
    sim.damage(1000, "test");
    expect(sim.state.flags).toContain("player-dead");
    expect(sim.actions.respawn()).toBe(true);
    expect(
      Object.values(sim.state.containers).some(
        (c) => c.name === "你的遗落背包",
      ),
    ).toBe(true);
    expect(sim.state.player.stats.health).toBe(100);
    const perm = new Simulation(createWorld("perm", "test", "ashfall"));
    expect(perm.actions.respawn()).toBe(false);
  });
});
