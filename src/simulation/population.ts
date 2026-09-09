import { choose, random } from "../core/random";
import {
  distance,
  clamp,
  type ActorData,
  type EnemyKind,
  type Vec3,
} from "../core/types";
import { ENEMIES } from "../data/enemies";
import { generateLoot, containerLabel, UNIQUE_POI_LOOT } from "../data/loot";
import { addItem, countItem, newInventory } from "./inventory";
import type { SimContext } from "./context";
import { normalizeActor } from "./quality-state";
import { ITEMS } from "../data/items";
import {
  createWorldEvent,
  eventSiteUsed,
  eventLayoutFits,
  updateWorldEvents,
  type AuthoredEventKind,
  type EventLocation,
} from "./world-events";
export function insidePlayerView(ctx: SimContext, position: Vec3): boolean {
  const p = ctx.state.player,
    dx = position.x - p.position.x,
    dz = position.z - p.position.z,
    range = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz) - p.yaw;
  const horizontal = Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw)));
  const vertical =
    Math.atan2(
      position.y +
        1.1 -
        p.position.y -
        (p.stance === "prone" ? 0.48 : p.stance === "crouch" ? 1.06 : 1.68),
      range,
    ) + p.pitch;
  const halfVertical = (ctx.viewFov * Math.PI) / 360 + 0.12;
  const halfHorizontal =
    Math.atan(Math.tan((ctx.viewFov * Math.PI) / 360) * ctx.viewAspect) + 0.16;
  return horizontal < halfHorizontal && Math.abs(vertical) < halfVertical;
}
export function canSpawnAt(
  ctx: SimContext,
  position: Vec3,
  minDistance = 28,
): boolean {
  const p = ctx.state.player;
  if (
    distance(p.position, position) < minDistance ||
    ctx.gen.isWater(position.x, position.z) ||
    ctx.collision.blocked(position.x, position.y, position.z, 0.38, 1.7)
  )
    return false;
  if (
    Object.values(ctx.state.actors).some(
      (a) => a.health > 0 && distance(a.position, position) < 1.15,
    )
  )
    return false;
  const eye = {
    ...p.position,
    y:
      p.position.y +
      (p.stance === "prone" ? 0.48 : p.stance === "crouch" ? 1.06 : 1.68),
  };
  if (
    insidePlayerView(ctx, position) &&
    ctx.collision.visible(eye, { ...position, y: position.y + 1.1 })
  )
    return false;
  return true;
}
export function spawnHidden(
  ctx: SimContext,
  id: string,
  kind: EnemyKind,
  candidates: Vec3[],
): ActorData | null {
  if (ctx.state.actors[id]) return normalizeActor(ctx.state.actors[id]!);
  for (const position of candidates) {
    if (!canSpawnAt(ctx, position)) continue;
    const actor = spawnActor(ctx, id, kind, position),
      rng = random(id + ":posture");
    const indoors = ctx.gen.pois.some(
      (p) =>
        Math.abs(position.x - p.x) < p.width / 2 - 0.5 &&
        Math.abs(position.z - p.z) < p.depth / 2 - 0.5,
    );
    actor.behavior = ENEMIES[kind].animal
      ? "patrol"
      : indoors
        ? choose(rng, ["standing", "sitting", "lying", "feeding"] as const)
        : choose(rng, ["standing", "twitch", "patrol"] as const);
    if (ctx.state.time > 20 && actor.behavior === "lying")
      actor.behavior = "patrol";
    return actor;
  }
  return null;
}
export function spawnActor(
  ctx: SimContext,
  id: string,
  kind: EnemyKind,
  position: Vec3,
): ActorData {
  if (ctx.state.actors[id]) return normalizeActor(ctx.state.actors[id]!);
  const rng = random(ctx.state.seed + id);
  const actor: ActorData = {
    id,
    kind,
    position: { ...position },
    home: { ...position },
    yaw: rng() * Math.PI * 2,
    health: ENEMIES[kind].health,
    state: "idle",
    target: { ...position },
    timer: 2 + rng() * 4,
    cooldown: 0,
    lastSeen: 0,
    harvested: false,
    phase: rng() * 100,
    behavior: "standing",
    stateAge: 0,
    speed: 0,
    verticalVelocity: 0,
    gaitPhase: rng() * Math.PI * 2,
    awareness: 0,
    legDamage: 0,
    armDamage: 0,
    deathStyle: Math.floor(rng() * 4),
    deathTime: 0,
    attack: null,
    reaction: null,
    traversal: null,
  };
  actor.behavior = [
    "standing",
    "feeding",
    "sitting",
    "lying",
    "wallLean",
    "twitch",
    "patrol",
  ][Math.floor(rng() * 7)] as ActorData["behavior"];
  ctx.state.actors[id] = actor;
  return actor;
}
export function populate(ctx: SimContext): void {
  const { state, gen } = ctx,
    p = state.player.position;
  const pacing = updateDirectorPacing(ctx);
  for (const poi of gen.pois) {
    if (poi.kind === "extraction") continue;
    const y = gen.poiHeight(poi);
    for (let n = 0; n < 3; n++) {
      const id = poi.id + ":" + n;
      if (!state.containers[id])
        state.containers[id] = {
          id,
          name: containerLabel(poi.kind, n),
          type: poi.kind,
          position: {
            x:
              poi.x +
              (n === 0
                ? -poi.width / 2 + 1.6
                : n === 1
                  ? poi.width / 2 - 1.7
                  : 1),
            y: y + 0.5,
            z: poi.z + (n === 2 ? -2 : poi.depth / 2 - 1.5),
          },
          inventory: generateLoot(
            state.seed,
            id,
            poi.kind,
            poi.danger,
            state.rules.lootAmount,
          ),
          searched: false,
          openedAt: 0,
        };
    }
    if (poi.region === "city")
      for (let n = 0; n < 3; n++) {
        const c = state.containers[poi.id + ":" + n];
        if (c) c.position.y = y + 0.5;
      }
    if (Math.hypot(poi.x - p.x, poi.z - p.z) > 370) continue;
    const rng = random(state.seed + ":actors:" + poi.id);
    const count =
      state.rules.enemyDensity === 0
        ? 0
        : poi.id === "pine-0"
          ? 1
          : Math.max(
              1,
              Math.round(Math.min(4, poi.danger) * state.rules.enemyDensity),
            );
    for (let n = 0; n < count; n++) {
      const actorId = poi.id + ":enemy:" + n;
      // Persistent residents stay; fresh pressure waits through recovery and a hard local budget.
      if (
        !state.actors[actorId] &&
        (pacing.phase === "recovery" ||
          Object.values(state.actors).filter(
            (a) =>
              a.health > 0 &&
              !ENEMIES[a.kind].animal &&
              distance(a.position, p) < 180,
          ).length >= 22)
      )
        continue;
      let kind: EnemyKind = choose(
        rng,
        poi.danger >= 4
          ? ["armored", "raider", "bloated", "stalker", "runner"]
          : ["walker", "walker", "runner"],
      );
      if (poi.id === "pine-0") kind = "walker";
      const x = poi.x + 18 + n * 4,
        z = poi.z + 18 + rng() * 7;
      spawnHidden(ctx, actorId, kind, [
        gen.position(x, z),
        {
          x: poi.x - poi.width * 0.25,
          y,
          z: poi.z - poi.depth * 0.15 + n * 0.8,
        },
        { x: poi.x + poi.width * 0.22, y, z: poi.z + poi.depth * 0.22 },
        gen.position(
          poi.x - poi.width / 2 - 4 - n * 2,
          poi.z + poi.depth / 2 + 4,
        ),
      ]);
    }
    const vid = poi.id + ":vehicle";
    if (
      poi.kind === "industrial" &&
      !state.vehicles.some((v) => v.id === vid)
    ) {
      state.vehicles.push({
        id: vid,
        kind: "suv",
        position: gen.position(poi.x + poi.width / 2 + 6, poi.z - 5),
        yaw: Math.PI * 0.5,
        speed: 0,
        fuel: 5,
        health: 50,
        battery: 0,
        tires: 2,
        engine: 50,
        inventory: generateLoot(state.seed, vid, "industrial", 2),
      });
    }
  }
  for (const [cid, item] of Object.entries(UNIQUE_POI_LOOT)) {
    const flag = "unique-loot:" + cid,
      container = state.containers[cid];
    if (!container || state.flags.includes(flag)) continue;
    if (
      container.searched ||
      countItem(container.inventory, item) > 0 ||
      addItem(container.inventory, item)
    )
      state.flags.push(flag);
  }
  if (!state.vehicles.some((v) => v.id === "starter-pickup"))
    state.vehicles.push({
      id: "starter-pickup",
      kind: "pickup",
      position: gen.position(-24, 4),
      yaw: 0.22,
      speed: 0,
      fuel: 16,
      health: 68,
      battery: 70,
      tires: 4,
      engine: 70,
      inventory: newInventory(8, 5),
    });
  const cx = Math.floor(p.x / 128),
    cz = Math.floor(p.z / 128);
  for (let x = cx - 1; x <= cx + 1; x++)
    for (let z = cz - 1; z <= cz + 1; z++) {
      const rng = random(state.seed + ":fauna:" + x + "," + z);
      for (let n = 0; n < 2; n++) {
        const ax = x * 128 + 25 + rng() * 80,
          az = z * 128 + 25 + rng() * 80;
        if (gen.isClearing(ax, az) || gen.isWater(ax, az)) continue;
        const kind = choose(rng, ["deer", "deer", "boar", "wolf"] as const);
        if (
          pacing.phase === "recovery" &&
          kind !== "deer" &&
          !state.actors[`fauna:${x},${z}:${n}`]
        )
          continue;
        spawnHidden(ctx, `fauna:${x},${z}:${n}`, kind, [
          gen.position(ax, az),
          gen.position(ax + 14, az + 18),
          gen.position(ax - 15, az - 14),
        ]);
      }
    }
  if (
    !state.flags.includes("starter-camp-generated") &&
    !state.structures.some((s) => s.id === "ranger-fire")
  )
    state.structures.push({
      id: "ranger-fire",
      kind: "campfire",
      position: gen.position(22, 1),
      rotation: 0,
      health: 100,
      fuel: 40,
      active: false,
      growth: 0,
      plantedAt: 0,
    });
  if (
    !state.flags.includes("starter-camp-generated") &&
    !state.structures.some((s) => s.id === "ranger-bench")
  )
    state.structures.push({
      id: "ranger-bench",
      kind: "workbench",
      position: gen.position(10, 14),
      rotation: Math.PI / 2,
      health: 100,
      fuel: 0,
      active: false,
      growth: 0,
      plantedAt: 0,
    });
  if (!state.flags.includes("starter-camp-generated"))
    state.flags.push("starter-camp-generated");
  // Searching a container is permanent. New rewards require a new, finite event site.
}

export type DirectorPacing = NonNullable<
  SimContext["state"]["director"]["pacing"]
>;
const directorListeners = new WeakSet<SimContext>();
/** One snapshot per simulation second, persisted so reloading cannot reset a peak or recovery. */
export function updateDirectorPacing(ctx: SimContext): DirectorPacing {
  const s = ctx.state,
    d = s.director,
    p = s.player,
    now = s.elapsed;
  if (!directorListeners.has(ctx)) {
    directorListeners.add(ctx);
    ctx.bus.on((event) => {
      if (event.type !== "shot" && event.type !== "damage") return;
      const director = ctx.state.director;
      director.lastCombat = ctx.state.elapsed;
      if (event.type === "shot")
        director.tension = clamp(
          director.tension +
            (event.kind === "explosion" ? 10 : event.kind === "melee" ? 2 : 4),
        );
      if (director.pacing)
        director.pacing.highestIntensity = Math.max(
          director.pacing.highestIntensity,
          director.tension / 100,
        );
    });
  }
  const pacing = (d.pacing ??= {
    phase: "calm",
    phaseSince: now,
    peakUntil: 0,
    lastSample: now,
    lastHealth: p.stats.health,
    lastKills: p.kills,
    resourcePressure: 0,
    locationDanger: 0,
    eventCooldownUntil: 0,
    highestIntensity: d.tension / 100,
    recentKinds: [],
  });
  const dt = clamp(now - pacing.lastSample, 0, 5);
  const nearest = ctx.gen.pois.reduce((a, b) =>
    distance(p.position, { x: a.x, y: 0, z: a.z }) <
    distance(p.position, { x: b.x, y: 0, z: b.z })
      ? a
      : b,
  );
  pacing.locationDanger =
    distance(p.position, { x: nearest.x, y: 0, z: nearest.z }) < 180
      ? clamp((nearest.danger - 1) / 4, 0, 1)
      : 0.1;
  const weapon = p.inventory.items.find(
      (i) => i.uid === p.quickSlots[p.selected],
    ),
    ammo = weapon && ITEMS[weapon.id]?.weapon?.ammo;
  const ammunition = ammo
    ? countItem(p.inventory, ammo) + (weapon?.ammo ?? 0)
    : 18;
  const food = p.inventory.items.some((i) => ITEMS[i.id]?.category === "food"),
    water = p.inventory.items.some((i) => ITEMS[i.id]?.category === "drink");
  pacing.resourcePressure = clamp(
    Math.max(0, 50 - p.stats.health) / 65 +
      Math.max(0, 40 - p.stats.hydration) / 85 +
      Math.max(0, 35 - p.stats.energy) / 90 +
      (food ? 0 : 0.1) +
      (water ? 0 : 0.1) +
      (ammunition < 6 ? 0.2 : 0),
    0,
    1,
  );
  const engaged = Object.values(s.actors).filter(
    (a) =>
      a.health > 0 &&
      a.kind !== "deer" &&
      ["chase", "attack", "windup", "recover"].includes(a.state) &&
      Math.hypot(
        a.position.x - p.position.x,
        a.position.y - p.position.y,
        a.position.z - p.position.z,
      ) < 45,
  ).length;
  const battleNoise = ctx.noises.some(
    (n) =>
      ["gunshot", "enemyshot", "explosion"].includes(n.kind) &&
      distance(n.position, p.position) < 130,
  );
  const otherNoise = ctx.noises.some(
    (n) => n.radius > 30 && distance(n.position, p.position) < 60,
  );
  const damage = Math.max(0, pacing.lastHealth - p.stats.health),
    kills = Math.max(0, p.kills - pacing.lastKills);
  if (battleNoise || engaged > 0 || damage > 0.5 || kills > 0)
    d.lastCombat = now;
  const recentCombat = now - d.lastCombat < 14;
  const target = clamp(
    engaged * 20 +
      (battleNoise ? 34 : recentCombat ? 24 : 0) +
      (otherNoise ? 10 : 0) +
      pacing.locationDanger * 16 +
      (["storm", "fog"].includes(s.weather) ? 5 : 0) +
      (s.time < 6 || s.time > 20 ? 7 : 0) +
      pacing.resourcePressure * 8,
  );
  if (dt > 0) {
    const rate =
      target > d.tension
        ? 5 + engaged * 5 + (battleNoise ? 5 : 0)
        : pacing.phase === "recovery"
          ? 3
          : 1.8;
    d.tension +=
      Math.sign(target - d.tension) *
      Math.min(Math.abs(target - d.tension), rate * dt);
    d.tension = clamp(d.tension + Math.min(18, damage * 0.7 + kills * 2));
  }
  pacing.highestIntensity = Math.max(pacing.highestIntensity, d.tension / 100);
  const phase = (next: DirectorPacing["phase"]) => {
    if (pacing.phase !== next) {
      pacing.phase = next;
      pacing.phaseSince = now;
    }
  };
  if (p.stats.health < 28 || pacing.resourcePressure > 0.8) {
    d.recoveryUntil = Math.max(d.recoveryUntil, now + 75);
    pacing.eventCooldownUntil = Math.max(pacing.eventCooldownUntil, now + 18);
    phase("recovery");
  } else if (pacing.phase === "peak" && now >= pacing.peakUntil) {
    d.recoveryUntil = Math.max(
      d.recoveryUntil,
      now + 85 + pacing.resourcePressure * 45,
    );
    pacing.eventCooldownUntil = d.recoveryUntil;
    phase("recovery");
  } else if (now < d.recoveryUntil) phase("recovery");
  else if (pacing.phase === "recovery") {
    pacing.eventCooldownUntil = Math.max(pacing.eventCooldownUntil, now + 35);
    phase(d.tension > 24 ? "rising" : "calm");
  } else if (
    d.tension >= 65 &&
    now >= pacing.eventCooldownUntil &&
    pacing.phase !== "peak"
  ) {
    pacing.peakUntil = now + 26;
    phase("peak");
  } else if (pacing.phase !== "peak")
    phase(d.tension >= 22 || pacing.locationDanger > 0.65 ? "rising" : "calm");
  pacing.lastSample = now;
  pacing.lastHealth = p.stats.health;
  pacing.lastKills = p.kills;
  return pacing;
}

export type DirectorEventKind =
  | AuthoredEventKind
  | "airdrop"
  | "migration"
  | "raidercamp"
  | "wildfire"
  | "gas"
  | "storm";
/** Weighted choice exposes a deterministic seam for tests without granting event completion. */
export function chooseDirectorEvent(
  ctx: SimContext,
  roll: number,
): DirectorEventKind {
  const s = ctx.state,
    p = updateDirectorPacing(ctx);
  let entries: [DirectorEventKind, number][] =
    p.phase === "recovery"
      ? [
          ["airdrop", 8],
          ["storm", 0.15],
        ]
      : p.phase === "peak"
        ? [
            ["migration", 5],
            ["raidercamp", p.locationDanger > 0.55 ? 2 : 0.2],
            ["gas", 1],
          ]
        : p.phase === "rising"
          ? [
              ["convoy", 4],
              ["rescue", 3],
              ["migration", 2],
              ["wildfire", 1],
              ["airdrop", p.resourcePressure > 0.4 ? 3 : 0.8],
            ]
          : [
              ["rescue", 5],
              ["convoy", 2],
              ["airdrop", p.resourcePressure > 0.35 ? 4 : 2],
              ["storm", 0.2],
            ];
  // A once-per-world rare event: sustained exploration is required, not just a lucky opening roll.
  const rareReady =
    s.elapsed >= 900 &&
    new Set(s.discovered.filter((id) => ctx.gen.pois.some((p) => p.id === id)))
      .size >= 10 &&
    !s.flags.includes("rare-wreck-created") &&
    p.phase !== "peak" &&
    p.phase !== "recovery";
  if (rareReady) entries = [["wreck", 0.38], ...entries];
  const recent = p.recentKinds.slice(-2);
  entries = entries.map(([kind, weight]) => [
    kind,
    weight * (recent.includes(kind) ? 0.12 : 1),
  ]);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = clamp(roll, 0, 0.999999) * total;
  for (const [kind, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return kind;
  }
  return entries[entries.length - 1]![0];
}

export function findEventLocation(
  ctx: SimContext,
  kind: DirectorEventKind,
): EventLocation | null {
  const p = ctx.state.player.position;
  const regions =
    kind === "convoy"
      ? ["pine", "city", "industry", "fort"]
      : kind === "wreck"
        ? ["mine", "industry", "lab", "fort"]
        : ["pine", "city", "lake", "mine", "industry", "fort"];
  const pois = ctx.gen.pois.filter(
    (poi) =>
      regions.includes(poi.region) &&
      !["extraction", "radio"].includes(poi.kind) &&
      Math.hypot(poi.x - p.x, poi.z - p.z) < 420 &&
      !eventSiteUsed(ctx, kind, poi.id),
  );
  const rng = random(
    `${ctx.state.seed}:event-location:${ctx.state.director.encounters}:${kind}`,
  );
  const shuffled = pois
    .map((poi) => ({ poi, order: rng() }))
    .sort((a, b) => a.order - b.order);
  for (const { poi } of shuffled)
    for (const [x, z] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const position = ctx.gen.position(
        poi.x + x! * (poi.width / 2 + 17),
        poi.z + z! * (poi.depth / 2 + 16),
      );
      if (eventLayoutFits(ctx, kind, position))
        return { poiId: poi.id, position };
    }
  return null;
}

export function director(ctx: SimContext): void {
  const s = ctx.state,
    pacing = updateDirectorPacing(ctx);
  updateWorldEvents(ctx);
  if (
    s.elapsed < s.nextEvent ||
    s.player.stats.health <= 0 ||
    s.narrative.activeSequence ||
    s.player.position.y <
      ctx.gen.height(s.player.position.x, s.player.position.z) - 3
  )
    return;
  const active = s.events.filter((e) => !e.resolved && e.expires > s.elapsed);
  if (
    active.length >= 3 ||
    (pacing.phase !== "recovery" && s.elapsed < pacing.eventCooldownUntil)
  ) {
    s.nextEvent = s.elapsed + 15;
    return;
  }
  const rng = random(
      `${s.seed}:director-v2:${s.director.encounters}:${Math.floor(s.elapsed / 30)}`,
    ),
    kind = chooseDirectorEvent(ctx, rng());
  if (
    pacing.phase === "peak" &&
    active.some((e) => ["migration", "raidercamp", "convoy"].includes(e.kind))
  ) {
    s.nextEvent = s.elapsed + 25;
    return;
  }
  const location = findEventLocation(ctx, kind);
  if (!location) {
    s.nextEvent = s.elapsed + 25;
    return;
  }
  let created = false;
  if (["rescue", "convoy", "wreck"].includes(kind))
    created = !!createWorldEvent(
      ctx,
      kind as AuthoredEventKind,
      location,
      spawnHidden,
      s.director.tension / 100,
    );
  else {
    const id = ctx.nextId("event"),
      position = location.position;
    const names: Record<string, string> = {
      airdrop: "遗落的医疗补给",
      migration: "感染群穿行",
      raidercamp: "掠夺者侦察队",
      wildfire: "林间火情",
      gas: "破裂的化学运输罐",
      storm: "山口雷暴锋面",
    };
    s.events.push({
      id,
      kind,
      name: names[kind]!,
      position,
      start: s.elapsed,
      expires: s.elapsed + 480,
      resolved: false,
    });
    if (kind === "airdrop") {
      const inventory = newInventory(6, 4);
      for (const [item, n] of Object.entries({
        water: 2,
        beans: 2,
        bandage: 2,
      }))
        addItem(inventory, item, n);
      s.containers[id] = {
        id,
        name: names[kind]!,
        type: "event",
        position: { ...position, y: position.y + 0.4 },
        inventory,
        searched: false,
        openedAt: 0,
      };
    }
    if (["migration", "raidercamp"].includes(kind)) {
      const nearby = Object.values(s.actors).filter(
        (a) =>
          a.health > 0 &&
          !ENEMIES[a.kind].animal &&
          distance(a.position, s.player.position) < 180,
      ).length;
      for (let n = 0; n < Math.max(0, Math.min(4, 22 - nearby)); n++) {
        const actor = spawnHidden(
          ctx,
          `${id}:guard:${n}`,
          kind === "raidercamp" ? "raider" : "walker",
          [
            ctx.gen.position(position.x + n * 3, position.z + n * 2),
            ctx.gen.position(position.x - 12 - n * 2, position.z + 16),
          ],
        );
        if (actor) {
          actor.state = "investigate";
          actor.target = ctx.gen.position(position.x + 70, position.z + 90);
          actor.timer = 100;
        }
      }
    }
    if (kind === "storm") {
      s.weather = "storm";
      s.nextWeather = s.elapsed + 160;
    }
    s.flags.push(`event-site:${kind}:${location.poiId}`);
    ctx.notify(`${names[kind]}，位置已标到地图。`);
    ctx.bus.emit({ type: "sound", text: "radio", kind: "radio", position });
    created = true;
  }
  if (!created) {
    s.nextEvent = s.elapsed + 25;
    return;
  }
  s.director.encounters++;
  s.director.lastEvent = s.elapsed;
  pacing.recentKinds = [...pacing.recentKinds, kind].slice(-5);
  const cooldown =
    pacing.phase === "peak"
      ? 110
      : pacing.phase === "recovery"
        ? 150
        : 180 + rng() * 110;
  pacing.eventCooldownUntil = Math.max(
    pacing.eventCooldownUntil,
    s.elapsed + cooldown,
  );
  s.nextEvent = s.elapsed + cooldown;
  // Remove only old scene records. Site/reward ledgers, persistent actors and vehicles are retained.
  s.events = s.events
    .filter((e) => !e.resolved || e.expires + 180 > s.elapsed)
    .slice(-32);
}
