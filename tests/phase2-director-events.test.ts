import { describe, expect, it } from "vitest";
import { Simulation } from "../src/simulation/simulation";
import { createWorld } from "../src/simulation/state";
import { addItem, countItem, newInventory } from "../src/simulation/inventory";
import {
  createWorldEvent,
  interactWorldEvent,
  updateWorldEvents,
  worldEventInteractions,
  worldEventScenes,
  type AuthoredEventKind,
} from "../src/simulation/world-events";
import { findEventLocation, spawnHidden } from "../src/simulation/population";
import { deserialize, serialize } from "../src/save/storage";

function fixture(kind: AuthoredEventKind) {
  let sim = new Simulation(createWorld("event-acceptance"));
  sim.state.actors = {};
  sim.state.elapsed = 1000;
  sim.state.discovered = sim.gen.pois.slice(0, 10).map((p) => p.id);
  if (kind === "wreck") {
    const poi = sim.gen.pois.find((p) => p.id === "mine-0")!;
    sim.state.player.position = sim.gen.position(poi.x, poi.z - 130);
  }
  sim.state.player.yaw = Math.PI;
  const location = findEventLocation(sim, kind);
  expect(location).not.toBeNull();
  const event = createWorldEvent(sim, kind, location!, spawnHidden, 0.5)!;
  expect(event).not.toBeNull();
  function act(action: string) {
    const id = `event:${event.id}:${action}`,
      target = worldEventInteractions(sim).find((it) => it.id === id);
    expect(target, action).toBeDefined();
    sim.state.player.position = { ...target!.position };
    return interactWorldEvent(sim, id);
  }
  function clear() {
    for (const actor of Object.values(sim.state.actors))
      if (actor.health > 0) sim.ai.hurt(actor, 1000, "head");
  }
  function items(values: Record<string, number>) {
    for (const [id, n] of Object.entries(values))
      expect(addItem(sim.state.player.inventory, id, n)).toBe(true);
  }
  function reload() {
    sim = new Simulation(deserialize(serialize(sim.state)));
    return sim;
  }
  return {
    get sim() {
      return sim;
    },
    event,
    location: location!,
    act,
    clear,
    items,
    reload,
  };
}
describe("可完成的实体世界事件", () => {
  it("持续未救治的伤者可能死亡，失败事件不会给成功奖励", () => {
    const h = fixture("rescue");
    h.sim.state.player.position = { ...h.event.position };
    for (let n = 0; n < 350 && !h.event.resolved; n++) {
      h.sim.state.elapsed++;
      updateWorldEvents(h.sim);
    }
    expect(h.event.encounter!.outcome).toBe("failed");
    expect(
      worldEventScenes(h.sim)[0]!.entities.find((e) => e.model === "survivor")!
        .state,
    ).toBe("dead");
    expect(interactWorldEvent(h.sim, `event:${h.event.id}:rescue-reward`)).toBe(
      false,
    );
  });
  it("营救必须解除威胁、交付治疗并实际随行，到安全点后才领奖", () => {
    const h = fixture("rescue");
    h.items({ bandage: 1, water: 1 });
    expect(h.act("stabilize")).toBe(false);
    h.clear();
    expect(h.act("stabilize")).toBe(true);
    expect(h.event.encounter!.stage).toBe(1);
    expect(
      worldEventInteractions(h.sim).some((i) => i.id.endsWith("rescue-reward")),
    ).toBe(false);
    h.sim.state.elapsed += 4;
    updateWorldEvents(h.sim);
    const walker = worldEventScenes(h.sim)[0]!.entities.find(
      (e) => e.model === "survivor",
    )!;
    expect(walker.state).toBe("walking");
    expect(walker.position.x).not.toBe(h.event.position.x);
    h.sim.state.player.position = { ...walker.position };
    h.sim.state.elapsed += 5;
    updateWorldEvents(h.sim);
    expect(h.act("rescue-reward")).toBe(true);
    expect(h.event.encounter!.outcome).toBe("success");
    expect(h.event.resolved).toBe(true);
    expect(countItem(h.sim.state.player.inventory, "firstaid")).toBe(1);
    expect(interactWorldEvent(h.sim, `event:${h.event.id}:rescue-reward`)).toBe(
      false,
    );
  });
  it("护送时离得太远，伤者会等待；超时不能领取奖励", () => {
    const h = fixture("rescue");
    h.clear();
    h.items({ bandage: 1, water: 1 });
    h.act("stabilize");
    h.sim.state.player.position.x += 80;
    for (let n = 0; n < 12; n++) {
      h.sim.state.elapsed++;
      updateWorldEvents(h.sim);
    }
    expect(h.event.encounter!.stage).toBe(1);
    h.sim.state.elapsed = h.event.expires + 1;
    updateWorldEvents(h.sim);
    expect(h.event.encounter!.outcome).toBe("expired");
    expect(
      worldEventInteractions(h.sim).filter((i) => i.id.includes(h.event.id)),
    ).toHaveLength(0);
  });
  it("车队是两辆真实车辆，静默维修消耗元件，完成后前车才可驾驶", () => {
    const h = fixture("convoy");
    h.items({ wrench: 1, electronics: 1 });
    const vehicles = h.sim.state.vehicles.filter((v) =>
      v.id.startsWith(h.event.id),
    );
    expect(vehicles).toHaveLength(2);
    expect(h.sim.vehicles.enter(vehicles[0]!.id)).toBe(false);
    expect(h.act("disable-alarm")).toBe(true);
    expect(countItem(h.sim.state.player.inventory, "electronics")).toBe(0);
    expect(h.act("unlock-cargo")).toBe(false);
    h.clear();
    expect(h.act("unlock-cargo")).toBe(true);
    expect(h.act("convoy-reward")).toBe(true);
    h.sim.state.player.position = {
      ...vehicles[0]!.position,
      x: vehicles[0]!.position.x - 2,
    };
    expect(h.sim.vehicles.enter(vehicles[0]!.id)).toBe(true);
    expect(
      worldEventScenes(h.sim)[0]!.entities.find((e) => e.model === "cargo")!
        .state,
    ).toBe("open");
  });
  it("强拆与静默有实际代价差别：撬棍强拆不扣元件，但产生大范围噪声", () => {
    const h = fixture("convoy");
    h.items({ crowbar: 1 });
    expect(h.act("force-cargo")).toBe(true);
    expect(h.event.encounter!.approach).toBe("force");
    expect(
      h.sim.noises.some((n) => n.kind === "car-alarm" && n.radius >= 200),
    ).toBe(true);
    expect(h.sim.state.director.tension).toBeGreaterThanOrEqual(20);
  });
  it("残骸有电池风险、维修校验与独特路线成果，不能直接打开领奖", () => {
    const h = fixture("wreck");
    expect(interactWorldEvent(h.sim, `event:${h.event.id}:wreck-reward`)).toBe(
      false,
    );
    h.sim.state.player.position = { ...h.event.position };
    h.sim.state.elapsed++;
    updateWorldEvents(h.sim);
    expect(h.sim.state.player.stats.health).toBeLessThan(100);
    h.items({ wrench: 1, scrap: 2, electronics: 2 });
    expect(h.act("ground-battery")).toBe(true);
    h.clear();
    expect(h.act("decode-box")).toBe(true);
    expect(h.act("wreck-reward")).toBe(true);
    expect(h.sim.state.flags).toContain("route:military-airway");
    expect(countItem(h.sim.state.player.inventory, "scope")).toBe(1);
    expect(worldEventScenes(h.sim)[0]!.colliders).toHaveLength(1);
    expect(
      worldEventScenes(h.sim)[0]!.entities.find((e) => e.model === "sparks")!
        .state,
    ).toBe("inactive");
  });
  it("背包放不下完整奖励时保留事件，腾空间后重载仍能领取且不会重复发奖", () => {
    const h = fixture("convoy");
    h.items({ wrench: 1, electronics: 1 });
    h.act("disable-alarm");
    h.clear();
    h.act("unlock-cargo");
    h.sim.state.player.inventory = newInventory(1, 1);
    h.sim.state.player.quickSlots = [null, null, null, null, null];
    h.sim.state.player.equipment = {};
    expect(h.act("convoy-reward")).toBe(false);
    expect(h.event.resolved).toBe(false);
    expect(h.sim.state.player.inventory.items).toHaveLength(0);
    h.sim.state.player.inventory.width = 10;
    h.sim.state.player.inventory.height = 8;
    h.reload();
    expect(h.act("convoy-reward")).toBe(true);
    const first = countItem(h.sim.state.player.inventory, "parts");
    h.reload();
    expect(interactWorldEvent(h.sim, `event:${h.event.id}:convoy-reward`)).toBe(
      false,
    );
    expect(countItem(h.sim.state.player.inventory, "parts")).toBe(first);
  });
  it("同一POI不会重复生成同类事件，场景查询与存档重载不会生成额外车辆", () => {
    const h = fixture("convoy");
    expect(
      createWorldEvent(h.sim, "convoy", h.location, spawnHidden),
    ).toBeNull();
    const count = h.sim.state.vehicles.length;
    worldEventScenes(h.sim);
    worldEventScenes(h.sim);
    h.reload();
    worldEventScenes(h.sim);
    expect(h.sim.state.vehicles).toHaveLength(count);
  });
  it("当前阶段的合法动作也不能从另一处地点远程执行", () => {
    const h = fixture("convoy");
    h.items({ wrench: 1, electronics: 1 });
    const before = countItem(h.sim.state.player.inventory, "electronics");
    expect(interactWorldEvent(h.sim, `event:${h.event.id}:disable-alarm`)).toBe(
      false,
    );
    expect(countItem(h.sim.state.player.inventory, "electronics")).toBe(before);
    expect(h.event.encounter!.stage).toBe(0);
  });
  it("警报按秒级间隔发声，重复同一时间更新不重复发噪声", () => {
    const h = fixture("convoy");
    h.sim.noises = [];
    let alarms = 0;
    h.sim.bus.on((event) => {
      if (event.type === "sound" && event.kind === "alarm") alarms++;
    });
    updateWorldEvents(h.sim);
    updateWorldEvents(h.sim);
    expect(alarms).toBe(1);
    h.sim.state.elapsed += 6;
    updateWorldEvents(h.sim);
    expect(alarms).toBe(2);
  });
});
