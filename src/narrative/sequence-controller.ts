import type { NarrativeState, Vec3 } from "../core/types";
import type {
  NarrativeAnchor,
  SequenceCueEvent,
  SequenceDefinition,
  SequenceFrame,
  TimedCue,
} from "./types";
import { NARRATIVE_SEQUENCES } from "./sequences";

/** Gameplay commits are persisted; presentation setters are replayable and acknowledged separately. */
export class SequenceController {
  private pending = new Map<string, SequenceCueEvent>();
  private transient: SequenceCueEvent[] = [];
  constructor(
    private state: NarrativeState,
    private resolve: (anchor: NarrativeAnchor) => Vec3,
    private definitions: Record<
      string,
      SequenceDefinition
    > = NARRATIVE_SEQUENCES,
  ) {
    const active = state.activeSequence;
    if (active && !Object.hasOwn(definitions, active.id))
      state.activeSequence = null;
    for (const definition of Object.values(definitions)) {
      const seen = state.seenSequences.includes(definition.id);
      for (const cue of definition.cues) {
        if (
          cue.persistent &&
          (seen ||
            (active?.id === definition.id && active.applied.includes(cue.id)))
        ) {
          this.deliver(definition.id, cue, true, false);
        }
      }
    }
  }
  start(id: string): boolean {
    if (
      !Object.hasOwn(this.definitions, id) ||
      this.state.activeSequence ||
      this.state.seenSequences.includes(id)
    )
      return false;
    this.state.activeSequence = { id, elapsed: 0, applied: [] };
    this.update(0);
    return true;
  }
  update(dt: number): void {
    const active = this.state.activeSequence;
    if (!active) return;
    const definition = this.definitions[active.id]!;
    active.elapsed = Math.min(
      definition.duration,
      active.elapsed + (Number.isFinite(dt) ? Math.max(0, dt) : 0),
    );
    for (const cue of definition.cues) {
      if (cue.at <= active.elapsed && !active.applied.includes(cue.id))
        this.apply(definition.id, cue, false);
    }
    if (active.elapsed >= definition.duration) this.finish(definition.id);
  }
  skip(): boolean {
    const active = this.state.activeSequence;
    if (!active) return false;
    const definition = this.definitions[active.id]!;
    // Do not play delayed explosions, voice clips or obsolete camera cuts on skip.
    this.transient = this.transient.filter(
      (cue) => cue.sequenceId !== definition.id,
    );
    for (const cue of definition.cues) {
      if (!cue.persistent) continue;
      if (!active.applied.includes(cue.id))
        this.apply(definition.id, cue, true);
      else this.deliver(definition.id, cue, false, true);
    }
    this.finish(definition.id);
    return true;
  }
  private apply(id: string, cue: TimedCue, skipped: boolean): void {
    const active = this.state.activeSequence!;
    if (cue.payload.type === "objective") {
      if (
        cue.payload.flag &&
        !this.state.sequenceFlags.includes(cue.payload.flag)
      )
        this.state.sequenceFlags.push(cue.payload.flag);
      for (const log of cue.payload.audioLogs ?? [])
        if (!this.state.audioLogs.includes(log)) this.state.audioLogs.push(log);
    }
    active.applied.push(cue.id);
    this.deliver(id, cue, false, skipped);
  }
  private deliver(
    id: string,
    cue: TimedCue,
    replay: boolean,
    skipped: boolean,
  ): void {
    const event: SequenceCueEvent = {
      key: `${id}:${cue.id}`,
      sequenceId: id,
      cueId: cue.id,
      at: cue.at,
      payload: cue.payload,
      replay,
      skipped,
      requiresAck: !!cue.persistent,
    };
    if (cue.persistent) this.pending.set(event.key, event);
    else this.transient.push(event);
  }
  private finish(id: string): void {
    if (!this.state.seenSequences.includes(id))
      this.state.seenSequences.push(id);
    this.state.activeSequence = null;
  }
  drainCues(): SequenceCueEvent[] {
    const result = [...this.pending.values(), ...this.transient];
    this.transient = [];
    return result;
  }
  /** Ack only after applying the setter. On world reload persistent scene setters replay once. */
  ackCue(key: string): void {
    this.pending.delete(key);
  }
  frame(): SequenceFrame {
    const active = this.state.activeSequence;
    if (!active)
      return {
        id: null,
        title: "",
        elapsed: 0,
        duration: 0,
        blocking: false,
        skippable: false,
        camera: null,
        subtitle: null,
      };
    const definition = this.definitions[active.id]!;
    const result: SequenceFrame = {
      id: active.id,
      title: definition.title,
      elapsed: active.elapsed,
      duration: definition.duration,
      blocking: definition.blocking,
      skippable: true,
      camera: null,
      subtitle: null,
    };
    for (const { at, payload } of definition.cues) {
      if (at > active.elapsed) continue;
      if (
        payload.type === "camera" &&
        definition.blocking &&
        active.elapsed < at + payload.duration
      ) {
        const end = this.resolve(payload.position),
          from = payload.moveFrom ? this.resolve(payload.moveFrom) : end;
        const linear = Math.min(
            1,
            (active.elapsed - at) / Math.max(0.001, payload.duration),
          ),
          t = linear * linear * (3 - 2 * linear);
        result.camera = {
          position: {
            x: from.x + (end.x - from.x) * t,
            y: from.y + (end.y - from.y) * t,
            z: from.z + (end.z - from.z) * t,
          },
          lookAt: this.resolve(payload.lookAt),
          fov: payload.fov,
        };
      }
      if (payload.type === "dialogue" && active.elapsed < at + payload.duration)
        result.subtitle = {
          speaker: payload.speaker,
          text: payload.text,
          remaining: at + payload.duration - active.elapsed,
          audioId: payload.audioId,
        };
    }
    return result;
  }
}
