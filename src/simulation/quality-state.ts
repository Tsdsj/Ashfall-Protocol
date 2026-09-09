import type { ActorData, DirectorState, NarrativeState } from "../core/types";
import { random } from "../core/random";

export function initialNarrative(): NarrativeState {
  return {
    act: 1,
    objectives: [],
    quests: {},
    seenSequences: [],
    sequenceFlags: [],
    audioLogs: [],
    ending: null,
    choice: null,
    activeSequence: null,
  };
}
export function initialDirector(): DirectorState {
  return {
    tension: 0,
    lastCombat: -1000,
    recoveryUntil: 0,
    lastEvent: 0,
    encounters: 0,
  };
}
export function normalizeActor(a: ActorData): ActorData {
  const rng = random(a.id + ":scene-behavior");
  const behaviors: ActorData["behavior"][] = [
    "standing",
    "feeding",
    "sitting",
    "lying",
    "wallLean",
    "twitch",
    "patrol",
  ];
  a.behavior ??= behaviors[Math.floor(rng() * behaviors.length)]!;
  a.stateAge ??= 0;
  a.speed ??= 0;
  a.verticalVelocity ??= 0;
  a.gaitPhase ??= a.phase;
  a.awareness ??= 0;
  a.legDamage ??= 0;
  a.armDamage ??= 0;
  a.deathStyle ??= Math.floor(rng() * 4);
  a.deathTime ??= a.health <= 0 ? -100 : 0;
  a.attack ??= null;
  a.reaction ??= null;
  a.traversal ??= null;
  return a;
}
