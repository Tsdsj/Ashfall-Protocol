import type { Feedback, POI, Vec3 } from "../core/types";

export type AcousticSpace =
  | "small-room"
  | "large-room"
  | "corridor"
  | "underground"
  | "outdoors"
  | "forest";
export const SPACES: Record<
  AcousticSpace,
  { decay: number; wet: number; cutoff: number; delay: number }
> = {
  "small-room": { decay: 0.32, wet: 0.12, cutoff: 5800, delay: 0.011 },
  "large-room": { decay: 1.45, wet: 0.21, cutoff: 6800, delay: 0.028 },
  corridor: { decay: 0.85, wet: 0.19, cutoff: 4600, delay: 0.018 },
  underground: { decay: 2.1, wet: 0.27, cutoff: 3200, delay: 0.04 },
  outdoors: { decay: 0.26, wet: 0.025, cutoff: 6000, delay: 0.08 },
  forest: { decay: 0.42, wet: 0.045, cutoff: 2700, delay: 0.046 },
};

export function acousticSpace(
  position: Vec3,
  pois: POI[],
  indoors: boolean,
  region: string,
  roadDistance: number,
): AcousticSpace {
  const room = pois.find(
    (p) =>
      Math.abs(position.x - p.x) < p.width / 2 &&
      Math.abs(position.z - p.z) < p.depth / 2,
  );
  if (room && indoors) {
    const description = `${room.kind} ${room.name}`;
    if (
      /underground|tunnel|metro|subway|bunker|basement|地铁|地下|隧道|矿井入口/.test(
        description,
      )
    )
      return "underground";
    if (
      /corridor|走廊|连廊|通道/.test(description) ||
      Math.max(room.width / room.depth, room.depth / room.width) > 2.7
    )
      return "corridor";
    if (
      /warehouse|lab|hospital|hangar|factory|仓库|车间|医院|铸造厂|百货/.test(
        description,
      ) ||
      room.width * room.depth > 170
    )
      return "large-room";
    return "small-room";
  }
  return ["pine", "lake"].includes(region) && roadDistance > 12
    ? "forest"
    : "outdoors";
}

export interface SoundLayer {
  group: string;
  volume: number;
  refDistance?: number;
  rate?: number;
  delay?: number;
  cutoff?: number;
}
export interface FoleyContext {
  speed: number;
  stance: "stand" | "crouch" | "prone";
  load: number;
}
export function footstepLayers(
  surface: string,
  foley: FoleyContext,
  strength = 1,
): SoundLayer[] {
  const material =
    surface === "grass"
      ? "dirt"
      : ["wood", "metal", "concrete", "dirt", "water", "glass"].includes(
            surface,
          )
        ? surface
        : "dirt";
  const posture =
    foley.stance === "prone" ? 0.3 : foley.stance === "crouch" ? 0.52 : 1;
  const speed = Math.max(0.62, Math.min(1.35, 0.62 + foley.speed * 0.12));
  const burden = Math.min(1, Math.max(0, foley.load / 32));
  return [
    {
      group: `step-${material}`,
      volume: Math.min(
        0.4,
        0.22 * posture * speed * strength * (1 + burden * 0.16),
      ),
      rate: 0.98 - burden * 0.07 + Math.min(0.08, foley.speed * 0.009),
      cutoff: foley.stance === "prone" ? 1700 : 10000,
    },
    {
      group: "cloth",
      volume: 0.018 + 0.034 * burden * speed,
      delay: 0.022,
      rate: 0.95,
    },
  ];
}

export function weaponLayers(kind = "pistol"): SoundLayer[] {
  if (kind === "melee")
    return [
      { group: "swing", volume: 0.32 },
      { group: "cloth", volume: 0.08, delay: 0.018 },
    ];
  if (kind === "explosion")
    return [
      { group: "explosion", volume: 0.9, rate: 0.86, refDistance: 16 },
      { group: "hit-concrete", volume: 0.28, delay: 0.09, refDistance: 12 },
    ];
  const gun = kind.includes("shotgun")
    ? "shotgun"
    : /rifle|military|ak|carbine|enemy/.test(kind)
      ? "rifle"
      : "pistol";
  return [
    {
      group: `gun-${gun}`,
      volume:
        gun === "shotgun"
          ? 0.82
          : gun === "rifle"
            ? 0.75
            : kind === "smg"
              ? 0.6
              : 0.7,
      rate: kind === "pistol45" ? 0.89 : kind === "smg" ? 1.1 : 1,
    },
    {
      group: "mechanical",
      volume: 0.1,
      delay: gun === "shotgun" ? 0.16 : 0.035,
      rate: gun === "shotgun" ? 0.78 : 1.08,
    },
    {
      group: `tail-${gun}`,
      volume: gun === "shotgun" ? 0.24 : kind === "smg" ? 0.11 : 0.18,
      delay: 0.105,
    },
  ];
}

export function feedbackLayers(
  event: Feedback,
  foley: FoleyContext,
): SoundLayer[] {
  if (event.type === "shot") return weaponLayers(event.kind);
  if (event.type === "damage")
    return [{ group: "hit-flesh", volume: 0.34, cutoff: 2600 }];
  if (event.type === "hit")
    return [
      {
        group: `hit-${event.material ?? (event.kind === "wall" ? "concrete" : "flesh")}`,
        volume: event.kind === "explosion" ? 0.32 : 0.2,
      },
    ];
  if (event.type !== "sound") return [];
  switch (event.kind) {
    case "tree-felled":
      return [
        { group: "hit-wood", volume: 0.4, rate: 0.65 },
        { group: "hit-wood", volume: 0.3, rate: 0.48, delay: 0.65 },
      ];
    case "footstep":
      return footstepLayers(event.text, foley, event.value ?? 1);
    case "growl": {
      const phase = /death|hit|attack|chase|alert|search/.test(event.text)
        ? event.text
        : "idle";
      return [
        {
          group: `infected-${phase}`,
          volume: Math.min(0.36, (event.value ?? 0.7) * 0.34),
          rate: phase === "chase" ? 1.08 : 0.94,
        },
      ];
    }
    case "death":
      return [{ group: "infected-death", volume: 0.25 }];
    case "door":
      return [
        {
          group:
            event.text === "break"
              ? "hit-wood"
              : /locked|blocked/.test(event.text)
                ? "latch"
                : event.text === "close"
                  ? "door-close"
                  : "door-open",
          volume: 0.25,
        },
      ];
    case "mechanical":
      return [
        {
          group:
            event.text === "mag-out"
              ? "mag-out"
              : event.text === "mag-in"
                ? "mag-in"
                : "mechanical",
          volume: 0.2,
        },
      ];
    case "reload":
      return [
        { group: "mag-out", volume: 0.12 },
        { group: "mag-in", volume: 0.15, delay: 0.22 },
        { group: "mechanical", volume: 0.18, delay: 0.5 },
      ];
    case "empty":
      return [{ group: "latch", volume: 0.14 }];
    case "pickup":
    case "craft":
      return [
        { group: "cloth", volume: 0.12 },
        { group: "ui", volume: 0.05 },
      ];
    case "radio":
      return [{ group: "radio", volume: 0.09, cutoff: 3300 }];
    case "action-start":
    case "action-loop": {
      const group = /drink|eat|food/.test(event.text)
        ? "water"
        : /repair|build/.test(event.text)
          ? "mechanical"
          : "cloth";
      return [{ group, volume: event.kind === "action-loop" ? 0.06 : 0.13 }];
    }
    case "throw":
      return [
        { group: "swing", volume: 0.3 },
        { group: "cloth", volume: 0.14 },
      ];
    case "drink":
      return [{ group: "water", volume: 0.18 }];
    case "food":
    case "medical":
      return [{ group: "cloth", volume: 0.15 }];
    case "impact":
      return [{ group: "hit-metal", volume: 0.32, rate: 0.6 }];
    case "flashlight":
      return [
        {
          group: "switch",
          volume: 0.15,
          rate: event.text === "off" ? 0.9 : 1.08,
        },
      ];
    case "flashlight-low":
      return [{ group: "ui", volume: 0.05, rate: 0.7 }];
    case "animal":
      return [{ group: "birds", volume: 0.1 }];
    default:
      return [];
  }
}

/** Do not let a frame-rate action emitter or an infected crowd become a wall of sound. */
export function eventCooldown(event: Feedback): number {
  if (event.kind === "growl")
    return /attack|hit|death/.test(event.text)
      ? 0.25
      : /chase|alert/.test(event.text)
        ? 1.1
        : 4.5;
  if (event.kind === "footstep") return 0.105;
  if (event.kind === "action-loop") return 0.85;
  if (event.kind === "flashlight-low") return 12;
  if (event.type === "hit") return 0.025;
  return 0.04;
}

export function variantIndex(
  count: number,
  previous: number,
  random = Math.random(),
): number {
  if (count <= 1) return 0;
  const index = Math.floor(
    Math.max(0, Math.min(0.999999, random)) * (count - 1),
  );
  return index >= previous && previous >= 0 ? index + 1 : index;
}
