import type { WorldState, InventoryData, Vec3 } from "../core/types";
import { validateInventory, validEntityId } from "../simulation/inventory";
import { ITEMS } from "../data/items";
import { ENEMIES } from "../data/enemies";
import { generatePOIs } from "../world/generator";
import {
  initialDirector,
  initialNarrative,
  normalizeActor,
} from "../simulation/quality-state";
export interface SaveEntry {
  id: string;
  name: string;
  seed: string;
  day: number;
  updatedAt: number;
  playtime: number;
  state: WorldState;
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function finiteDeep(value: unknown, depth = 0): boolean {
  if (depth > 40) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((v) => finiteDeep(v, depth + 1));
  if (record(value))
    return Object.values(value).every((v) => finiteDeep(v, depth + 1));
  return true;
}
const vector = (v: Vec3): boolean =>
  !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
export function serialize(state: WorldState): string {
  if (!validateState(state)) throw new Error("存档状态未通过校验");
  return JSON.stringify(state);
}
export function deserialize(json: string): WorldState {
  const parsed: unknown = JSON.parse(json);
  if (record(parsed) && parsed.version === 1) {
    const s = parsed as unknown as WorldState;
    s.version = 2;
    s.doorStates = {};
    s.narrative = initialNarrative();
    s.director = initialDirector();
    s.narrative.seenSequences.push("opening");
    if (record(s.actors))
      for (const actor of Object.values(s.actors)) normalizeActor(actor);
    s.rules ??= {
      dayLength: 60,
      lootAmount: 1,
      enemyDensity: 1,
      permadeath: s.difficulty === "ashfall",
    };
    s.cooldowns ??= {};
    s.waypoint ??= null;
    if (s.player?.stats) s.player.stats.oxygen ??= 100;
    const normalize = (inv: InventoryData | undefined) => {
      if (Array.isArray(inv?.items))
        for (const item of inv.items) {
          item.jammed ??= false;
          item.dirt ??= 0;
        }
    };
    normalize(s.player?.inventory);
    if (record(s.containers))
      for (const c of Object.values(s.containers)) normalize(c?.inventory);
    if (Array.isArray(s.structures))
      for (const b of s.structures) normalize(b?.inventory);
    if (Array.isArray(s.vehicles))
      for (const v of s.vehicles) normalize(v?.inventory);
  }
  if (record(parsed) && parsed.version === 2 && record(parsed.actors)) {
    for (const actor of Object.values(parsed.actors))
      if (record(actor))
        normalizeActor(actor as unknown as WorldState["actors"][string]);
  }
  if (
    record(parsed) &&
    record(parsed.player) &&
    parsed.player.flashlightCharge === undefined
  )
    parsed.player.flashlightCharge = 100;
  if (!validateState(parsed)) throw new Error("存档格式不正确或已损坏");
  return parsed;
}
export function validateState(input: unknown): input is WorldState {
  if (!record(input)) return false;
  const s = input as unknown as WorldState;
  try {
    if (
      s.version !== 2 ||
      typeof s.seed !== "string" ||
      s.seed.length < 1 ||
      s.seed.length > 64 ||
      typeof s.name !== "string" ||
      s.name.length > 80 ||
      !["survivor", "standard", "hardcore", "ashfall"].includes(s.difficulty) ||
      !finiteDeep(s)
    )
      return false;
    if (!record(s.doorStates) || !record(s.narrative) || !record(s.director))
      return false;
    if (
      !Object.values(s.doorStates).every(
        (d) =>
          validEntityId(d.id) &&
          ["wood", "metal", "security", "gate", "vehicle"].includes(d.kind) &&
          [
            "closed",
            "opening",
            "open",
            "closing",
            "locked",
            "blocked",
            "broken",
          ].includes(d.status) &&
          [
            d.progress,
            d.target,
            d.health,
            d.duration,
            d.startedAt,
            d.blockedUntil,
            d.rattle,
          ].every(Number.isFinite) &&
          d.progress >= 0 &&
          d.progress <= 1 &&
          [0, 1].includes(d.target) &&
          d.health >= 0 &&
          typeof d.locked === "boolean",
      )
    )
      return false;
    const narrative = s.narrative;
    if (
      !Number.isInteger(narrative.act) ||
      narrative.act < 1 ||
      narrative.act > 5 ||
      ![
        narrative.objectives,
        narrative.seenSequences,
        narrative.sequenceFlags,
        narrative.audioLogs,
      ].every(
        (list) =>
          Array.isArray(list) && list.every((x) => typeof x === "string"),
      ) ||
      !record(narrative.quests)
    )
      return false;
    if (
      !Object.values(narrative.quests).every(
        (q) =>
          Number.isInteger(q.stage) &&
          q.stage >= 0 &&
          typeof q.completed === "boolean",
      )
    )
      return false;
    if (
      ![null, "truth", "ash", "survivor"].includes(narrative.ending) ||
      ![null, "publish", "destroy", "shutdown"].includes(narrative.choice)
    )
      return false;
    if (
      narrative.activeSequence !== null &&
      (!record(narrative.activeSequence) ||
        typeof narrative.activeSequence.id !== "string" ||
        !Number.isFinite(narrative.activeSequence.elapsed) ||
        !Array.isArray(narrative.activeSequence.applied) ||
        !narrative.activeSequence.applied.every((x) => typeof x === "string"))
    )
      return false;
    if (
      ![
        s.director.tension,
        s.director.lastCombat,
        s.director.recoveryUntil,
        s.director.lastEvent,
        s.director.encounters,
      ].every(Number.isFinite) ||
      s.director.tension < 0 ||
      s.director.tension > 100
    )
      return false;
    if (s.director.pacing) {
      const p = s.director.pacing;
      if (
        !record(p) ||
        !["calm", "rising", "peak", "recovery"].includes(p.phase) ||
        ![
          p.phaseSince,
          p.peakUntil,
          p.lastSample,
          p.lastHealth,
          p.lastKills,
          p.resourcePressure,
          p.locationDanger,
          p.eventCooldownUntil,
          p.highestIntensity,
        ].every(Number.isFinite) ||
        !Array.isArray(p.recentKinds) ||
        !p.recentKinds.every((x) => typeof x === "string") ||
        p.recentKinds.length > 12
      )
        return false;
    }
    if (
      !Number.isInteger(s.day) ||
      s.day < 1 ||
      !Number.isFinite(s.time) ||
      !Number.isFinite(s.createdAt) ||
      !Number.isInteger(s.uidCounter) ||
      s.uidCounter < 0 ||
      !Number.isFinite(s.nextEvent) ||
      !Number.isFinite(s.nextWeather) ||
      s.time < 0 ||
      s.time >= 24 ||
      !Number.isFinite(s.elapsed) ||
      s.elapsed < 0 ||
      !["clear", "cloudy", "overcast", "rain", "storm", "fog"].includes(
        s.weather,
      )
    )
      return false;
    if (
      !s.rules ||
      ![s.rules.dayLength, s.rules.lootAmount, s.rules.enemyDensity].every(
        Number.isFinite,
      ) ||
      s.rules.dayLength < 30 ||
      s.rules.dayLength > 120 ||
      s.rules.lootAmount < 0.5 ||
      s.rules.lootAmount > 2 ||
      s.rules.enemyDensity < 0.5 ||
      s.rules.enemyDensity > 2 ||
      typeof s.rules.permadeath !== "boolean" ||
      !record(s.cooldowns)
    )
      return false;
    if (s.waypoint !== null && !vector(s.waypoint)) return false;
    const p = s.player,
      stats = p.stats;
    if (
      !vector(p.position) ||
      Math.abs(p.position.x) > 2050 ||
      Math.abs(p.position.z) > 2050 ||
      !vector(p.spawn) ||
      !Number.isFinite(p.yaw) ||
      !Number.isFinite(p.pitch)
    )
      return false;
    if (
      typeof stats.fracture !== "boolean" ||
      !Number.isFinite(stats.temperature) ||
      stats.temperature < 28 ||
      stats.temperature > 41
    )
      return false;
    for (const key of [
      "oxygen",
      "health",
      "blood",
      "stamina",
      "energy",
      "hydration",
      "fatigue",
      "wetness",
      "pain",
      "infection",
      "poison",
      "bleeding",
    ] as const)
      if (typeof stats[key] !== "number" || stats[key] < 0 || stats[key] > 100)
        return false;
    if (
      !validateInventory(p.inventory) ||
      !Number.isInteger(p.selected) ||
      p.selected < 0 ||
      p.selected > 4 ||
      !Array.isArray(p.quickSlots) ||
      p.quickSlots.length !== 5
    )
      return false;
    if (
      !p.quickSlots.every(
        (uid) => uid === null || p.inventory.items.some((i) => i.uid === uid),
      )
    )
      return false;
    for (const [slot, uid] of Object.entries(p.equipment)) {
      const item = p.inventory.items.find((i) => i.uid === uid),
        def = item && ITEMS[item.id];
      if (!def) return false;
      if (["primary", "secondary", "holster"].includes(slot)) {
        if (!["weapon", "tool"].includes(def.category)) return false;
      } else if (def.slot !== slot) return false;
    }
    if (
      !record(s.containers) ||
      !record(s.actors) ||
      !record(s.doors) ||
      !Array.isArray(s.structures) ||
      !Array.isArray(s.vehicles) ||
      !Array.isArray(s.events)
    )
      return false;
    if (
      !Object.values(s.containers).every(
        (c) =>
          validEntityId(c.id) &&
          typeof c.name === "string" &&
          typeof c.type === "string" &&
          Number.isFinite(c.openedAt) &&
          vector(c.position) &&
          validateInventory(c.inventory) &&
          typeof c.searched === "boolean",
      )
    )
      return false;
    if (
      !Object.values(s.actors).every(
        (a) =>
          validEntityId(a.id) &&
          [a.yaw, a.timer, a.cooldown, a.lastSeen, a.phase].every(
            Number.isFinite,
          ) &&
          typeof a.harvested === "boolean" &&
          [
            "idle",
            "wander",
            "investigate",
            "chase",
            "attack",
            "search",
            "flee",
            "cover",
            "windup",
            "recover",
            "stagger",
            "knockdown",
            "getup",
            "vault",
            "dead",
          ].includes(a.state) &&
          Object.hasOwn(ENEMIES, a.kind) &&
          vector(a.position) &&
          vector(a.home) &&
          vector(a.target) &&
          [
            a.stateAge,
            a.speed,
            a.verticalVelocity,
            a.gaitPhase,
            a.awareness,
            a.legDamage,
            a.armDamage,
            a.deathStyle,
            a.deathTime,
          ].every(Number.isFinite) &&
          [
            "standing",
            "feeding",
            "sitting",
            "lying",
            "wallLean",
            "twitch",
            "patrol",
          ].includes(a.behavior) &&
          (a.attack === null ||
            ([
              a.attack.elapsed,
              a.attack.duration,
              a.attack.hitTime,
              a.attack.yaw,
            ].every(Number.isFinite) &&
              typeof a.attack.hit === "boolean" &&
              ["player", "door", "structure"].includes(a.attack.target) &&
              typeof a.attack.targetId === "string")) &&
          (a.reaction === null ||
            ([
              a.reaction.elapsed,
              a.reaction.duration,
              a.reaction.strength,
            ].every(Number.isFinite) &&
              vector(a.reaction.direction) &&
              ["head", "chest", "leg", "arm"].includes(a.reaction.part) &&
              ["front", "back", "left", "right"].includes(a.reaction.side) &&
              ["bullet", "melee", "explosion", "vehicle"].includes(
                a.reaction.source,
              ))) &&
          (a.traversal === null ||
            (vector(a.traversal.from) &&
              vector(a.traversal.to) &&
              [
                a.traversal.elapsed,
                a.traversal.duration,
                a.traversal.height,
              ].every(Number.isFinite))) &&
          typeof a.health === "number",
      )
    )
      return false;
    if (
      !s.structures.every(
        (b) =>
          validEntityId(b.id) &&
          [b.rotation, b.health, b.fuel, b.growth, b.plantedAt].every(
            Number.isFinite,
          ) &&
          typeof b.active === "boolean" &&
          vector(b.position) &&
          ITEMS["kit_" + b.kind] &&
          (!b.inventory || validateInventory(b.inventory)),
      )
    )
      return false;
    if (
      !s.vehicles.every(
        (v) =>
          validEntityId(v.id) &&
          [
            v.yaw,
            v.speed,
            v.fuel,
            v.health,
            v.engine,
            v.battery,
            v.tires,
          ].every(Number.isFinite) &&
          ["pickup", "suv"].includes(v.kind) &&
          vector(v.position) &&
          validateInventory(v.inventory),
      )
    )
      return false;
    if (p.vehicle !== null && !s.vehicles.some((v) => v.id === p.vehicle))
      return false;
    if (
      !["stand", "crouch", "prone"].includes(p.stance) ||
      typeof p.flashlight !== "boolean" ||
      !Number.isFinite(p.flashlightCharge) ||
      p.flashlightCharge < 0 ||
      p.flashlightCharge > 100 ||
      ![p.distance, p.kills, p.deaths].every(Number.isFinite)
    )
      return false;
    if (
      !s.events.every(
        (e) =>
          validEntityId(e.id) &&
          [e.start, e.expires].every(Number.isFinite) &&
          typeof e.resolved === "boolean" &&
          typeof e.name === "string" &&
          vector(e.position),
      )
    )
      return false;
    for (const event of s.events) {
      const e = event.encounter;
      if (e === undefined) continue;
      if (
        !record(e) ||
        e.version !== 1 ||
        !Number.isInteger(e.stage) ||
        e.stage < 0 ||
        e.stage > 3 ||
        ![e.stageAt, e.survivorHealth, e.lastUpdate].every(Number.isFinite) ||
        e.survivorHealth < 0 ||
        e.survivorHealth > 100 ||
        !["active", "success", "failed", "expired"].includes(e.outcome) ||
        !["none", "quiet", "force", "aid"].includes(e.approach) ||
        typeof e.rewardClaimed !== "boolean" ||
        !Array.isArray(e.hostileIds) ||
        !e.hostileIds.every(validEntityId) ||
        !generatePOIs(s.seed).some((p) => p.id === e.poiId)
      )
        return false;
    }
    for (const list of [s.flags, s.journal, s.destroyed, s.discovered])
      if (!Array.isArray(list) || !list.every((v) => typeof v === "string"))
        return false;
    return (
      Object.values(s.doors).every((v) => typeof v === "boolean") &&
      typeof s.ended === "boolean"
    );
  } catch {
    return false;
  }
}
export class SaveSystem {
  private database: Promise<IDBDatabase>;
  constructor() {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open("ashfall-protocol", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("worlds", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("无法打开浏览器存档空间"));
    });
  }
  async save(state: WorldState, id: string): Promise<void> {
    const snapshot = deserialize(serialize(state));
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("worlds", "readwrite");
      tx.objectStore("worlds").put({
        id,
        name: snapshot.name,
        seed: snapshot.seed,
        day: snapshot.day,
        updatedAt: Date.now(),
        playtime: snapshot.elapsed,
        state: snapshot,
      } satisfies SaveEntry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("保存失败，浏览器存储空间可能已满"));
      tx.onabort = () => reject(new Error("保存事务已中止"));
    });
  }
  async list(): Promise<SaveEntry[]> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const req = db
        .transaction("worlds", "readonly")
        .objectStore("worlds")
        .getAll();
      req.onsuccess = () =>
        resolve(
          (req.result as SaveEntry[]).sort((a, b) => b.updatedAt - a.updatedAt),
        );
      req.onerror = () => reject(new Error("无法读取存档列表"));
    });
  }
  async load(id: string): Promise<WorldState> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const req = db
        .transaction("worlds", "readonly")
        .objectStore("worlds")
        .get(id);
      req.onsuccess = () => {
        try {
          const entry = req.result as SaveEntry | undefined;
          if (!entry) throw new Error("没有找到这份存档");
          resolve(deserialize(JSON.stringify(entry.state)));
        } catch (error) {
          reject(error);
        }
      };
      req.onerror = () => reject(new Error("读取存档失败"));
    });
  }
  async delete(id: string): Promise<void> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("worlds", "readwrite");
      tx.objectStore("worlds").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("删除存档失败"));
    });
  }
}
