export type Vec3 = { x: number; y: number; z: number };
export interface WorldRules {
  dayLength: number;
  lootAmount: number;
  enemyDensity: number;
  permadeath: boolean;
}
export type Difficulty = "survivor" | "standard" | "hardcore" | "ashfall";
export type Quality = "low" | "medium" | "high" | "ultra";
export type Weather =
  "clear" | "cloudy" | "overcast" | "rain" | "storm" | "fog";
export type Category =
  | "weapon"
  | "ammo"
  | "food"
  | "drink"
  | "medical"
  | "tool"
  | "material"
  | "clothing"
  | "armor"
  | "electronic"
  | "quest"
  | "building";
export type EquipSlot =
  | "head"
  | "face"
  | "chest"
  | "hands"
  | "legs"
  | "feet"
  | "back"
  | "vest"
  | "primary"
  | "secondary"
  | "holster";
export type Station = "hand" | "fire" | "workbench" | "power";
export interface WeaponDef {
  damage: number;
  range: number;
  interval: number;
  stamina: number;
  ammo?: string;
  magazine?: number;
  velocity?: number;
  reload?: number;
  recoil: number;
  pellets?: number;
  penetration?: number;
}
export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: Category;
  weight: number;
  width: number;
  height: number;
  maxStack: number;
  rarity: "common" | "uncommon" | "rare" | "military" | "experimental";
  icon: string;
  color: string;
  value: number;
  weapon?: WeaponDef;
  slot?: EquipSlot;
  protection?: number;
  insulation?: number;
  energy?: number;
  hydration?: number;
  healing?: number;
  cure?: string;
  perishable?: boolean;
  structure?: string;
}
export interface Stack {
  uid: string;
  id: string;
  count: number;
  x: number;
  y: number;
  rotated: boolean;
  durability: number;
  freshness: number;
  ammo: number;
  jammed: boolean;
  dirt: number;
  attachments: string[];
}
export interface InventoryData {
  width: number;
  height: number;
  items: Stack[];
}
export interface Stats {
  oxygen: number;
  health: number;
  blood: number;
  stamina: number;
  energy: number;
  hydration: number;
  temperature: number;
  fatigue: number;
  wetness: number;
  pain: number;
  bleeding: number;
  fracture: boolean;
  infection: number;
  poison: number;
}
export interface PlayerData {
  position: Vec3;
  yaw: number;
  pitch: number;
  stats: Stats;
  inventory: InventoryData;
  equipment: Partial<Record<EquipSlot, string>>;
  quickSlots: (string | null)[];
  selected: number;
  flashlight: boolean;
  flashlightCharge: number;
  stance: "stand" | "crouch" | "prone";
  spawn: Vec3;
  vehicle: string | null;
  kills: number;
  deaths: number;
  distance: number;
}
export type EnemyKind =
  | "walker"
  | "runner"
  | "bloated"
  | "armored"
  | "stalker"
  | "raider"
  | "deer"
  | "boar"
  | "wolf";
export type AIState =
  | "idle"
  | "wander"
  | "investigate"
  | "chase"
  | "attack"
  | "search"
  | "flee"
  | "cover"
  | "windup"
  | "recover"
  | "stagger"
  | "knockdown"
  | "getup"
  | "vault"
  | "dead";
export type BodyPart = "head" | "chest" | "leg" | "arm";
export type ImpactMaterial =
  "wood" | "metal" | "concrete" | "dirt" | "glass" | "flesh";
export interface HitContext {
  direction?: Vec3;
  position?: Vec3;
  source?: "bullet" | "melee" | "explosion" | "vehicle";
  weapon?: string;
  impact?: number;
}
export interface ActorAttack {
  elapsed: number;
  duration: number;
  hitTime: number;
  hit: boolean;
  yaw: number;
  target: "player" | "door" | "structure";
  targetId: string;
}
export interface ActorReaction {
  elapsed: number;
  duration: number;
  strength: number;
  direction: Vec3;
  part: BodyPart;
  side: "front" | "back" | "left" | "right";
  source: "bullet" | "melee" | "explosion" | "vehicle";
}
export interface ActorData {
  id: string;
  kind: EnemyKind;
  position: Vec3;
  home: Vec3;
  yaw: number;
  health: number;
  state: AIState;
  target: Vec3;
  timer: number;
  cooldown: number;
  lastSeen: number;
  harvested: boolean;
  phase: number;
  behavior:
    | "standing"
    | "feeding"
    | "sitting"
    | "lying"
    | "wallLean"
    | "twitch"
    | "patrol";
  stateAge: number;
  speed: number;
  verticalVelocity: number;
  gaitPhase: number;
  awareness: number;
  legDamage: number;
  armDamage: number;
  deathStyle: number;
  deathTime: number;
  attack: ActorAttack | null;
  reaction: ActorReaction | null;
  traversal: {
    from: Vec3;
    to: Vec3;
    elapsed: number;
    duration: number;
    height: number;
  } | null;
}
export type DoorStatus =
  "closed" | "opening" | "open" | "closing" | "locked" | "blocked" | "broken";
export interface DoorData {
  id: string;
  status: DoorStatus;
  kind: "wood" | "metal" | "security" | "gate" | "vehicle";
  progress: number;
  target: number;
  health: number;
  locked: boolean;
  duration: number;
  startedAt: number;
  blockedUntil: number;
  rattle: number;
}
export interface NarrativeState {
  act: number;
  objectives: string[];
  quests: Record<string, { stage: number; completed: boolean }>;
  seenSequences: string[];
  sequenceFlags: string[];
  audioLogs: string[];
  ending: "truth" | "ash" | "survivor" | null;
  choice: "publish" | "destroy" | "shutdown" | null;
  activeSequence: { id: string; elapsed: number; applied: string[] } | null;
}
export interface DirectorState {
  tension: number;
  lastCombat: number;
  recoveryUntil: number;
  lastEvent: number;
  encounters: number;
  /** Optional for v1/v2 saves created before the pacing pass. */
  pacing?: {
    phase: "calm" | "rising" | "peak" | "recovery";
    phaseSince: number;
    peakUntil: number;
    lastSample: number;
    lastHealth: number;
    lastKills: number;
    resourcePressure: number;
    locationDanger: number;
    eventCooldownUntil: number;
    highestIntensity: number;
    recentKinds: string[];
  };
}
export interface ContainerData {
  id: string;
  name: string;
  type: string;
  position: Vec3;
  inventory: InventoryData;
  searched: boolean;
  openedAt: number;
}
export interface StructureData {
  id: string;
  kind: string;
  position: Vec3;
  rotation: number;
  health: number;
  fuel: number;
  active: boolean;
  inventory?: InventoryData;
  growth: number;
  plantedAt: number;
}
export interface VehicleData {
  id: string;
  kind: "pickup" | "suv";
  position: Vec3;
  yaw: number;
  speed: number;
  fuel: number;
  health: number;
  battery: number;
  tires: number;
  engine: number;
  inventory: InventoryData;
}
export interface WorldEvent {
  id: string;
  kind: string;
  name: string;
  position: Vec3;
  start: number;
  expires: number;
  resolved: boolean;
  /** Authored encounters retain their physical participants and transaction state. */
  encounter?: {
    version: 1;
    stage: number;
    stageAt: number;
    outcome: "active" | "success" | "failed" | "expired";
    hostileIds: string[];
    survivorHealth: number;
    lastUpdate: number;
    rewardClaimed: boolean;
    poiId: string;
    approach: "none" | "quiet" | "force" | "aid";
  };
}
export interface WorldState {
  version: 2;
  rules: WorldRules;
  waypoint: Vec3 | null;
  cooldowns: Record<string, number>;
  seed: string;
  name: string;
  difficulty: Difficulty;
  createdAt: number;
  elapsed: number;
  time: number;
  day: number;
  weather: Weather;
  nextWeather: number;
  player: PlayerData;
  containers: Record<string, ContainerData>;
  actors: Record<string, ActorData>;
  structures: StructureData[];
  vehicles: VehicleData[];
  doors: Record<string, boolean>;
  doorStates: Record<string, DoorData>;
  narrative: NarrativeState;
  director: DirectorState;
  destroyed: string[];
  discovered: string[];
  journal: string[];
  flags: string[];
  events: WorldEvent[];
  nextEvent: number;
  uidCounter: number;
  ended: boolean;
}
export interface Recipe {
  id: string;
  name: string;
  description: string;
  category: string;
  station: Station;
  ingredients: Record<string, number>;
  output: string;
  count: number;
  seconds: number;
}
export interface POI {
  id: string;
  name: string;
  region: string;
  kind: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  danger: number;
  story?: string;
}
export interface Collider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  door?: string;
  material?: ImpactMaterial;
  obb?: {
    x: number;
    z: number;
    halfWidth: number;
    halfDepth: number;
    yaw: number;
  };
}
export interface NoiseEvent {
  position: Vec3;
  radius: number;
  intensity: number;
  kind: string;
  life: number;
}
export interface GameSettings {
  quality: Quality;
  resolution: number;
  fov: number;
  cameraProfile?: number;
  sensitivity: number;
  invertY: boolean;
  dragLook: boolean;
  headBob: number;
  cameraShake: number;
  masterVolume: number;
  ambientVolume: number;
  effectsVolume: number;
  uiScale: number;
  subtitles: boolean;
  reducedMotion: boolean;
  fullscreen: boolean;
  keys: Record<string, string>;
}
export interface Feedback {
  type:
    | "info"
    | "success"
    | "warning"
    | "damage"
    | "sound"
    | "motion"
    | "shot"
    | "hit"
    | "death";
  text: string;
  position?: Vec3;
  value?: number;
  kind?: string;
  actorId?: string;
  direction?: Vec3;
  normal?: Vec3;
  material?: ImpactMaterial;
  weapon?: string;
  part?: BodyPart;
}
export const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));
export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
export const copy = <T>(x: T): T => structuredClone(x);
export type InteractionType =
  | "container"
  | "door"
  | "resource"
  | "structure"
  | "vehicle"
  | "story"
  | "npc"
  | "radio"
  | "extraction"
  | "water"
  | "corpse"
  | "glass";
export interface Interaction {
  id: string;
  type: InteractionType;
  name: string;
  position: Vec3;
  detail?: string;
  resource?: string;
}
