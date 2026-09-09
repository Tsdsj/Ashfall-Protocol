import { describe, it, expect } from "vitest";
import { Simulation } from "../src/simulation/simulation";
import { createWorld } from "../src/simulation/state";
import { newInventory, countItem, addItem } from "../src/simulation/inventory";
import { facilityOrigin } from "../src/world/facility";
import type { StructureData } from "../src/core/types";
const built = (kind: string, x = 0, z = 0): StructureData => ({
  id: "build-" + kind,
  kind,
  position: { x, y: 0, z },
  rotation: 0,
  health: 100,
  active: false,
  fuel: 0,
  growth: 0,
  plantedAt: 0,
  inventory: newInventory(),
});
const input = { forward: 0, side: 0, sprint: false, jump: false, brake: false };
describe("生存闭环与楼层边界", () => {
  it("自建屋顶挡雨，移出屋顶范围后会淋湿", () => {
    const sim = new Simulation(createWorld("roof"));
    sim.state.structures.push(
      built("foundation", 80, -70),
      built("roof", 80, -70),
    );
    sim.state.player.position = { x: 80, y: sim.gen.height(80, -70), z: -70 };
    for (const b of sim.state.structures.filter((b) =>
      b.id.startsWith("build-"),
    ))
      b.position.y = sim.state.player.position.y;
    sim.state.weather = "rain";
    sim.state.nextWeather = Infinity;
    sim.update(0.05, input);
    expect(sim.indoors).toBe(true);
    expect(sim.state.player.stats.wetness).toBe(0);
    sim.state.player.position.x += 4;
    sim.update(0.05, input);
    expect(sim.indoors).toBe(false);
    expect(sim.state.player.stats.wetness).toBeGreaterThan(0);
  });
  it("花盆收获的作物与种子原子交付，天气变化不让生长倒退", () => {
    const sim = new Simulation(createWorld("harvest"));
    const plant = built("planter");
    plant.growth = 100;
    plant.plantedAt = 1;
    sim.state.structures.push(plant);
    sim.state.player.inventory = newInventory(1, 1);
    expect(sim.building.interact(plant.id)).toBe(false);
    expect(plant.growth).toBe(100);
    expect(sim.state.player.inventory.items.length).toBe(0);
    sim.state.player.inventory = newInventory(4, 4);
    expect(sim.building.interact(plant.id)).toBe(true);
    expect(countItem(sim.state.player.inventory, "turnip")).toBe(3);
    expect(countItem(sim.state.player.inventory, "seeds")).toBe(2);
    plant.plantedAt = 1;
    plant.growth = 80;
    sim.state.weather = "rain";
    sim.building.update(1);
    const rain = plant.growth;
    sim.state.weather = "clear";
    sim.building.update(1);
    expect(plant.growth).toBeGreaterThan(rain);
  });
  it("地下枪弹和手雷保留本层坐标，楼板阻隔爆炸伤害", () => {
    const sim = new Simulation(createWorld("basement")),
      p = facilityOrigin(sim.gen);
    sim.state.player.position = { ...p, z: p.z - 3 };
    sim.state.player.inventory = newInventory();
    addItem(sim.state.player.inventory, "pistol");
    const gun = sim.state.player.inventory.items[0]!;
    gun.ammo = 8;
    sim.state.player.quickSlots[0] = gun.uid;
    sim.state.player.selected = 0;
    expect(sim.collision.ground(p.x, p.z, p.y)).toBe(p.y);
    sim.combat.fire({ ...p, y: p.y + 1.4, z: p.z - 3 }, { x: 0, y: 0, z: 1 });
    sim.combat.update(0.002);
    expect(sim.combat.projectiles.some((b) => b.active)).toBe(true);
    sim.combat.grenades.push({
      position: { ...p, y: p.y + 0.3, z: p.z - 2 },
      velocity: { x: 0, y: -1, z: 0 },
      timer: 3,
    });
    sim.combat.update(0.05);
    expect(sim.combat.grenades[0]!.position.y).toBeLessThan(p.y + 1);
    const health = sim.state.player.stats.health;
    sim.combat.detonate({ ...p, y: p.y + 8, z: p.z - 3 }, 1, 12);
    expect(sim.state.player.stats.health).toBe(health);
  });
});

it("独特物资与指定地点绑定，重载和再填充不复制，也不重刷搜空箱", () => {
  const sim = new Simulation(createWorld("unique-poi"));
  const locations = {
    "fort-2:1": "raven_vest",
    "lab-2:0": "r07_injector",
    "mine-3:1": "mining_coat",
  };
  for (const [cid, item] of Object.entries(locations)) {
    const c = sim.state.containers[cid]!;
    expect(countItem(c.inventory, item)).toBe(1);
    c.inventory.items = c.inventory.items.filter((i) => i.id !== item);
    c.searched = true;
  }
  const next = new Simulation(structuredClone(sim.state));
  for (const [cid, item] of Object.entries(locations))
    expect(countItem(next.state.containers[cid]!.inventory, item)).toBe(0);
});
