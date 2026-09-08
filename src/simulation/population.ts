import { choose, random } from "../core/random";
import {
  distance,
  type ActorData,
  type EnemyKind,
  type Vec3,
} from "../core/types";
import { ENEMIES } from "../data/enemies";
import { generateLoot, CONTAINER_TYPES } from "../data/loot";
import { addItem, newInventory } from "./inventory";
import type { SimContext } from "./context";
export function spawnActor(
  ctx: SimContext,
  id: string,
  kind: EnemyKind,
  position: Vec3,
): ActorData {
  if (ctx.state.actors[id]) return ctx.state.actors[id]!;
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
  };
  ctx.state.actors[id] = actor;
  return actor;
}
export function populate(ctx: SimContext): void {
  const { state, gen } = ctx,
    p = state.player.position;
  for (const poi of gen.pois) {
    if (poi.kind === "extraction") continue;
    const y = gen.poiHeight(poi);
    for (let n = 0; n < 3; n++) {
      const id = poi.id + ":" + n;
      if (!state.containers[id])
        state.containers[id] = {
          id,
          name: CONTAINER_TYPES[
            (gen.pois.indexOf(poi) * 3 + n) % CONTAINER_TYPES.length
          ]!,
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
      poi.id === "pine-0"
        ? 1
        : Math.max(
            1,
            Math.round(Math.min(4, poi.danger) * state.rules.enemyDensity),
          );
    for (let n = 0; n < count; n++) {
      let kind: EnemyKind = choose(
        rng,
        poi.danger >= 4
          ? ["armored", "raider", "bloated", "stalker", "runner"]
          : ["walker", "walker", "runner"],
      );
      if (poi.id === "pine-0") kind = "walker";
      const x = poi.x + 18 + n * 4,
        z = poi.z + 18 + rng() * 7;
      spawnActor(ctx, poi.id + ":enemy:" + n, kind, gen.position(x, z));
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
        spawnActor(ctx, `fauna:${x},${z}:${n}`, kind, gen.position(ax, az));
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
  for (const [id, c] of Object.entries(state.containers)) {
    if (!c.searched || c.type === "dropped" || c.type === "storage") continue;
    const away = distance(p, c.position) > 360;
    if (
      away &&
      state.elapsed - c.openedAt > 3600 &&
      c.inventory.items.length === 0
    ) {
      c.inventory = generateLoot(state.seed + ":" + state.day, id, c.type, 1);
      c.searched = false;
      c.openedAt = state.elapsed;
    }
  }
}
export function director(ctx: SimContext): void {
  const s = ctx.state;
  if (s.elapsed < s.nextEvent) return;
  s.nextEvent =
    s.elapsed + 220 + random(s.seed + ":event:" + s.events.length)() * 160;
  if (s.player.stats.health < 30) {
    ctx.notify("远方传来断续的求救频段。先处理你的伤势。");
    return;
  }
  const rng = random(s.seed + ":director:" + s.events.length);
  const angle = rng() * Math.PI * 2;
  const x = s.player.position.x + Math.sin(angle) * 160,
    z = s.player.position.z + Math.cos(angle) * 160;
  if (ctx.gen.isWater(x, z) || Math.abs(x) > 1800 || Math.abs(z) > 1800) return;
  const entries = [
    ["airdrop", "坠落补给"],
    ["convoy", "废弃车队"],
    ["rescue", "幸存者求救"],
    ["migration", "感染群迁徙"],
    ["raidercamp", "掠夺者营火"],
    ["wildfire", "林间火情"],
    ["gas", "化学气体泄漏"],
    ["storm", "雷暴锋面"],
    ["wreck", "飞机残骸"],
  ] as const;
  const [kind, name] = choose(rng, entries);
  const id = ctx.nextId("event"),
    position = ctx.gen.position(x, z);
  s.events = s.events
    .filter((e) => e.expires > s.elapsed || !e.resolved)
    .slice(-15);
  s.events.push({
    id,
    kind,
    name,
    position,
    start: s.elapsed,
    expires: s.elapsed + 600,
    resolved: false,
  });
  if (["airdrop", "convoy", "wreck", "rescue"].includes(kind)) {
    const inv = generateLoot(
      s.seed,
      id,
      kind === "rescue" ? "medical" : "military",
      3,
    );
    addItem(inv, "fuel", 2);
    s.containers[id] = {
      id,
      name,
      type: "event",
      position: { ...position, y: position.y + 0.6 },
      inventory: inv,
      searched: false,
      openedAt: 0,
    };
  }
  if (["migration", "raidercamp"].includes(kind))
    for (let n = 0; n < 4; n++) {
      const actor = spawnActor(
        ctx,
        id + ":" + n,
        kind === "raidercamp" ? "raider" : "walker",
        ctx.gen.position(x + n * 3, z + n * 2),
      );
      if (kind === "migration") {
        actor.state = "investigate";
        actor.target = ctx.gen.position(x + 120, z + 90);
        actor.timer = 140;
      }
    }
  if (kind === "storm") {
    s.weather = "storm";
    s.nextWeather = s.elapsed + 180;
  }
  ctx.notify(`无线电：${name}。大致位置已记入地图。`);
  ctx.bus.emit({ type: "sound", text: "radio", kind: "radio", position });
}
