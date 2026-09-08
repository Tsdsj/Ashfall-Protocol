import {
  clamp,
  type Stats,
  type Weather,
  type PlayerData,
} from "../core/types";
import { ITEMS } from "../data/items";
export interface SurvivalEnvironment {
  weather: Weather;
  time: number;
  indoors: boolean;
  nearFire: boolean;
  moving: boolean;
  sprinting: boolean;
  swimming: boolean;
  difficulty: number;
}
export function updateSurvival(
  player: PlayerData,
  dt: number,
  env: SurvivalEnvironment,
): void {
  const s = player.stats,
    drain = env.difficulty;
  const rain = env.weather === "rain" || env.weather === "storm";
  s.oxygen = clamp(
    s.oxygen + dt * (env.swimming && player.stance === "prone" ? -10 : 20),
  );
  if (s.oxygen === 0) s.health = clamp(s.health - dt * 6);
  s.energy = clamp(s.energy - dt * 0.014 * drain * (env.sprinting ? 2.3 : 1));
  s.hydration = clamp(
    s.hydration - dt * 0.021 * drain * (env.sprinting ? 2 : 1),
  );
  s.fatigue = clamp(s.fatigue + dt * 0.005 * drain);
  s.wetness = clamp(
    s.wetness +
      dt *
        (env.swimming
          ? 6
          : rain && !env.indoors
            ? 0.32
            : env.nearFire
              ? -1.7
              : -0.035),
  );
  const insulation = Object.values(player.equipment).reduce(
    (sum, uid) =>
      sum +
      (ITEMS[player.inventory.items.find((i) => i.uid === uid)?.id ?? ""]
        ?.insulation ?? 0),
    0,
  );
  const cold =
    (env.time < 6 || env.time > 20 ? 1.5 : 0) +
    (rain ? 1 : 0) +
    s.wetness * 0.035;
  const target =
    36.8 -
    Math.max(0, cold - insulation * 3) * (env.indoors ? 0.2 : 0.55) +
    (env.nearFire ? 1.3 : 0) +
    (env.moving ? 0.15 : 0);
  s.temperature = clamp(
    s.temperature + (target - s.temperature) * dt * 0.014,
    28,
    41,
  );
  s.pain = clamp(s.pain - dt * 0.01);
  if (s.bleeding > 0) {
    s.blood = clamp(s.blood - dt * s.bleeding * 0.18);
    s.health = clamp(s.health - dt * s.bleeding * 0.035);
    s.infection = clamp(s.infection + dt * 0.006 * drain);
  } else if (s.energy > 25 && s.hydration > 25) {
    s.blood = clamp(s.blood + dt * 0.018);
    s.health = clamp(s.health + dt * 0.008);
  }
  if (s.hydration === 0 || s.energy === 0)
    s.health = clamp(s.health - dt * 0.45 * drain);
  if (s.temperature < 34)
    s.health = clamp(s.health - dt * (34 - s.temperature) * 0.1);
  if (s.blood < 20) s.health = clamp(s.health - dt * 0.8);
  if (s.infection > 30) {
    s.health = clamp(s.health - dt * s.infection * 0.0008);
    s.infection = clamp(s.infection + dt * 0.002);
  }
  if (s.poison > 0) {
    s.health = clamp(s.health - dt * 0.08);
    s.poison = clamp(s.poison - dt * 0.12);
  }
  for (const i of player.inventory.items)
    if (ITEMS[i.id]?.perishable)
      i.freshness = clamp(
        i.freshness - dt * 0.022 * (env.time > 9 && env.time < 18 ? 1.5 : 1),
      );
}
export function applyDamage(
  stats: Stats,
  raw: number,
  bodyPart: "head" | "chest" | "leg" | "arm" = "chest",
  protection = 0,
  bleed = true,
): number {
  const multiplier = { head: 2.5, chest: 1, leg: 0.65, arm: 0.7 }[bodyPart];
  const amount =
    Math.max(0, raw) *
    multiplier *
    (bodyPart === "chest" ? 1 - clamp(protection, 0, 0.85) : 1);
  stats.health = clamp(stats.health - amount);
  stats.pain = clamp(stats.pain + amount * 0.4);
  if (bleed && amount >= 5)
    stats.bleeding = clamp(stats.bleeding + amount / 15, 0, 5);
  if (bodyPart === "leg" && amount > 16) stats.fracture = true;
  return amount;
}
