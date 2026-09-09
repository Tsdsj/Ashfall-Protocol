import { describe, it, expect } from "vitest";
import { Simulation } from "../src/simulation/simulation";
import { createWorld } from "../src/simulation/state";
import { addItem } from "../src/simulation/inventory";
import { doorCollider } from "../src/simulation/doors";
import { deserialize, serialize } from "../src/save/storage";

const advance = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    sim.state.elapsed += 1 / 60;
    sim.doors.update(1 / 60);
  }
};
describe("门的物理过程与持久状态", () => {
  it("开关门连续进行，动画未让出门口前碰撞仍存在", () => {
    const sim = new Simulation(createWorld("doors"));
    const poi = sim.gen.pois.find((p) => p.id === "pine-0")!;
    const door = sim.doors.get(poi.id)!;
    sim.doors.request(poi.id, true);
    advance(sim, 0.05);
    expect(door.status).toBe("opening");
    expect(door.progress).toBeGreaterThan(0);
    expect(door.progress).toBeLessThan(0.2);
    expect(sim.collision.blocked(poi.x, 0, poi.z - poi.depth / 2)).toBe(true);
    advance(sim, 0.65);
    expect(door.status).toBe("open");
    expect(sim.collision.blocked(poi.x, 0, poi.z - poi.depth / 2)).toBe(false);
    sim.doors.request(poi.id, false);
    advance(sim, 0.1);
    expect(door.status).toBe("closing");
    expect(door.progress).toBeGreaterThan(0);
    advance(sim, 0.6);
    expect(door.status).toBe("closed");
    expect(door.progress).toBe(0);
  });
  it("开门过程中反向关闭不会跳回起点", () => {
    const sim = new Simulation(createWorld("reverse-door")),
      d = sim.doors.get("pine-0")!;
    sim.doors.request("pine-0", true);
    advance(sim, 0.2);
    const position = d.progress;
    sim.doors.request("pine-0", false);
    expect(d.progress).toBe(position);
    advance(sim, 0.05);
    expect(d.progress).toBeLessThan(position);
    expect(d.progress).toBeGreaterThan(0);
  });
  it("门扇扫过玩家时停止，离开之后继续关闭", () => {
    const sim = new Simulation(createWorld("blocked-door")),
      d = sim.doors.get("pine-0")!;
    sim.state.actors = {};
    sim.doors.request("pine-0", true);
    advance(sim, 0.7);
    const geometry = sim.doors.geometry("pine-0")!,
      middle = doorCollider(geometry, 0.5);
    sim.state.player.position = {
      x: middle.obb!.x,
      y: geometry.hinge.y,
      z: middle.obb!.z,
    };
    sim.doors.request("pine-0", false);
    advance(sim, 0.7);
    expect(d.status).toBe("blocked");
    expect(d.progress).toBeGreaterThan(0);
    sim.state.player.position = { x: -30, y: 0, z: -20 };
    advance(sim, 1.2);
    expect(d.status).toBe("closed");
  });
  it("安全门维持门禁，普通人类 AI 不能代替访问卡", () => {
    const sim = new Simulation(createWorld("locked-door"));
    expect(sim.doors.request("lab-0", true)).toBe(false);
    expect(sim.doors.request("lab-0", true, "human")).toBe(false);
    addItem(sim.state.player.inventory, "keycard");
    expect(sim.doors.request("lab-0", true)).toBe(true);
    expect(sim.doors.get("lab-0")!.locked).toBe(false);
  });
  it("门累积受损直到被突破，损坏状态经过存档恢复", () => {
    const sim = new Simulation(createWorld("broken-door")),
      d = sim.doors.get("pine-0")!;
    sim.doors.damage("pine-0", 40);
    expect(d.health).toBeGreaterThan(0);
    expect(d.status).not.toBe("broken");
    sim.doors.damage("pine-0", 60);
    expect(d.status).toBe("broken");
    const restored = new Simulation(deserialize(serialize(sim.state)));
    expect(restored.doors.get("pine-0")!.status).toBe("broken");
    expect(
      restored.collision.nearby(14, 9, 3).some((c) => c.door === "pine-0"),
    ).toBe(false);
  });
  it("v1 已开的门与玩家物资迁移到 v2 后保持原状态", () => {
    const sim = new Simulation(createWorld("migration"));
    sim.state.doors["pine-0"] = true;
    const original = structuredClone(sim.state.player);
    const raw = JSON.parse(JSON.stringify(sim.state));
    raw.version = 1;
    delete raw.doorStates;
    delete raw.narrative;
    delete raw.director;
    for (const actor of Object.values(raw.actors) as Record<string, unknown>[])
      for (const key of [
        "behavior",
        "stateAge",
        "speed",
        "gaitPhase",
        "awareness",
        "legDamage",
        "armDamage",
        "deathStyle",
        "deathTime",
        "attack",
        "reaction",
        "traversal",
      ])
        delete actor[key];
    const restored = new Simulation(deserialize(JSON.stringify(raw)));
    expect(restored.state.version).toBe(2);
    expect(restored.state.player).toEqual(original);
    expect(restored.doors.get("pine-0")!.progress).toBe(1);
    expect(restored.state.narrative.seenSequences).toContain("opening");
  });
});
