import type { NarrativeState, Vec3 } from "../core/types";

export interface NarrativeAnchor {
  poiId: string;
  offset: Vec3;
}
export type SequenceCue =
  | {
      type: "camera";
      position: NarrativeAnchor;
      lookAt: NarrativeAnchor;
      fov: number;
      duration: number;
      moveFrom?: NarrativeAnchor;
    }
  | {
      type: "audio";
      audioId: string;
      gain: number;
      delivery?: "radio" | "dialogue" | "log" | "voice";
      loop?: boolean;
      anchor?: NarrativeAnchor;
    }
  | {
      type: "dialogue";
      audioId: string;
      speaker: string;
      text: string;
      duration: number;
    }
  | {
      type: "animation";
      target: string;
      animation:
        | "wake"
        | "point"
        | "shelf-fall"
        | "lift-down"
        | "lift-up"
        | "console-use";
      duration: number;
      anchor?: NarrativeAnchor;
    }
  | {
      type: "lighting";
      target: string;
      color: string;
      intensity: number;
      duration: number;
      anchor?: NarrativeAnchor;
    }
  | {
      type: "ai";
      command: "hold" | "release" | "investigate" | "withdraw";
      radius: number;
      anchor: NarrativeAnchor;
      duration: number;
    }
  | { type: "door"; doorId: string; state: "open" | "closed" | "unlocked" }
  | {
      type: "explosion";
      anchor: NarrativeAnchor;
      radius: number;
      intensity: number;
      damage: number;
    }
  | {
      type: "particle";
      anchor: NarrativeAnchor;
      effect: "dust" | "sparks" | "smoke" | "embers";
      count: number;
      duration: number;
    }
  | { type: "objective"; text: string; flag?: string; audioLogs?: string[] };

export interface TimedCue {
  id: string;
  at: number;
  persistent?: boolean;
  payload: SequenceCue;
}
export interface SequenceDefinition {
  id: string;
  title: string;
  duration: number;
  blocking: boolean;
  cues: TimedCue[];
}
export interface SequenceCueEvent {
  /** Stable key. Persistent setters may be redelivered until ackCue(key). */
  key: string;
  sequenceId: string;
  cueId: string;
  at: number;
  payload: SequenceCue;
  replay: boolean;
  skipped: boolean;
  requiresAck: boolean;
}
export interface SequenceFrame {
  id: string | null;
  title: string;
  elapsed: number;
  duration: number;
  blocking: boolean;
  skippable: boolean;
  camera: { position: Vec3; lookAt: Vec3; fov: number } | null;
  subtitle: {
    speaker: string;
    text: string;
    remaining: number;
    audioId: string;
  } | null;
}
export interface FinaleChoice {
  id: NonNullable<NarrativeState["choice"]>;
  interactionId: string;
  title: string;
  consequence: string;
  ending: NonNullable<NarrativeState["ending"]>;
  available: boolean;
  missing: string[];
}
