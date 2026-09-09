import { describe, expect, it } from "vitest";
import { createWorld } from "../src/simulation/state";
import { addItem, countItem, newInventory } from "../src/simulation/inventory";
import { WorldGenerator } from "../src/world/generator";
import { deserialize, serialize } from "../src/save/storage";
import {
  NarrativeSystem,
  NARRATIVE_INTERACTIONS,
  NARRATIVE_RECIPES,
  NARRATIVE_ROUTES,
  SIDE_QUESTS,
} from "../src/narrative";
import type { WorldState } from "../src/core/types";

function harness(state: WorldState = createWorld("narrative-acceptance")) {
  const gen = new WorldGenerator(state.seed),
    messages: string[] = [];
  const narrative = new NarrativeSystem({
    state,
    gen,
    notify: (s) => messages.push(s),
  });
  function go(id: string): boolean {
    const definition = NARRATIVE_INTERACTIONS.find((d) => d.id === id)!;
    state.player.position = narrative.resolveAnchor(definition.anchor);
    return narrative.interact("narrative:" + id);
  }
  function items(values: Record<string, number>) {
    for (const [id, n] of Object.entries(values))
      expect(addItem(state.player.inventory, id, n), id).toBe(true);
  }
  function opening() {
    narrative.update(0);
    expect(narrative.frame().id).toBe("opening");
    expect(narrative.skipSequence()).toBe(true);
  }
  function quest(id: string) {
    const q = SIDE_QUESTS.find((q) => q.id === id)!;
    for (const step of q.steps) {
      items(step.cost ?? {});
      expect(go(step.interaction), step.interaction).toBe(true);
    }
  }
  function main() {
    opening();
    expect(narrative.actTitle).toContain("Act 1");
    for (const id of ["ranger-supplies", "ranger-shelter", "ranger-radio"])
      expect(go(id), id).toBe(true);
    expect(state.narrative.act).toBe(2);
    for (const id of [
      "medical-record",
      "military-record",
      "contractor-record",
      "missing-record",
    ])
      expect(go(id), id).toBe(true);
    expect(state.narrative.act).toBe(3);
    expect(go("ashfall-decode")).toBe(true);
    expect(narrative.skipSequence()).toBe(true);
    expect(state.narrative.act).toBe(4);
    expect(go("facility-enter")).toBe(true);
    const underground = narrative.resolveAnchor(
      NARRATIVE_INTERACTIONS.find((d) => d.id === "facility-exit")!.anchor,
    );
    expect(state.player.position).toEqual(underground);
    narrative.skipSequence();
    for (const id of [
      "facility-military",
      "facility-research",
      "facility-government",
      "facility-contractor",
      "facility-archive",
    ])
      expect(go(id), id).toBe(true);
    narrative.skipSequence();
    expect(state.narrative.act).toBe(5);
    expect(go("facility-isolate")).toBe(true);
    expect(go("facility-control")).toBe(true);
    narrative.skipSequence();
  }
  return { state, gen, narrative, go, items, opening, quest, main, messages };
}

describe("四幕主线与物理世界条件", () => {
  it("不把初始广播当真相，食物、安全点、广播和四份调查按因果推进", () => {
    const h = harness();
    h.opening();
    expect(h.go("ranger-radio")).toBe(false);
    expect(h.go("medical-record")).toBe(false);
    expect(h.go("ashfall-decode")).toBe(false);
    expect(h.go("facility-enter")).toBe(false);
    expect(h.state.narrative.act).toBe(1);
    expect(h.go("ranger-supplies")).toBe(true);
    expect(h.go("ranger-shelter")).toBe(true);
    expect(h.state.player.spawn).toEqual(
      h.narrative.resolveAnchor({
        poiId: "pine-0",
        offset: { x: 0, y: 0, z: -2 },
      }),
    );
    expect(h.go("ranger-radio")).toBe(true);
    for (const id of ["medical-record", "military-record", "contractor-record"])
      expect(h.go(id)).toBe(true);
    expect(h.go("ashfall-decode")).toBe(false);
    expect(h.messages.at(-1)).toContain("转运簿");
    expect(h.go("missing-record")).toBe(true);
    expect(h.go("ashfall-decode")).toBe(true);
    h.narrative.skipSequence();
    expect(h.state.narrative.act).toBe(4);
  });
  it("四个地下原始终端缺一不可，完整主线后展示三个选择的缺失条件", () => {
    const h = harness();
    h.main();
    expect(h.state.narrative.audioLogs).toContain("facility-research");
    expect(h.state.narrative.audioLogs).toContain("facility-government");
    expect(countItem(h.state.player.inventory, "protocol")).toBe(1);
    const choices = h.narrative.choices();
    expect(choices.every((c) => !c.available)).toBe(true);
    expect(choices.find((c) => c.id === "publish")!.missing.join(" ")).toMatch(
      /沈维/,
    );
    expect(choices.find((c) => c.id === "shutdown")!.missing.join(" ")).toMatch(
      /供水/,
    );
    expect(choices.find((c) => c.id === "destroy")!.missing.join(" ")).toMatch(
      /燃料/,
    );
  });
  it("不能从远处或地表操作地下终端，也不能通过最终选择方法绕过条件", () => {
    const h = harness();
    h.opening();
    expect(h.narrative.interact("narrative:military-record")).toBe(false);
    expect(h.narrative.choose("destroy")).toBe(false);
    const terminal = NARRATIVE_INTERACTIONS.find(
      (d) => d.id === "facility-research",
    )!;
    h.state.player.position = h.narrative.resolveAnchor(terminal.anchor);
    h.state.player.position.y += 8;
    expect(h.narrative.interact("narrative:facility-research")).toBe(false);
    expect(h.state.narrative.choice).toBeNull();
  });
  it("地下入口与出口可靠往返，跳过和重载保留已到达的楼层", () => {
    const h = harness();
    h.main();
    expect(h.go("facility-exit")).toBe(true);
    expect(h.state.player.position.y).toBeCloseTo(
      h.gen.poiHeight(h.gen.pois.find((p) => p.id === "lab-0")!),
    );
    expect(h.go("facility-enter")).toBe(true);
    const loaded = harness(deserialize(serialize(h.state)));
    expect(loaded.state.player.position.y).toBeCloseTo(
      h.gen.poiHeight(h.gen.pois.find((p) => p.id === "lab-0")!) - 8,
    );
    expect(loaded.go("facility-exit")).toBe(true);
  });
  it("供给与访问卡不会因重复调查增加", () => {
    const h = harness();
    h.main();
    const before = countItem(h.state.player.inventory, "keycard"),
      food = countItem(h.state.player.inventory, "beans");
    h.go("military-record");
    h.go("ranger-supplies");
    h.go("facility-archive");
    expect(countItem(h.state.player.inventory, "keycard")).toBe(before);
    expect(countItem(h.state.player.inventory, "beans")).toBe(food);
    expect(countItem(h.state.player.inventory, "protocol")).toBe(1);
  });
});

describe("七条完整支线与原子交付", () => {
  it.each(SIDE_QUESTS.map((q) => [q.id, q.title]))(
    "%s · %s 可以从委托走到交付并只奖励一次",
    (id) => {
      const h = harness();
      h.opening();
      h.quest(id);
      expect(h.state.narrative.quests[id]).toEqual({
        stage: 3,
        completed: true,
      });
      const before = structuredClone(h.state.player.inventory);
      const quest = SIDE_QUESTS.find((q) => q.id === id)!;
      expect(h.go(quest.steps[2]!.interaction)).toBe(true);
      expect(h.state.player.inventory).toEqual(before);
      for (const step of quest.steps)
        expect(h.state.narrative.audioLogs).toContain(
          NARRATIVE_INTERACTIONS.find((d) => d.id === step.interaction)!
            .audioId,
        );
      if (quest.unlockRecipe)
        expect(h.narrative.isRecipeUnlocked(quest.unlockRecipe)).toBe(true);
      if (quest.unlockRoute)
        expect(h.narrative.unlockedRoutes.map((r) => r.id)).toContain(
          quest.unlockRoute,
        );
    },
  );
  it("背包满时同时回滚交付消耗、奖励和任务阶段，腾出空间后可以补领", () => {
    const h = harness();
    h.opening();
    h.go("shelter-request");
    h.items({ filter: 2, electronics: 1 });
    h.go("shelter-power");
    h.state.player.inventory = newInventory(1, 1);
    h.items({ fuel: 2 });
    const before = structuredClone(h.state.player.inventory);
    expect(h.go("shelter-return")).toBe(false);
    expect(h.state.player.inventory).toEqual(before);
    expect(h.state.narrative.quests.shelter).toEqual({
      stage: 2,
      completed: false,
    });
    h.state.player.inventory.width = 10;
    h.state.player.inventory.height = 8;
    expect(h.go("shelter-return")).toBe(true);
    expect(countItem(h.state.player.inventory, "fuel")).toBe(1);
    expect(countItem(h.state.player.inventory, "water")).toBe(4);
  });
  it("没有接到委托不能跳到支线交付，未完成支线不能获得配方", () => {
    const h = harness();
    h.opening();
    expect(h.go("doctor-return")).toBe(false);
    expect(h.go("radio-repair")).toBe(false);
    expect(h.narrative.unlockedRecipes).toHaveLength(0);
    expect(h.narrative.unlockedRoutes).toHaveLength(0);
  });
  it("路线的门与停战范围在消费者确认之前重发，重载后可恢复场景状态", () => {
    const h = harness();
    h.opening();
    h.quest("raider");
    const cues = h.narrative.drainCues(),
      withdraw = cues.find((c) => c.cueId === "raider-withdraw")!;
    expect(withdraw.requiresAck).toBe(true);
    expect(h.narrative.drainCues().some((c) => c.key === withdraw.key)).toBe(
      true,
    );
    h.narrative.ackCue(withdraw.key);
    expect(h.narrative.drainCues().some((c) => c.key === withdraw.key)).toBe(
      false,
    );
    const loaded = harness(deserialize(serialize(h.state)));
    expect(
      loaded.narrative.drainCues().find((c) => c.key === withdraw.key)?.replay,
    ).toBe(true);
  });
});

describe("结局由主线、探索、关键任务和最终选择共同决定", () => {
  it("Truth 需要修复广播、市政录音与军官证词，保存/跳过后只有一次结局", () => {
    const h = harness();
    h.main();
    expect(h.go("choice-publish")).toBe(false);
    h.quest("radio");
    h.quest("officer");
    h.go("mayor-record");
    expect(
      h.narrative.choices().find((c) => c.id === "publish")!.available,
    ).toBe(true);
    expect(h.go("choice-publish")).toBe(true);
    expect(h.state.narrative.ending).toBe("truth");
    expect(h.state.ended).toBe(false);
    const loaded = harness(deserialize(serialize(h.state)));
    loaded.narrative.skipSequence();
    expect(loaded.state.ended).toBe(true);
    expect(loaded.state.flags).toContain("broadcast");
    expect(loaded.go("choice-destroy")).toBe(false);
    expect(loaded.state.narrative.ending).toBe("truth");
  });
  it("Ash 只消耗一次档案与燃料，跳过不触发延迟爆炸", () => {
    const h = harness();
    h.main();
    h.items({ fuel: 2 });
    expect(h.go("choice-destroy")).toBe(true);
    expect(countItem(h.state.player.inventory, "protocol")).toBe(0);
    expect(countItem(h.state.player.inventory, "fuel")).toBe(1);
    h.narrative.skipSequence();
    expect(h.state.narrative.ending).toBe("ash");
    expect(h.state.ended).toBe(true);
    expect(
      h.narrative
        .drainCues()
        .some(
          (c) =>
            c.sequenceId === "ending-ash" && c.payload.type === "explosion",
        ),
    ).toBe(false);
    expect(h.go("choice-destroy")).toBe(false);
    expect(countItem(h.state.player.inventory, "fuel")).toBe(1);
  });
  it("Survivor 要先安置猎人家属并恢复避难所供水", () => {
    const h = harness();
    h.main();
    h.quest("hunter");
    expect(h.go("choice-shutdown")).toBe(false);
    h.quest("shelter");
    expect(h.go("choice-shutdown")).toBe(true);
    h.narrative.update(100);
    expect(h.state.narrative.ending).toBe("survivor");
    expect(h.state.ended).toBe(true);
    expect(countItem(h.state.player.inventory, "protocol")).toBe(1);
  });
  it("结局后继续生存可跨帧和重载，不会重新弹出结局", () => {
    const h = harness();
    h.main();
    h.items({ fuel: 1 });
    h.go("choice-destroy");
    h.narrative.skipSequence();
    expect(h.state.ended).toBe(true);
    expect(h.narrative.continueSurvival()).toBe(true);
    h.narrative.update(1);
    h.narrative.update(1);
    expect(h.state.ended).toBe(false);
    const loaded = harness(deserialize(serialize(h.state)));
    loaded.narrative.update(1);
    expect(loaded.state.ended).toBe(false);
    expect(loaded.narrative.frame().blocking).toBe(false);
    expect(loaded.state.narrative.ending).toBe("ash");
  });
});

describe("历史存档与真实锚点兼容", () => {
  it("旧记录延续已验证线索而不伪造新增地下调查，不再强制播放开局", () => {
    const state = createWorld("legacy-narrative");
    state.journal.push("ranger", "clinic", "fort", "industry", "lab");
    state.flags.push("radio-repaired");
    addItem(state.player.inventory, "keycard");
    addItem(state.player.inventory, "protocol");
    const h = harness(state);
    h.narrative.update(0);
    expect(h.narrative.frame().id).toBeNull();
    expect(h.state.narrative.act).toBe(2);
    expect(h.state.narrative.objectives.join(" ")).toContain("转运簿");
    expect(h.state.narrative.quests.radio?.completed).toBe(true);
    expect(h.go("facility-archive")).toBe(false);
    expect(countItem(h.state.player.inventory, "protocol")).toBe(1);
    const reloaded = harness(deserialize(serialize(h.state)));
    expect(reloaded.state.narrative.sequenceFlags).toEqual(
      h.state.narrative.sequenceFlags,
    );
  });
  it("已撤离的旧存档保留完成状态", () => {
    const state = createWorld("legacy-finished");
    state.journal.push("broadcast");
    state.flags.push("broadcast", "extracted");
    state.ended = true;
    const h = harness(state);
    expect(h.state.narrative.ending).toBe("truth");
    expect(h.state.ended).toBe(true);
  });
  it("不同seed下全部互动和路线都能解析到实际POI，配方输出使用现有物品", () => {
    for (const seed of ["world-a", "world-b", "灰谷"]) {
      const h = harness(createWorld(seed));
      for (const d of NARRATIVE_INTERACTIONS)
        expect(
          Object.values(h.narrative.resolveAnchor(d.anchor)).every(
            Number.isFinite,
          ),
          d.id,
        ).toBe(true);
      for (const route of NARRATIVE_ROUTES)
        for (const a of route.anchors)
          expect(
            Object.values(h.narrative.resolveAnchor(a)).every(Number.isFinite),
          ).toBe(true);
      for (const recipe of NARRATIVE_RECIPES)
        expect(addItem(newInventory(), recipe.output, recipe.count)).toBe(true);
    }
  });
});
