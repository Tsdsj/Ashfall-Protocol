import { describe, expect, it } from "vitest";
import { initialNarrative } from "../src/simulation/quality-state";
import {
  NARRATIVE_AUDIO,
  NARRATIVE_SEQUENCES,
  SequenceController,
} from "../src/narrative";
import { DIALOGUE_DURATIONS } from "../src/audio/dialogue-durations";
const resolve = (a: { offset: { x: number; y: number; z: number } }) =>
  a.offset;

describe("数据驱动过场的跳过、重载与播放时序", () => {
  it("开局在30–90秒内，所有中文对白完整播放且不互相覆盖", () => {
    expect(NARRATIVE_SEQUENCES.opening!.duration).toBeGreaterThanOrEqual(30);
    expect(NARRATIVE_SEQUENCES.opening!.duration).toBeLessThanOrEqual(90);
    for (const sequence of Object.values(NARRATIVE_SEQUENCES)) {
      const lines = sequence.cues
        .filter((c) => c.payload.type === "dialogue")
        .sort((a, b) => a.at - b.at);
      for (const [index, cue] of lines.entries()) {
        if (cue.payload.type !== "dialogue") continue;
        expect(cue.payload.text, cue.payload.audioId).toBe(
          NARRATIVE_AUDIO[cue.payload.audioId]!.text,
        );
        expect(cue.payload.duration).toBeGreaterThanOrEqual(
          DIALOGUE_DURATIONS[cue.payload.audioId] ?? 0,
        );
        expect(cue.at + cue.payload.duration).toBeLessThanOrEqual(
          sequence.duration + 0.001,
        );
        if (index < lines.length - 1)
          expect(cue.at + cue.payload.duration).toBeLessThanOrEqual(
            lines[index + 1]!.at + 0.001,
          );
      }
    }
  });
  it("不抢控制的超市倒架和军事警报包含实际动画、粒子、声音与AI反应", () => {
    for (const id of ["shelf-collapse", "fort-alarm"]) {
      const state = initialNarrative(),
        controller = new SequenceController(state, resolve);
      controller.start(id);
      controller.update(1);
      expect(controller.frame().blocking).toBe(false);
      expect(controller.frame().camera).toBeNull();
      expect(controller.drainCues().some((c) => c.payload.type === "ai")).toBe(
        true,
      );
    }
    expect(
      NARRATIVE_SEQUENCES["shelf-collapse"]!.cues.some(
        (c) =>
          c.payload.type === "animation" &&
          c.payload.animation === "shelf-fall",
      ),
    ).toBe(true);
  });
  it("Skip补齐必要信息、场景状态与日志，不重播音频或瞬时爆炸", () => {
    const state = initialNarrative(),
      controller = new SequenceController(state, resolve);
    controller.start("ashfall-reveal");
    controller.skip();
    expect(state.sequenceFlags).toContain("ashfall-known");
    expect(state.audioLogs).toContain("ashfall-reveal");
    const cues = controller.drainCues();
    expect(cues.some((c) => c.payload.type === "lighting")).toBe(true);
    expect(cues.some((c) => c.payload.type === "audio")).toBe(false);
    expect(controller.frame().blocking).toBe(false);
    expect(controller.frame().camera).toBeNull();
    expect(controller.start("ashfall-reveal")).toBe(false);
  });
  it("必要cue直到ack才出队，重载重放场景setter而不重奖或重播对白", () => {
    const state = initialNarrative(),
      controller = new SequenceController(state, resolve);
    controller.start("ashfall-reveal");
    controller.update(4);
    const first = controller.drainCues().find((c) => c.cueId === "red-light")!;
    expect(controller.drainCues().some((c) => c.key === first.key)).toBe(true);
    controller.ackCue(first.key);
    expect(controller.drainCues().some((c) => c.key === first.key)).toBe(false);
    const restored = new SequenceController(structuredClone(state), resolve);
    expect(restored.drainCues().find((c) => c.key === first.key)?.replay).toBe(
      true,
    );
    expect(restored.drainCues().some((c) => c.payload.type === "audio")).toBe(
      false,
    );
    expect(restored.frame().elapsed).toBe(4);
    restored.skip();
  });
  it("中途保存重载再完成只提交一次必要flag，后续重入不会重放序列", () => {
    const state = initialNarrative(),
      first = new SequenceController(state, resolve);
    first.start("facility-reveal");
    first.update(3);
    const saved = structuredClone(state),
      second = new SequenceController(saved, resolve);
    second.update(100);
    second.update(100);
    expect(
      saved.sequenceFlags.filter((f) => f === "facility-truth"),
    ).toHaveLength(1);
    expect(
      saved.seenSequences.filter((f) => f === "facility-reveal"),
    ).toHaveLength(1);
    expect(second.start("facility-reveal")).toBe(false);
  });
});
