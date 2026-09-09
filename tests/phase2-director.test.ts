import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation/simulation";
import { createWorld } from "../src/simulation/state";
import {
  addItem,
  countItem,
  validateInventory,
} from "../src/simulation/inventory";
import {
  chooseDirectorEvent,
  director,
  findEventLocation,
  populate,
  spawnActor,
  updateDirectorPacing,
} from "../src/simulation/population";
import { generateLoot, GUARANTEED_POI_SUPPLIES } from "../src/data/loot";
import { deserialize, serialize } from "../src/save/storage";
import { hiddenEventSite } from "../src/simulation/world-events";

function fixture() {
  const sim = new Simulation(createWorld("director-acceptance"));
  sim.state.actors = {};
  sim.state.time = 12;
  addItem(sim.state.player.inventory, "beans", 2);
  updateDirectorPacing(sim);
  return sim;
}
function seconds(sim: Simulation, count: number, combat = false) {
  for (let n = 0; n < count; n++) {
    sim.state.elapsed++;
    sim.noises = [];
    if (combat) sim.noise(sim.state.player.position, 200, "gunshot");
    updateDirectorPacing(sim);
  }
}
describe("根据真实局势变化的 Director 节奏", () => {
  it("两次采样之间的短促真实开火也会记录为近期战斗，监听不会重复注册", () => {
    const sim = fixture();
    updateDirectorPacing(sim);
    updateDirectorPacing(sim);
    sim.state.elapsed = 0.2;
    sim.bus.emit({
      type: "shot",
      text: "手枪",
      kind: "pistol",
      position: sim.state.player.position,
    });
    expect(sim.state.director.lastCombat).toBe(0.2);
    expect(sim.state.director.tension).toBe(4);
    expect(sim.state.director.pacing!.highestIntensity).toBe(0.04);
  });
  it("安静探索、连续交火、高压结束形成不同阶段，最高强度被保存", () => {
    const sim = fixture();
    seconds(sim, 8);
    expect(sim.state.director.pacing!.phase).toBe("calm");
    const p = sim.state.player.position;
    for (let n = 0; n < 3; n++) {
      const actor = spawnActor(sim, "pressure:" + n, "walker", {
        x: p.x + 10 + n,
        y: p.y,
        z: p.z,
      });
      actor.state = "chase";
    }
    seconds(sim, 5, true);
    expect(sim.state.director.pacing!.phase).toBe("peak");
    expect(sim.state.director.lastCombat).toBe(sim.state.elapsed);
    expect(sim.state.director.pacing!.highestIntensity).toBeGreaterThan(0.64);
    const peakUntil = sim.state.director.pacing!.peakUntil;
    sim.state.actors = {};
    sim.state.elapsed = peakUntil;
    updateDirectorPacing(sim);
    expect(sim.state.director.pacing!.phase).toBe("recovery");
    expect(sim.state.director.recoveryUntil).toBeGreaterThan(sim.state.elapsed);
    const loaded = new Simulation(deserialize(serialize(sim.state)));
    expect(loaded.state.director.pacing!.phase).toBe("recovery");
    expect(loaded.state.director.recoveryUntil).toBe(
      sim.state.director.recoveryUntil,
    );
    expect(loaded.state.director.pacing!.highestIntensity).toBe(
      sim.state.director.pacing!.highestIntensity,
    );
  });
  it("危急身体和资源不足触发恢复，事件选择转向补给而非强敌", () => {
    const sim = fixture();
    sim.state.player.stats.health = 22;
    sim.state.player.stats.hydration = 9;
    sim.state.player.stats.energy = 12;
    seconds(sim, 1);
    expect(sim.state.director.pacing!.resourcePressure).toBeGreaterThan(0.8);
    expect(sim.state.director.pacing!.phase).toBe("recovery");
    for (const roll of [0, 0.2, 0.5, 0.9])
      expect(chooseDirectorEvent(sim, roll)).toBe("airdrop");
  });
  it("低弹药、区域与时间实际影响评估，重复同一时间采样不增加压力", () => {
    const sim = fixture(),
      p = sim.state.player;
    addItem(p.inventory, "rifle");
    const gun = p.inventory.items.find((i) => i.id === "rifle")!;
    p.quickSlots[0] = gun.uid;
    const lowAmmo = updateDirectorPacing(sim).resourcePressure;
    addItem(p.inventory, "ammo762", 24);
    expect(updateDirectorPacing(sim).resourcePressure).toBeLessThan(lowAmmo);
    const fort = sim.gen.pois.find((p) => p.id === "fort-0")!;
    p.position = sim.gen.position(fort.x, fort.z);
    sim.state.time = 23;
    seconds(sim, 3);
    expect(sim.state.director.pacing!.locationDanger).toBe(1);
    expect(sim.state.director.pacing!.phase).toBe("rising");
    const tension = sim.state.director.tension;
    updateDirectorPacing(sim);
    updateDirectorPacing(sim);
    expect(sim.state.director.tension).toBe(tension);
  });
  it("恢复期不新添居民威胁，但已存在的敌人不会被删除或重置", () => {
    const sim = fixture();
    const actor = spawnActor(sim, "persistent-pressure", "walker", {
      ...sim.state.player.position,
      x: sim.state.player.position.x + 50,
    });
    actor.health = 31;
    sim.state.director.recoveryUntil = 200;
    populate(sim);
    expect(
      Object.values(sim.state.actors).filter(
        (a) => !["deer", "boar", "wolf"].includes(a.kind),
      ),
    ).toHaveLength(1);
    expect(sim.state.actors[actor.id]!.health).toBe(31);
  });
  it("事件创建使用实际隐藏POI，重复导演调用不叠加事件，冷却跨存档", () => {
    const sim = fixture();
    sim.state.elapsed = 200;
    sim.state.player.yaw = Math.PI;
    sim.state.nextEvent = 0;
    director(sim);
    expect(sim.state.events.length).toBe(1);
    expect(sim.state.director.encounters).toBe(1);
    const count = sim.state.events.length,
      next = sim.state.nextEvent;
    director(sim);
    expect(sim.state.events.length).toBe(count);
    const loaded = new Simulation(deserialize(serialize(sim.state)));
    director(loaded);
    expect(loaded.state.events.length).toBe(count);
    expect(loaded.state.nextEvent).toBe(next);
  });
  it("罕见残骸需时间与实际探索，并明显低于普通事件权重", () => {
    const sim = fixture();
    expect(chooseDirectorEvent(sim, 0)).not.toBe("wreck");
    sim.state.elapsed = 1000;
    sim.state.discovered = sim.gen.pois.slice(0, 10).map((p) => p.id);
    const picks = Array.from({ length: 1000 }, (_, n) =>
      chooseDirectorEvent(sim, n / 1000),
    );
    const rare = picks.filter((k) => k === "wreck").length;
    expect(rare).toBeGreaterThan(0);
    expect(rare).toBeLessThan(60);
    expect(picks.filter((k) => k === "rescue").length).toBeGreaterThan(
      rare * 3,
    );
  });
  it("事件源不能出现在出生点、玩家附近或无遮挡的直接视野里", () => {
    const sim = fixture();
    expect(hiddenEventSite(sim, sim.state.player.position)).toBe(false);
    const location = findEventLocation(sim, "rescue");
    expect(location).not.toBeNull();
    expect(hiddenEventSite(sim, location!.position)).toBe(true);
    const p = sim.state.player.position,
      q = location!.position;
    sim.state.player.yaw = Math.atan2(q.x - p.x, q.z - p.z);
    const original = sim.collision.visible;
    sim.collision.visible = () => true;
    expect(hiddenEventSite(sim, q)).toBe(false);
    sim.collision.visible = original;
  });
});

describe("风险分层与一次性关键物资", () => {
  it("低危险军警点不出高阶步枪，高危险军械有明确装备收益", () => {
    for (let n = 0; n < 30; n++) {
      const low = generateLoot("tier" + n, "generic", "military", 1),
        high = generateLoot("tier" + n, "generic", "military", 5);
      expect(countItem(low, "rifle")).toBe(0);
      expect(countItem(low, "heavyarmor")).toBe(0);
      expect(countItem(high, "rifle")).toBeGreaterThanOrEqual(1);
      expect(validateInventory(high)).toBe(true);
    }
  });
  it("低物资倍率和高物资倍率下关键任务资源都先保留，不被随机装备挤掉", () => {
    for (const [id, guaranteed] of Object.entries(GUARANTEED_POI_SUPPLIES))
      for (const amount of [0.2, 1, 4])
        for (let n = 0; n < 10; n++) {
          const inv = generateLoot(
            "reserve" + n,
            id,
            id.startsWith("fort") ? "military" : "industrial",
            5,
            amount,
          );
          for (const [item, count] of Object.entries(guaranteed))
            expect(
              countItem(inv, item),
              id + ":" + item,
            ).toBeGreaterThanOrEqual(count);
          expect(validateInventory(inv)).toBe(true);
        }
  });
  it("搜空后离开一小时不重新发访问卡、任务资源或事件奖励", () => {
    const sim = fixture();
    const c = sim.state.containers["fort-0:0"]!;
    c.inventory.items = [];
    c.searched = true;
    c.openedAt = 0;
    sim.state.elapsed = 7200;
    populate(sim);
    expect(c.inventory.items).toHaveLength(0);
    expect(c.searched).toBe(true);
  });
});
