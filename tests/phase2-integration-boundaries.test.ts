import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/core/game";
import { Simulation } from "../src/simulation/simulation";
import { createWorld, DEFAULT_SETTINGS } from "../src/simulation/state";
import { addItem, countItem } from "../src/simulation/inventory";
import { deserialize, serialize } from "../src/save/storage";
import {
  createWorldEvent,
  worldEventScenes,
} from "../src/simulation/world-events";
import { findEventLocation, spawnHidden } from "../src/simulation/population";
import { FirstPersonMotionController } from "../src/rendering/first-person-motion";
import { NarrativeWorldRenderer } from "../src/rendering/narrative-world";
import type { MaterialFactory } from "../src/rendering/materials";
import type { LightingManager } from "../src/rendering/environment";
import type { CharacterAssetLibrary } from "../src/rendering/animated-assets";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Feedback, StructureData, WorldState } from "../src/core/types";
import type { SequenceCueEvent } from "../src/narrative";

const still = { forward: 0, side: 0, sprint: false, jump: false, brake: false };
const structure = (
  kind: string,
  x = 2,
  z = -6,
  y = 0,
  rotation = 0,
): StructureData => ({
  id: `build-boundary-${kind}`,
  kind,
  position: { x, y, z },
  rotation,
  health: 100,
  active: false,
  fuel: 0,
  growth: 0,
  plantedAt: 0,
});
function fixture(state = createWorld("integration-boundaries")) {
  const sim = new Simulation(state);
  sim.state.actors = {};
  sim.state.director.recoveryUntil = sim.state.elapsed + 100;
  sim.state.player.position = { x: 2, y: 0, z: -9 };
  return sim;
}

/** Real Game methods, with only browser/GPU/audio surfaces substituted. No Game constructor or browser session. */
function gameHarness(sim: Simulation) {
  const canvas = { focus: vi.fn() };
  vi.stubGlobal("document", {
    pointerLockElement: canvas,
    addEventListener() {},
    removeEventListener() {},
  });
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const audio = {
    stopDialogue: vi.fn(),
    pauseDialogue: vi.fn(),
    resumeDialogue: vi.fn(async () => false),
    diagnostics: () => ({ dialogue: false }),
    playDialogue: vi.fn(async () => true),
    event: vi.fn(),
    update: vi.fn(),
    unlock: vi.fn(async () => {}),
  };
  const ui = {
    screen: "play",
    entityId: "",
    nearbySource: "",
    setInteraction: vi.fn(),
    setLocked: vi.fn(),
    update: vi.fn(),
    buildingPrompt: vi.fn(),
    toast: vi.fn(),
    error: vi.fn(),
    show: vi.fn((screen: string) => {
      ui.screen = screen;
    }),
    render: vi.fn(),
  };
  const input = {
    fallback: true,
    held: new Set<string>(),
    clear: vi.fn(),
    unlock: vi.fn(),
    mouse: () => ({ x: 0, y: 0 }),
    movement: () => still,
    down: () => false,
    aiming: false,
    mouseDown: false,
    attackPressed: false,
  };
  const renderer = {
    motion: { pose: { ads: 0 } },
    setMenu: vi.fn(),
    prepareView: vi.fn(),
    update: vi.fn(),
    target: () => null,
    stats: { fps: 60, chunks: 9, drawCalls: 100 },
    narrativeWorld: { cue: vi.fn((_event: SequenceCueEvent) => true) },
    sequenceAction: vi.fn(),
    effects: { sequenceBurst: vi.fn() },
    weapon: { mouse: vi.fn() },
    camera: { position: { x: 0, y: 1.68, z: 0 } },
  };
  const fake = {
    sim,
    canvas,
    audio,
    ui,
    input,
    renderer,
    active: true,
    loading: false,
    frameError: false,
    lastError: "",
    consoleOpen: false,
    last: now - 50,
    lastSaved: sim.state.elapsed,
    playFrames: 0,
    frameSamples: [],
    simFrameMs: 0,
    lowFpsTime: 0,
    settings: structuredClone(DEFAULT_SETTINGS),
    engine: {
      getRenderWidth: () => 1280,
      getRenderHeight: () => 720,
      getFps: () => 60,
    },
    save: vi.fn(async () => true),
    persistSettings: vi.fn(),
    resume: vi.fn(async () => {
      ui.screen = "play";
    }),
    setWorld: vi.fn(async (_state: WorldState) => {}),
  };
  const game = Object.assign(
    Object.create(Game.prototype),
    fake,
  ) as typeof fake & {
    frame(): void;
    skipSequence(): void;
    action(action: string, el: HTMLElement): Promise<void>;
  };
  return {
    game,
    ui,
    renderer,
    audio,
    tick: () => {
      now += 50;
      game.last = now - 50;
      game.frame();
      expect(ui.error).not.toHaveBeenCalled();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Game 与序列状态的接线", () => {
  it("暂停语音的异步恢复尚未完成时，Game不会另起同一句fallback打断它", async () => {
    const sim = fixture();
    sim.narrative.update(0);
    sim.narrative.update(4);
    const h = gameHarness(sim);
    h.game.settings.dragLook = true;
    let resolve!: () => void,
      resumed = false;
    const pending = new Promise<boolean>((done) => {
      resolve = () => {
        resumed = true;
        done(true);
      };
    });
    h.audio.resumeDialogue.mockReturnValue(pending);
    h.audio.diagnostics = () => ({ dialogue: resumed });
    const run = (
      Game.prototype as unknown as { resume(): Promise<void> }
    ).resume.call(h.game);
    try {
      await Promise.resolve();
      expect(
        h.audio.playDialogue,
        "fallback starts while the real clip is still resuming",
      ).not.toHaveBeenCalled();
    } finally {
      resolve();
      await run;
    }
  });
  it("阻塞过场只推进自己的时钟，暂停冻结，Skip后立即恢复生存模拟", () => {
    const sim = fixture(),
      h = gameHarness(sim);
    h.tick();
    expect(sim.narrative.frame().id).toBe("opening");
    const worldTime = sim.state.elapsed;
    h.tick();
    h.tick();
    expect(sim.narrative.frame().elapsed).toBeCloseTo(0.1);
    expect(sim.state.elapsed).toBe(worldTime);
    h.ui.screen = "pause";
    h.tick();
    expect(sim.narrative.frame().elapsed).toBeCloseTo(0.1);
    h.ui.screen = "play";
    h.game.skipSequence();
    h.tick();
    expect(sim.narrative.frame().blocking).toBe(false);
    expect(sim.state.elapsed).toBeGreaterThan(worldTime);
    expect(sim.state.narrative.audioLogs).toContain("opening-order");
    expect(h.audio.stopDialogue).toHaveBeenCalled();
  });
  it("重载正在播放的序列保持时间，继续生存经Game入口后不会再次结束", async () => {
    const sim = fixture();
    sim.narrative.update(0);
    sim.narrative.update(4);
    const loaded = fixture(deserialize(serialize(sim.state))),
      h = gameHarness(loaded);
    h.tick();
    expect(loaded.narrative.frame().elapsed).toBeCloseTo(4.05);
    loaded.narrative.skipSequence();
    // This fixture starts at a completed save boundary; ending eligibility is covered by narrative tests.
    loaded.state.narrative.ending = "truth";
    loaded.state.narrative.choice = "publish";
    loaded.state.narrative.sequenceFlags.push("ending-complete:truth");
    loaded.state.narrative.seenSequences.push("ending-truth");
    loaded.state.ended = true;
    await h.game.action("keep-playing", {} as HTMLElement);
    h.tick();
    h.tick();
    expect(loaded.state.ended).toBe(false);
    expect(loaded.state.narrative.sequenceFlags).toContain("story-continued");
    expect(
      h.game.save,
      "continuing survival must persist the completed-story boundary immediately",
    ).toHaveBeenCalledWith(true);
  });
  it("恢复默认画质经Game执行重建，沿用同一世界并返回原设置页", async () => {
    const sim = fixture(),
      h = gameHarness(sim);
    h.game.settings.quality = "low";
    h.ui.screen = "settings";
    await h.game.action("reset-settings", {} as HTMLElement);
    expect(h.game.settings.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(h.game.setWorld).toHaveBeenCalledExactlyOnceWith(sim.state);
    expect(h.ui.show).toHaveBeenCalledWith("settings");
    expect(sim.state.player.inventory.items.length).toBeGreaterThan(0);
  });
});

describe("新状态与实际碰撞/动作的边界", () => {
  it("旧v2无手电字段迁移为满电，真实耗尽熄灭，充电取消和掉电均保留电池", () => {
    const old = createWorld("flashlight-migration") as unknown as {
      player: Record<string, unknown>;
    };
    delete old.player.flashlightCharge;
    for (const version of [1, 2])
      expect(
        deserialize(JSON.stringify({ ...old, version })).player
          .flashlightCharge,
      ).toBe(100);
    const restored = deserialize(JSON.stringify(old));
    expect(restored.player.flashlightCharge).toBe(100);
    const sim = fixture(restored);
    sim.state.player.flashlightCharge = 0.001;
    sim.state.player.flashlight = true;
    sim.update(0.05, still);
    expect(sim.state.player.flashlight).toBe(false);
    expect(sim.state.player.flashlightCharge).toBe(0);
    addItem(sim.state.player.inventory, "battery", 1);
    expect(sim.rechargeFlashlight()).toBe(true);
    sim.actions.update(0.5);
    sim.actions.cancel();
    expect(countItem(sim.state.player.inventory, "battery")).toBe(1);
    expect(sim.state.player.flashlightCharge).toBe(0);
    const reload = fixture(deserialize(serialize(sim.state)));
    expect(reload.rechargeFlashlight()).toBe(true);
    reload.actions.update(2.1);
    expect(reload.state.player.flashlightCharge).toBe(100);
    expect(countItem(reload.state.player.inventory, "battery")).toBe(0);
  });
  it("发电机充电途中断电保留状态；竖直距离超出供电半径不能免费充电", () => {
    const sim = fixture(),
      generator = structure("generator", 2, -9);
    generator.active = true;
    generator.fuel = 5;
    sim.state.structures.push(generator);
    sim.state.player.flashlightCharge = 4;
    expect(sim.rechargeFlashlight()).toBe(true);
    generator.active = false;
    sim.actions.update(2.1);
    expect(sim.state.player.flashlightCharge).toBe(4);
    generator.active = true;
    generator.position.y = sim.state.player.position.y + 20;
    expect(sim.rechargeFlashlight()).toBe(false);
  });
  it.each([0, Math.PI / 2])(
    "完整移动能走上再走下3m楼梯，旋转=%s",
    (rotation) => {
      const sim = fixture(),
        stairs = structure("stairs", 2, -6, 0, rotation),
        sine = Math.sin(rotation),
        cosine = Math.cos(rotation);
      const floor = structure("floor", 2 + sine * 4, -6 + cosine * 4, 3);
      sim.state.structures.push(stairs, floor);
      sim.state.player.position = { x: 2 - sine * 3, y: 0, z: -6 - cosine * 3 };
      sim.state.player.yaw = rotation;
      let maxHeight = 0;
      for (let n = 0; n < 70; n++) {
        sim.update(0.05, { ...still, forward: 1, walk: true });
        maxHeight = Math.max(maxHeight, sim.state.player.position.y);
      }
      expect(maxHeight).toBeGreaterThan(3);
      expect(sim.state.player.position.y).toBeCloseTo(3.22, 1);
      sim.locomotion.reset();
      sim.state.player.yaw += Math.PI;
      for (let n = 0; n < 96; n++)
        sim.update(0.05, { ...still, forward: 1, walk: true });
      expect(sim.state.player.position.y).toBeLessThan(0.15);
      expect(sim.state.player.stats.fracture).toBe(false);
    },
  );
  it("屋顶拆除立即失去庇护；玩家站上屋顶不会仍被标记为室内", () => {
    const sim = fixture(),
      roof = structure("roof", 2, -9);
    sim.state.structures.push(roof);
    sim.state.weather = "rain";
    sim.state.nextWeather = 10000;
    sim.update(0.05, still);
    expect(sim.indoors).toBe(true);
    roof.health = 0;
    sim.update(0.05, still);
    expect(sim.indoors).toBe(false);
    roof.health = 100;
    sim.state.player.position.y = 3.15;
    sim.update(0.05, still);
    expect(sim.indoors).toBe(false);
  });
  it("world-events的残骸碰撞在实际CollisionWorld生效，重载不丢失或叠加", () => {
    const sim = fixture();
    sim.state.elapsed = 1000;
    sim.state.discovered = sim.gen.pois.slice(0, 10).map((p) => p.id);
    const mine = sim.gen.pois.find((p) => p.id === "mine-0")!;
    sim.state.player.position = sim.gen.position(mine.x, mine.z - 130);
    sim.state.player.yaw = Math.PI;
    const location = findEventLocation(sim, "wreck");
    expect(
      location,
      "fixture requires a hidden open event site",
    ).not.toBeNull();
    const event = createWorldEvent(sim, "wreck", location!, spawnHidden)!;
    expect(event).not.toBeNull();
    const p = event.position;
    expect(sim.collision.blocked(p.x, p.y, p.z, 0.3, 1.7)).toBe(true);
    const restored = new Simulation(deserialize(serialize(sim.state)));
    expect(restored.collision.blocked(p.x, p.y, p.z, 0.3, 1.7)).toBe(true);
    const ids = restored.collision
      .nearby(p.x, p.z, 5)
      .map((c) => c.id)
      .filter((id) => id === `${event.id}:wreck-collider`);
    expect(ids).toHaveLength(1);
    expect(
      worldEventScenes(restored).find((s) => s.id === event.id)!.colliders,
    ).toHaveLength(1);
  });
  it("近战命中斜面把真实法线送到反馈，且只在接触帧结算一次", () => {
    const sim = fixture();
    sim.state.player.position = { x: 0, y: 0, z: 0 };
    sim.state.player.yaw = 0;
    sim.state.player.pitch = 0;
    sim.collision.dynamicObjects = () => [
      {
        id: "angled-test-panel",
        minX: -1.5,
        maxX: 1.5,
        minZ: 0.3,
        maxZ: 3.3,
        minY: 0,
        maxY: 2.5,
        material: "wood",
        obb: { x: 0, z: 1.8, halfWidth: 1, halfDepth: 0.05, yaw: Math.PI / 4 },
      },
    ];
    const hits: Feedback[] = [],
      motion = new FirstPersonMotionController();
    sim.bus.on((event) => {
      motion.feedback(event);
      if (event.type === "hit") hits.push(event);
    });
    expect(sim.combat.fire({ x: 0, y: 1.68, z: 0 }, { x: 0, y: 0, z: 1 })).toBe(
      true,
    );
    expect(hits).toHaveLength(0);
    sim.combat.update(0.3);
    sim.combat.update(0.3);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.normal!.x).toBeCloseTo(-Math.SQRT1_2);
    expect(hits[0]!.normal!.z).toBeCloseTo(-Math.SQRT1_2);
    expect(hits[0]!.weapon).toBe("knife");
    expect(
      Number.isFinite(
        motion.update(0.016, sim, DEFAULT_SETTINGS, false, 0).weaponRotation.x,
      ),
    ).toBe(true);
  });
});

describe("NarrativeWorld的实体结果", () => {
  it("暂停过场时字幕时钟与NarrativeWorld灯光过渡同步冻结", () => {
    const sim = fixture(),
      engine = new NullEngine(),
      scene = new Scene(engine),
      material = new StandardMaterial("clock-test", scene);
    const mats = {
      surface: () => material,
      simple: () => material,
    } as unknown as MaterialFactory;
    const light = {
      addCaster: vi.fn(),
      removeCaster: vi.fn(),
    } as unknown as LightingManager;
    const assets = {
      instantiate: () => null,
    } as unknown as CharacterAssetLibrary;
    const renderer = new NarrativeWorldRenderer(
      scene,
      mats,
      sim,
      assets,
      light,
      () => material,
    );
    try {
      const h = gameHarness(sim);
      h.renderer.narrativeWorld.cue.mockImplementation((event) =>
        renderer.cue(event),
      );
      h.renderer.update.mockImplementation((dt: number) =>
        renderer.update(dt, new Vector3(2, 0, -9)),
      );
      sim.narrative.sequence.start("ashfall-reveal");
      h.tick();
      const lamp = scene.getLightByName("sequence-light:fort-4")!;
      expect(lamp).not.toBeNull();
      const intensity = lamp.intensity,
        elapsed = sim.narrative.frame().elapsed;
      h.ui.screen = "pause";
      h.tick();
      h.tick();
      expect(sim.narrative.frame().elapsed).toBe(elapsed);
      expect(
        lamp.intensity,
        "visual sequence keeps advancing while the sequence clock is paused",
      ).toBe(intensity);
    } finally {
      renderer.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
  it("跳过倒架后原站立货架碰撞不应继续阻挡玩家", () => {
    const sim = fixture(),
      engine = new NullEngine(),
      scene = new Scene(engine),
      material = new StandardMaterial("test", scene);
    const mats = {
      surface: () => material,
      simple: () => material,
    } as unknown as MaterialFactory;
    const light = {
      addCaster: vi.fn(),
      removeCaster: vi.fn(),
    } as unknown as LightingManager;
    const assets = {
      instantiate: () => null,
    } as unknown as CharacterAssetLibrary;
    const renderer = new NarrativeWorldRenderer(
      scene,
      mats,
      sim,
      assets,
      light,
      () => material,
    );
    try {
      sim.narrative.sequence.start("shelf-collapse");
      sim.narrative.skipSequence();
      for (const event of sim.narrative.drainCues())
        if (event.payload.type === "animation") renderer.cue(event);
      const poi = sim.gen.pois.find((p) => p.id === "pine-3")!;
      renderer.update(0, new Vector3(poi.x, sim.gen.poiHeight(poi), poi.z));
      const fallen = scene.getTransformNodeByName("fallen-supermarket-shelf")!;
      expect(fallen.rotation.x).toBeCloseTo(Math.PI / 2);
      expect(fallen.rotation.z).toBeCloseTo(0);
      const standing = sim.collision
        .nearby(poi.x, poi.z, 8)
        .find((c) => c.id === "pine-3:shelf");
      expect(
        standing,
        "original upright collider remains after the visible shelf falls",
      ).toBeUndefined();
      fallen.computeWorldMatrix(true);
      const top = Math.max(
        ...fallen.getChildMeshes().map((mesh) => {
          mesh.computeWorldMatrix(true);
          return mesh.getBoundingInfo().boundingBox.maximumWorld.y;
        }),
      );
      const collision = sim.collision
        .nearby(poi.x, poi.z, 8)
        .find((c) => c.id === "story:market-shelf")!;
      expect(
        collision.maxY,
        "fallen shelf mesh extends above its physics collider",
      ).toBeGreaterThanOrEqual(top - 0.05);
    } finally {
      renderer.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
