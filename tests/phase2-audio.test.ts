import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { AudioManager } from "../src/audio/audio";
import {
  acousticSpace,
  eventCooldown,
  feedbackLayers,
  footstepLayers,
  SPACES,
  variantIndex,
  weaponLayers,
} from "../src/audio/palette";
import { SOUND_GROUPS, DIALOGUE_FILES } from "../src/audio/catalog";
import { DIALOGUE_DURATIONS } from "../src/audio/dialogue-durations";
import { NARRATIVE_AUDIO } from "../src/narrative/content";
import { DEFAULT_SETTINGS } from "../src/simulation/state";
import type { POI } from "../src/core/types";
import type { Simulation } from "../src/simulation/simulation";

const foley = { speed: 3, stance: "stand" as const, load: 5 };
const audioRoot = new URL("../public/audio/", import.meta.url);
describe("第二阶段声音资产与路由", () => {
  it("每段原创对白都有本地语音与匹配的字幕时长，文件及文字可追溯", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("dialogue/manifest.json", audioRoot), "utf8"),
    );
    expect(manifest.model).toBe("hexgrad/Kokoro-82M-v1.1-zh");
    expect(manifest.license).toBe("Apache-2.0");
    expect(manifest.assets.length).toBe(Object.keys(NARRATIVE_AUDIO).length);
    for (const asset of manifest.assets) {
      const file = DIALOGUE_FILES[asset.id]!;
      expect(file).toBe(`dialogue/${asset.file}`);
      expect(DIALOGUE_DURATIONS[asset.id]).toBe(asset.duration);
      expect(asset.text).toBe(NARRATIVE_AUDIO[asset.id]!.text);
      expect(createHash("sha256").update(asset.text).digest("hex")).toBe(
        asset.textSha256,
      );
      expect(
        createHash("sha256")
          .update(readFileSync(new URL(file, audioRoot)))
          .digest("hex"),
      ).toBe(asset.sha256);
      expect(asset.peakDbFS).toBeLessThan(-1);
    }
  });
  it("本地采样文件完整，来源许可和实际 hash 可追溯，峰值与体积留有余量", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("manifest.json", audioRoot), "utf8"),
    );
    expect(manifest.assets.length).toBeGreaterThanOrEqual(90);
    expect(manifest.totalBytes).toBeLessThan(2_500_000);
    for (const asset of manifest.assets) {
      const data = readFileSync(new URL(asset.file, audioRoot));
      expect(createHash("sha256").update(data).digest("hex")).toBe(
        asset.sha256,
      );
      expect(asset.source).toMatch(/^https:\/\/(kenney.nl|opengameart.org)\//);
      expect(asset.license).toBe("CC0-1.0");
      expect(asset.peakDbFS).toBeLessThan(-1);
      expect(asset.duration).toBeGreaterThan(0.015);
    }
    for (const files of Object.values(SOUND_GROUPS))
      for (const file of files)
        expect(
          manifest.assets.some((a: { file: string }) => a.file === file),
        ).toBe(true);
  });
  it("武器枪口和尾音源相互区分，同时保留机械动作，近战采用挥动拟音", () => {
    for (const weapon of ["pistol", "shotgun", "rifle"]) {
      const layers = weaponLayers(weapon);
      expect(layers.map((l) => l.group)).toEqual([
        `gun-${weapon}`,
        "mechanical",
        `tail-${weapon}`,
      ]);
      expect(new Set(SOUND_GROUPS[`gun-${weapon}`]).size).toBeGreaterThan(1);
    }
    expect(weaponLayers("melee")[0]!.group).toBe("swing");
    expect(weaponLayers("military")[0]!.group).toBe("gun-rifle");
    expect(weaponLayers("smg")[0]!.volume).toBeLessThan(
      weaponLayers("pistol")[0]!.volume,
    );
    const groups = ["wood", "metal", "concrete", "dirt", "glass", "flesh"].map(
      (material) =>
        feedbackLayers(
          { type: "hit", text: "", material: material as "wood" },
          foley,
        )[0]!.group,
    );
    expect(new Set(groups).size).toBe(6);
  });
  it("真实材质脚步受速度、姿态和负重影响，装备拟音有独立层", () => {
    const walk = footstepLayers("wood", foley);
    const crouch = footstepLayers("wood", { ...foley, stance: "crouch" });
    const run = footstepLayers("metal", { ...foley, speed: 6, load: 30 });
    expect(crouch[0]!.volume).toBeLessThan(walk[0]!.volume);
    expect(run[0]!.volume).toBeGreaterThan(walk[0]!.volume);
    expect(run[1]!.volume).toBeGreaterThan(walk[1]!.volume);
    expect(run[0]!.group).toBe("step-metal");
  });
  it("场景几何与区域选择六种声学空间，地下尾音比室外长", () => {
    const poi = { x: 0, z: 0, width: 12, depth: 10, kind: "house" } as POI;
    const position = { x: 0, y: 1, z: 0 };
    const select = (p: POI) => acousticSpace(position, [p], true, "pine", 5);
    expect(select(poi)).toBe("small-room");
    expect(select({ ...poi, kind: "warehouse" })).toBe("large-room");
    expect(select({ ...poi, width: 30, depth: 5 })).toBe("corridor");
    expect(select({ ...poi, kind: "tunnel" })).toBe("underground");
    expect(acousticSpace(position, [], false, "pine", 25)).toBe("forest");
    expect(acousticSpace(position, [], false, "city", 3)).toBe("outdoors");
    expect(SPACES.underground.decay).toBeGreaterThan(SPACES.outdoors.decay);
  });
  it("采样变体不连续重复，感染者持续声与连续动作有冷却", () => {
    for (let previous = 0; previous < 4; previous++)
      for (let step = 0; step < 100; step++)
        expect(variantIndex(4, previous, step / 100)).not.toBe(previous);
    expect(
      eventCooldown({ type: "sound", kind: "growl", text: "idle" }),
    ).toBeGreaterThan(4);
    expect(
      eventCooldown({ type: "sound", kind: "action-loop", text: "search" }),
    ).toBeGreaterThan(0.8);
    for (const text of [
      "idle",
      "alert",
      "search",
      "chase",
      "attack",
      "hit",
      "death",
    ])
      expect(
        SOUND_GROUPS[
          feedbackLayers({ type: "sound", kind: "growl", text }, foley)[0]!
            .group
        ]!.length,
      ).toBeGreaterThan(1);
  });
});

class Param {
  value = 0;
  setValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}
class Node {
  gain = new Param();
  frequency = new Param();
  playbackRate = new Param();
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  positionX = new Param();
  positionY = new Param();
  positionZ = new Param();
  buffer: unknown;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class Context {
  state = "running";
  currentTime = 0;
  sampleRate = 24000;
  destination = new Node();
  listener = { setPosition: vi.fn(), setOrientation: vi.fn() };
  created: Node[] = [];
  node = () => {
    const n = new Node();
    this.created.push(n);
    return n;
  };
  createGain = this.node;
  createBiquadFilter = this.node;
  createDynamicsCompressor = this.node;
  createConvolver = this.node;
  createBufferSource = this.node;
  createPanner = this.node;
  createBuffer = (channels: number, length: number, rate: number) => ({
    numberOfChannels: channels,
    length,
    duration: length / rate,
    getChannelData: () => new Float32Array(length),
  });
  decodeAudioData = async () => this.createBuffer(1, 2400, 24000);
  close = vi.fn(async () => {
    this.state = "closed";
  });
  resume = vi.fn(async () => {
    this.state = "running";
  });
}
afterEach(() => vi.unstubAllGlobals());
describe("第二阶段声音混音器生命周期", () => {
  it("暂停不消耗对白进度，多次恢复均从累计样本偏移接续", async () => {
    const contexts: Context[] = [];
    vi.stubGlobal(
      "AudioContext",
      class extends Context {
        constructor() {
          super();
          contexts.push(this);
        }
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(16),
      })),
    );
    const audio = new AudioManager(DEFAULT_SETTINGS);
    await audio.unlock();
    const context = contexts[0]!;
    expect(
      await audio.playDialogue({ id: "opening-impact", text: "车翻了。" }),
    ).toBe(true);
    context!.currentTime = 0.03;
    expect(audio.pauseDialogue()).toBe(true);
    expect(audio.pauseDialogue()).toBe(false);
    expect(audio.diagnostics().dialoguePaused).toBe(true);
    expect(audio.diagnostics().dialogueOffset).toBeCloseTo(0.03);
    context!.currentTime = 100;
    expect(await audio.resumeDialogue()).toBe(true);
    const resumed = context!.created
      .filter((n) => n.start.mock.calls.length)
      .at(-1)!;
    expect(resumed.start).toHaveBeenCalledWith(100, 0.03);
    context!.currentTime = 100.02;
    audio.pauseDialogue();
    expect(audio.diagnostics().dialogueOffset).toBeCloseTo(0.05);
    audio.stopDialogue();
    expect(await audio.resumeDialogue()).toBe(false);
    await audio.dispose();
  });
  it("下载中暂停阻止自动起播，恢复可复用完成的解码", async () => {
    vi.stubGlobal("AudioContext", Context);
    let finishDownload:
      | ((value: {
          ok: boolean;
          arrayBuffer: () => Promise<ArrayBuffer>;
        }) => void)
      | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("dialogue/"))
          return new Promise((resolve) => {
            finishDownload = resolve;
          });
        return Promise.resolve({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(16),
        });
      }),
    );
    const audio = new AudioManager(DEFAULT_SETTINGS);
    await audio.unlock();
    const pending = audio.playDialogue({
      id: "opening-impact",
      text: "车翻了。",
    });
    expect(audio.pauseDialogue()).toBe(true);
    finishDownload!({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) });
    expect(await pending).toBe(false);
    expect(audio.diagnostics().activeVoices).toBe(0);
    expect(await audio.resumeDialogue()).toBe(true);
    expect(audio.diagnostics().activeVoices).toBe(1);
    await audio.dispose();
  });
  it("跳过过场后，稍后完成下载的语音不得重新开始播放", async () => {
    vi.stubGlobal("AudioContext", Context);
    let finishDownload:
      | ((value: {
          ok: boolean;
          arrayBuffer: () => Promise<ArrayBuffer>;
        }) => void)
      | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("dialogue/"))
          return new Promise((resolve) => {
            finishDownload = resolve;
          });
        return Promise.resolve({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(16),
        });
      }),
    );
    const audio = new AudioManager(DEFAULT_SETTINGS);
    await audio.unlock();
    const pending = audio.playDialogue({
      id: "opening-impact",
      text: NARRATIVE_AUDIO["opening-impact"]!.text,
    });
    audio.stopDialogue();
    finishDownload!({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) });
    expect(await pending).toBe(false);
    expect(audio.diagnostics().dialogue).toBe(false);
    expect(audio.diagnostics().activeVoices).toBe(0);
    await audio.dispose();
  });
  it("每帧更新接受 actors Record，快速声音事件有上限，退出时全部释放", async () => {
    const contexts: Context[] = [];
    vi.stubGlobal(
      "AudioContext",
      class extends Context {
        constructor() {
          super();
          contexts.push(this);
        }
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(16),
      })),
    );
    const audio = new AudioManager(DEFAULT_SETTINGS);
    await audio.unlock();
    await vi.waitFor(() =>
      expect(audio.diagnostics().loaded).toBe(
        Object.values(SOUND_GROUPS).flat().length,
      ),
    );
    const sim = {
      state: {
        player: {
          position: { x: 0, y: 0, z: 0 },
          yaw: 0,
          stance: "stand",
          flashlight: false,
          inventory: { items: [] },
        },
        actors: { one: { id: "one", kind: "walker" } },
        vehicles: [],
        time: 12,
        weather: "clear",
      },
      indoors: false,
      speed: 2,
      gen: {
        pois: [],
        isWater: () => false,
        height: () => 0,
        regionAt: () => ({ id: "pine" }),
        roadDistance: () => 20,
      },
    } as unknown as Simulation;
    expect(() => audio.update(sim, 1, true)).not.toThrow();
    for (let i = 0; i < 250; i++) {
      contexts[0]!.currentTime += 0.05;
      audio.event({
        type: "sound",
        kind: "growl",
        actorId: `actor-${i}`,
        text: "attack",
      });
    }
    expect(audio.diagnostics().activeVoices).toBeLessThanOrEqual(36);
    audio.event({ type: "shot", kind: "shotgun", text: "" });
    expect(audio.diagnostics().activeVoices).toBe(36);
    expect(audio.diagnostics().loops).toBeLessThanOrEqual(5);
    const sources = contexts[0]!.created.filter(
      (n) => n.start.mock.calls.length,
    );
    await audio.dispose();
    expect(audio.diagnostics().activeVoices).toBe(0);
    expect(audio.diagnostics().decodedBytes).toBe(0);
    for (const source of sources) expect(source.disconnect).toHaveBeenCalled();
    expect(contexts[0]!.close).toHaveBeenCalledOnce();
  });
});
