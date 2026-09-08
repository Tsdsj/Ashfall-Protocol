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
  | "dead";
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
}
export interface WorldState {
  version: 1;
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
    | "shot"
    | "hit"
    | "death";
  text: string;
  position?: Vec3;
  value?: number;
  kind?: string;
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
