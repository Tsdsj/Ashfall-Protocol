import type { WorldState, NoiseEvent, Vec3 } from "../core/types";
import type { EventBus } from "../core/events";
import type { WorldGenerator } from "../world/generator";
import type { CollisionWorld } from "./collision";
import type { DoorSystem } from "./doors";
export interface SimContext {
  state: WorldState;
  gen: WorldGenerator;
  collision: CollisionWorld;
  doors: DoorSystem;
  bus: EventBus;
  noises: NoiseEvent[];
  god: boolean;
  readonly busy: boolean;
  viewFov: number;
  viewAspect: number;
  noise(position: Vec3, radius: number, kind: string): void;
  damage(
    amount: number,
    source: string,
    part?: "head" | "chest" | "leg" | "arm",
    bleed?: boolean,
  ): void;
  notify(text: string, type?: "info" | "success" | "warning"): void;
  nextId(prefix: string): string;
}
