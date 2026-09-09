import { NARRATIVE_AUDIO } from "./content";
import { DIALOGUE_DURATIONS } from "../audio/dialogue-durations";
import type { NarrativeAnchor, SequenceDefinition, TimedCue } from "./types";

export const anchor = (
  poiId: string,
  x = 0,
  y = 0,
  z = 0,
): NarrativeAnchor => ({ poiId, offset: { x, y, z } });
const talk = (audioId: string, at: number, duration: number): TimedCue[] => {
  const audio = NARRATIVE_AUDIO[audioId]!;
  return [
    {
      id: audioId + ":audio",
      at,
      payload: { type: "audio", audioId, gain: 0.9 },
    },
    {
      id: audioId + ":subtitle",
      at,
      payload: {
        type: "dialogue",
        audioId,
        speaker: audio.speaker,
        text: audio.text,
        duration,
      },
    },
  ];
};
const objective = (
  flag: string,
  text: string,
  at: number,
  audioLogs: string[] = [],
): TimedCue => ({
  id: flag,
  at,
  persistent: true,
  payload: { type: "objective", flag, text, audioLogs },
});
const camera = (
  id: string,
  at: number,
  duration: number,
  position: NarrativeAnchor,
  lookAt: NarrativeAnchor,
  fov = 68,
): TimedCue => ({
  id,
  at,
  payload: { type: "camera", position, lookAt, fov, duration },
});

export const NARRATIVE_SEQUENCES: Record<string, SequenceDefinition> = {
  opening: {
    id: "opening",
    title: "2037 · 灰谷 / 最后一辆车",
    duration: 32,
    blocking: true,
    cues: [
      camera(
        "wake-view",
        0,
        10,
        anchor("pine-0", -28, 0.8, -44),
        anchor("pine-0", -25, 1.8, -38),
        76,
      ),
      {
        id: "wake",
        at: 0,
        payload: {
          type: "animation",
          target: "player",
          animation: "wake",
          duration: 3,
        },
      },
      ...talk("opening-impact", 0.5, 10),
      camera(
        "radio-view",
        10.5,
        10,
        anchor("pine-0", -26, 1.5, -42),
        anchor("pine-0", 0, 2, 0),
      ),
      ...talk("opening-order", 10.5, 10),
      ...talk("opening-mira", 21, 10.5),
      objective(
        "opening-complete",
        "寻找食物，在松谷林务站建立安全点，再接通站内接收机。",
        31.5,
        ["opening-impact", "opening-order", "opening-mira"],
      ),
    ],
  },
  "ashfall-reveal": {
    id: "ashfall-reveal",
    title: "Act 3 · 归零",
    duration: 28,
    blocking: true,
    cues: [
      camera(
        "radar",
        0,
        12,
        anchor("fort-4", 0, 1.65, -2.8),
        anchor("fort-4", 0, 1.7, 2),
      ),
      {
        id: "red-light",
        at: 0,
        persistent: true,
        payload: {
          type: "lighting",
          target: "fort-4",
          color: "#d0523e",
          intensity: 1.4,
          duration: 2,
          anchor: anchor("fort-4", 0, 2),
        },
      },
      ...talk("ashfall-countdown", 1, 9),
      ...talk("ashfall-reveal", 11, 16),
      objective(
        "ashfall-known",
        "ASHFALL 是封锁区清理协议。使用访问卡进入第七研究站地下设施。",
        27,
        ["ashfall-countdown", "ashfall-reveal"],
      ),
    ],
  },
  "facility-entry": {
    id: "facility-entry",
    title: "Act 4 · 地下八米",
    duration: 13,
    blocking: true,
    cues: [
      {
        id: "lift-door",
        at: 0,
        persistent: true,
        payload: { type: "door", doorId: "facility-lift", state: "open" },
      },
      {
        id: "lift",
        at: 0,
        payload: {
          type: "animation",
          target: "facility-lift",
          animation: "lift-down",
          duration: 4,
          anchor: anchor("lab-0", 0, -8, -3),
        },
      },
      camera(
        "descent",
        0,
        4,
        anchor("lab-0", 0, -6.4, -3),
        anchor("lab-0", 0, -6.4, 3),
      ),
      ...talk("facility-adaptation", 1, 11),
      objective(
        "facility-entered",
        "分别核验军方、研究机构、地方政府和承包商的原始终端。",
        12,
        ["facility-adaptation"],
      ),
    ],
  },
  "facility-reveal": {
    id: "facility-reveal",
    title: "Act 4 · 二十六盏灯",
    duration: 24,
    blocking: true,
    cues: [
      {
        id: "vault-observation",
        at: 0,
        persistent: true,
        payload: { type: "door", doorId: "facility-vault", state: "open" },
      },
      camera(
        "adaptation-hall",
        0,
        24,
        anchor("lab-0", 0, -6.4, -1.5),
        anchor("lab-0", 0, -6.4, 7),
      ),
      {
        id: "cold-lights",
        at: 0,
        persistent: true,
        payload: {
          type: "lighting",
          target: "facility",
          color: "#87beb7",
          intensity: 0.8,
          duration: 3,
          anchor: anchor("lab-0", 0, -5.5, 4),
        },
      },
      ...talk("facility-reveal", 1, 22),
      objective(
        "facility-truth",
        "完整档案已复制。先隔离清理回路，再在控制台决定灰谷的未来。",
        23,
        ["facility-reveal"],
      ),
    ],
  },
  finale: {
    id: "finale",
    title: "Finale · 最后一个人工条件",
    duration: 19,
    blocking: true,
    cues: [
      camera(
        "console",
        0,
        19,
        anchor("lab-0", 0, -6.4, 1),
        anchor("lab-0", 0, -6.4, 3),
      ),
      {
        id: "console-use",
        at: 0,
        payload: {
          type: "animation",
          target: "player",
          animation: "console-use",
          duration: 1.5,
        },
      },
      ...talk("finale-choice", 0.5, 17.5),
      objective(
        "finale-ready",
        "在控制台选择：公开档案、隔离销毁，或关闭系统并留下。未满足的条件显示在任务日志中。",
        18,
        ["finale-choice"],
      ),
    ],
  },
  "ending-truth": {
    id: "ending-truth",
    title: "Truth · 灰谷有姓名",
    duration: 27,
    blocking: true,
    cues: [
      camera(
        "transmission",
        0,
        13,
        anchor("broadcast", 0, 5, -14),
        anchor("broadcast", 0, 3, 0),
      ),
      {
        id: "relay-green",
        at: 0,
        persistent: true,
        payload: {
          type: "lighting",
          target: "broadcast",
          color: "#bbd5ba",
          intensity: 1.2,
          duration: 2,
          anchor: anchor("broadcast", 0, 2),
        },
      },
      ...talk("ending-truth", 1, 25),
      camera(
        "names",
        13,
        14,
        anchor("extraction", -5, 1.7, -8),
        anchor("extraction", 0, 1.5, 0),
      ),
      objective(
        "ending-complete:truth",
        "档案和证词已送出封锁区。灰谷的幸存者第一次被按姓名登记。",
        26,
        ["ending-truth"],
      ),
    ],
  },
  "ending-ash": {
    id: "ending-ash",
    title: "Ash · 没有第二批",
    duration: 27,
    blocking: true,
    cues: [
      {
        id: "isolate-vault",
        at: 0,
        persistent: true,
        payload: { type: "door", doorId: "facility-vault", state: "closed" },
      },
      camera(
        "exhaust",
        0,
        27,
        anchor("lab-0", 9, 3, -14),
        anchor("lab-0", 0, 2, 0),
      ),
      {
        id: "vault-ignition",
        at: 3,
        payload: {
          type: "explosion",
          anchor: anchor("lab-0", 0, -8, 7),
          radius: 5,
          intensity: 0.6,
          damage: 0,
        },
      },
      {
        id: "smoke",
        at: 3,
        payload: {
          type: "particle",
          anchor: anchor("lab-0", 0, 3, 1),
          effect: "smoke",
          count: 180,
          duration: 20,
        },
      },
      ...talk("ending-ash", 1, 25),
      objective(
        "ending-complete:ash",
        "样本与全部原始档案已经销毁。地下清理回路永久隔离。",
        26,
        ["ending-ash"],
      ),
    ],
  },
  "ending-survivor": {
    id: "ending-survivor",
    title: "Survivor · 留下的人",
    duration: 27,
    blocking: true,
    cues: [
      {
        id: "local-control",
        at: 0,
        persistent: true,
        payload: {
          type: "lighting",
          target: "facility",
          color: "#b8b19a",
          intensity: 0.4,
          duration: 2,
          anchor: anchor("lab-0", 0, -5.5),
        },
      },
      camera(
        "water-tomorrow",
        0,
        13,
        anchor("lake-1", -8, 3, -10),
        anchor("lake-1", 0, 1, 0),
      ),
      ...talk("ending-survivor", 1, 25),
      camera(
        "new-morning",
        13,
        14,
        anchor("pine-0", -3, 1.7, -8),
        anchor("pine-0", 0, 1.5, 0),
      ),
      objective(
        "ending-complete:survivor",
        "远程清理已关闭。幸存者有水、有撤离小路，你留在灰谷维护隔离。",
        26,
        ["ending-survivor"],
      ),
    ],
  },
  "shelf-collapse": {
    id: "shelf-collapse",
    title: "生日刻痕",
    duration: 12,
    blocking: false,
    cues: [
      {
        id: "fall",
        at: 0,
        persistent: true,
        payload: {
          type: "animation",
          target: "pine-3:shelf",
          animation: "shelf-fall",
          duration: 0.8,
          anchor: anchor("pine-3", -5, 0, 1),
        },
      },
      {
        id: "dust",
        at: 0.2,
        payload: {
          type: "particle",
          anchor: anchor("pine-3", -4, 1, 1),
          effect: "dust",
          count: 40,
          duration: 2.5,
        },
      },
      {
        id: "noise",
        at: 0.3,
        payload: {
          type: "ai",
          command: "investigate",
          radius: 24,
          duration: 8,
          anchor: anchor("pine-3", -4, 0, 1),
        },
      },
      ...talk("shelf-collapse", 1, 10),
      objective(
        "shelf-story",
        "超市的身高刻痕证明：撤离公告之后，孩子仍在镇里生活。",
        11,
        ["shelf-collapse"],
      ),
    ],
  },
  "fort-alarm": {
    id: "fort-alarm",
    title: "未经登记的生命",
    duration: 14,
    blocking: false,
    cues: [
      {
        id: "siren",
        at: 0,
        payload: {
          type: "audio",
          audioId: "alarm",
          gain: 0.65,
          anchor: anchor("fort-6"),
        },
      },
      {
        id: "infected-investigate",
        at: 0,
        payload: {
          type: "ai",
          command: "investigate",
          radius: 65,
          duration: 14,
          anchor: anchor("fort-6"),
        },
      },
      {
        id: "alarm-light",
        at: 0,
        payload: {
          type: "lighting",
          target: "fort-6",
          color: "#cc392a",
          intensity: 2,
          duration: 14,
          anchor: anchor("fort-6", 0, 2),
        },
      },
      ...talk("fort-alarm", 0.5, 12),
      objective(
        "fort-alarm-heard",
        "检查站广播确认救援已经终止。警报会吸引附近感染者。",
        13,
        ["fort-alarm"],
      ),
    ],
  },
};

// Stretch the authored timeline around complete recorded lines. Camera cuts,
// mandatory commits and the end time move together; extending only the end
// would let the next line interrupt its predecessor.
for (const sequence of Object.values(NARRATIVE_SEQUENCES)) {
  const speeches = sequence.cues.flatMap((cue) => {
    if (cue.payload.type !== "dialogue") return [];
    const measured = DIALOGUE_DURATIONS[cue.payload.audioId];
    return [
      {
        at: cue.at,
        duration: cue.payload.duration,
        extra: measured
          ? Math.max(0, measured + 0.35 - cue.payload.duration)
          : 0,
      },
    ];
  });
  const time = (value: number) =>
    value +
    speeches.reduce(
      (sum, line) =>
        sum +
        line.extra *
          Math.max(0, Math.min(1, (value - line.at) / line.duration)),
      0,
    );
  sequence.duration = time(sequence.duration);
  for (const cue of sequence.cues) {
    const start = cue.at;
    if ("duration" in cue.payload)
      cue.payload.duration = time(start + cue.payload.duration) - time(start);
    cue.at = time(start);
  }
}
