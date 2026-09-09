import {
  clamp,
  type ActorData,
  type Collider,
  type EnemyKind,
  type Interaction,
  type Vec3,
  type WorldEvent,
} from "../core/types";
import { ITEMS } from "../data/items";
import { addItem, countItem, newInventory, removeItem } from "./inventory";
import type { SimContext } from "./context";

export type AuthoredEventKind = "rescue" | "convoy" | "wreck";
export type HiddenSpawner = (
  ctx: SimContext,
  id: string,
  kind: EnemyKind,
  candidates: Vec3[],
) => ActorData | null;
export interface EventLocation {
  poiId: string;
  position: Vec3;
}
export interface EventEntity {
  id: string;
  model:
    | "survivor"
    | "cargo"
    | "drone-wreck"
    | "warning-beacon"
    | "smoke"
    | "sparks"
    | "vehicle";
  position: Vec3;
  rotation: number;
  state:
    | "wounded"
    | "walking"
    | "waiting"
    | "dead"
    | "locked"
    | "open"
    | "active"
    | "inactive"
    | "damaged";
  name?: string;
  vehicleId?: string;
  dimensions?: Vec3;
}
export interface WorldEventScene {
  id: string;
  kind: AuthoredEventKind;
  title: string;
  description: string;
  outcome: NonNullable<WorldEvent["encounter"]>["outcome"];
  stage: number;
  sourceAnchor: { poiId: string; offset: Vec3 };
  entities: EventEntity[];
  colliders: Collider[];
}
export const WORLD_EVENT_DEFINITIONS = {
  rescue: {
    name: "岔路求救 · 还有一个人",
    seconds: 720,
    reward: { firstaid: 1, antibiotics: 1, electronics: 2 },
    stages: [
      "驱离附近感染者，给受伤的季砚一卷绷带和一瓶水",
      "护送季砚到路边安全点；保持在他附近",
      "在安全点与季砚交谈，取得他保住的医药与元件",
    ],
    description:
      "运输队的季砚受伤困在路边。他的物资袋还在，但他更需要活着到达背风处。",
  },
  convoy: {
    name: "停摆车队 · 响个不停的警报",
    seconds: 840,
    reward: { parts: 3, fuel: 2, ammo9: 24 },
    stages: [
      "用扳手和一个电子元件关闭警报，或用撬棍强开货舱",
      "驱离货舱周围威胁，解开车队机械锁",
      "领取车队补给并恢复前车行驶能力",
    ],
    description:
      "两辆车堵在路边，备用警报仍在吸引感染者。静默维修花材料，强行拆开则会暴露你的位置。",
  },
  wreck: {
    name: "罕见信号 · 军用无人机残骸",
    seconds: 1080,
    reward: { scope: 1, plate: 1, ammo556: 30 },
    stages: [
      "用扳手和两份废金属为故障电池接地",
      "用两个电子元件恢复黑匣子的校验线路",
      "下载军用航线，取走封存设备",
    ],
    description:
      "无人机机翼折在树旁，故障电池仍在放电。黑匣子记录了一条由矿场通往第七研究站的隐蔽补给航线。",
  },
} as const;

function authored(event: WorldEvent): event is WorldEvent & {
  encounter: NonNullable<WorldEvent["encounter"]>;
  kind: AuthoredEventKind;
} {
  return (
    event.encounter?.version === 1 &&
    Object.hasOwn(WORLD_EVENT_DEFINITIONS, event.kind)
  );
}
function point(ctx: SimContext, event: WorldEvent, x = 0, z = 0, y = 0): Vec3 {
  const px = event.position.x + x,
    pz = event.position.z + z;
  return { x: px, y: ctx.gen.height(px, pz) + y, z: pz };
}
const spatial = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const flag = (ctx: SimContext, value: string) => {
  if (!ctx.state.flags.includes(value)) ctx.state.flags.push(value);
};
export function eventHostiles(
  ctx: SimContext,
  event: WorldEvent,
  radius = 24,
): ActorData[] {
  return Object.values(ctx.state.actors).filter(
    (a) =>
      a.health > 0 &&
      a.kind !== "deer" &&
      (a.kind !== "boar" || a.state === "attack" || a.state === "chase") &&
      spatial(a.position, event.position) < radius,
  );
}
export function eventSiteUsed(
  ctx: SimContext,
  kind: string,
  poiId: string,
): boolean {
  return ctx.state.flags.includes(`event-site:${kind}:${poiId}`);
}
export function hiddenEventSite(ctx: SimContext, position: Vec3): boolean {
  const player = ctx.state.player,
    p = player.position;
  if (
    spatial(p, position) < 85 ||
    spatial(player.spawn, position) < 65 ||
    Math.abs(position.x) > 1850 ||
    Math.abs(position.z) > 1850 ||
    ctx.gen.isWater(position.x, position.z)
  )
    return false;
  if (
    ctx.state.structures.some(
      (b) =>
        b.health > 0 &&
        ["bed", "campfire"].includes(b.kind) &&
        spatial(b.position, position) < 40,
    )
  )
    return false;
  const eye = {
    ...p,
    y:
      p.y +
      (player.stance === "prone"
        ? 0.48
        : player.stance === "crouch"
          ? 1.06
          : 1.68),
  };
  const halfV = (ctx.viewFov * Math.PI) / 360 + 0.12,
    halfH =
      Math.atan(Math.tan((ctx.viewFov * Math.PI) / 360) * ctx.viewAspect) +
      0.16;
  for (const [x, z, y] of [
    [0, 0, 1.3],
    [-5, 0, 1.3],
    [8, 0, 1.3],
    [0, -5, 1.3],
    [0, 5, 3],
  ]) {
    const target = {
        x: position.x + x!,
        y: position.y + y!,
        z: position.z + z!,
      },
      dx = target.x - eye.x,
      dz = target.z - eye.z;
    const yaw = Math.atan2(dx, dz) - player.yaw,
      h = Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw))),
      v = Math.atan2(target.y - eye.y, Math.hypot(dx, dz)) + player.pitch;
    if (h < halfH && Math.abs(v) < halfV && ctx.collision.visible(eye, target))
      return false;
    if (ctx.collision.blocked(target.x, position.y, target.z, 0.65, 2))
      return false;
    if (Math.abs(ctx.gen.height(target.x, target.z) - position.y) > 1.8)
      return false;
  }
  return true;
}
export function eventLayoutFits(
  ctx: SimContext,
  kind: string,
  position: Vec3,
): boolean {
  if (!hiddenEventSite(ctx, position)) return false;
  const clear = (x: number, z: number, radius = 0.4) => {
    const p = ctx.gen.position(position.x + x, position.z + z);
    return (
      !ctx.gen.isWater(p.x, p.z) &&
      !ctx.collision.blocked(p.x, p.y, p.z, radius, 1.8) &&
      Math.abs(p.y - position.y) < 1.8
    );
  };
  if (kind === "rescue")
    for (let n = 0; n <= 12; n++)
      if (!clear((n / 12) * 11, (-n / 12) * 7)) return false;
  if (kind === "convoy")
    for (const [cx, cz] of [
      [-3, 0],
      [6, 2],
    ])
      for (const x of [-1.1, 0, 1.1])
        for (const z of [-2.4, 0, 2.4])
          if (!clear(cx! + x, cz! + z, 0.45)) return false;
  if (kind === "convoy" && (!clear(0, -4, 1) || !clear(0, -5.1))) return false;
  return true;
}

/** Called only after the director has checked the location itself is hidden. The spawner rechecks every actor. */
export function createWorldEvent(
  ctx: SimContext,
  kind: AuthoredEventKind,
  location: EventLocation,
  spawn: HiddenSpawner,
  intensity = 0.5,
): WorldEvent | null {
  if (
    !ctx.gen.pois.some((p) => p.id === location.poiId) ||
    !eventLayoutFits(ctx, kind, location.position)
  )
    return null;
  if (eventSiteUsed(ctx, kind, location.poiId)) return null;
  if (kind === "wreck" && ctx.state.flags.includes("rare-wreck-created"))
    return null;
  if (
    kind === "wreck" &&
    (ctx.state.elapsed < 900 ||
      new Set(
        ctx.state.discovered.filter((id) =>
          ctx.gen.pois.some((p) => p.id === id),
        ),
      ).size < 10)
  )
    return null;
  const definition = WORLD_EVENT_DEFINITIONS[kind],
    id = ctx.nextId("event"),
    now = ctx.state.elapsed;
  const event: WorldEvent = {
    id,
    kind,
    name: definition.name,
    position: { ...location.position },
    start: now,
    expires: now + definition.seconds,
    resolved: false,
    encounter: {
      version: 1,
      stage: 0,
      stageAt: now,
      outcome: "active",
      hostileIds: [],
      survivorHealth: 100,
      lastUpdate: now,
      rewardClaimed: false,
      poiId: location.poiId,
      approach: "none",
    },
  };
  const density = clamp(ctx.state.rules.enemyDensity, 0, 2),
    nearby = Object.values(ctx.state.actors).filter(
      (a) =>
        a.health > 0 &&
        !["deer", "boar", "wolf"].includes(a.kind) &&
        spatial(a.position, ctx.state.player.position) < 180,
    ).length;
  if (density > 0 && nearby >= 22) return null;
  const count =
    density === 0
      ? 0
      : Math.max(
          1,
          Math.min(
            4,
            22 - nearby,
            Math.round(((kind === "convoy" ? 2 : 1) + intensity * 2) * density),
          ),
        );
  for (let n = 0; n < count; n++) {
    const angle = n * 2.399;
    const candidate = Array.from({ length: 5 }, (_, attempt) =>
      point(
        ctx,
        event,
        Math.cos(angle + attempt * 0.7) * (9 + attempt * 2),
        Math.sin(angle + attempt * 0.7) * (9 + attempt * 2),
      ),
    );
    const actor = spawn(
      ctx,
      `${id}:guard:${n}`,
      kind === "wreck" && n === 0 ? "armored" : n === 0 ? "walker" : "runner",
      candidate,
    );
    if (actor) event.encounter!.hostileIds.push(actor.id);
  }
  if (count > 0 && !event.encounter!.hostileIds.length) return null;
  if (kind === "convoy") {
    for (let n = 0; n < 2; n++)
      ctx.state.vehicles.push({
        id: `${id}:vehicle:${n}`,
        kind: n ? "suv" : "pickup",
        position: point(ctx, event, n ? 6 : -3, n ? 2 : 0),
        yaw: 0.16 * (n ? -1 : 1),
        speed: 0,
        fuel: 0,
        health: n ? 20 : 48,
        battery: 0,
        tires: 3,
        engine: n ? 12 : 35,
        inventory: newInventory(8, 5),
      });
  }
  ctx.state.events.push(event);
  flag(ctx, `event-site:${kind}:${location.poiId}`);
  if (kind === "wreck") flag(ctx, "rare-wreck-created");
  ctx.notify(`${definition.name}。${definition.description}地点已标到地图。`);
  ctx.bus.emit({
    type: "sound",
    text: "radio",
    kind: "radio",
    position: event.position,
  });
  return event;
}

function survivorPosition(ctx: SimContext, event: WorldEvent): Vec3 {
  const detail = event.encounter!,
    progress =
      detail.stage > 1
        ? 1
        : detail.stage === 1
          ? clamp((ctx.state.elapsed - detail.stageAt) / 8, 0, 1)
          : 0;
  return point(ctx, event, progress * 11, -progress * 7);
}
function actions(
  ctx: SimContext,
  event: WorldEvent,
): { action: string; title: string; position: Vec3; detail: string }[] {
  if (
    !authored(event) ||
    event.resolved ||
    event.expires <= ctx.state.elapsed ||
    event.encounter.outcome !== "active"
  )
    return [];
  const e = event.encounter;
  if (event.kind === "rescue") {
    if (e.stage === 0)
      return [
        {
          action: "stabilize",
          title: "救治季砚",
          position: point(ctx, event),
          detail: "驱离附近威胁；绷带 ×1、饮用水 ×1",
        },
      ];
    if (e.stage === 2)
      return [
        {
          action: "rescue-reward",
          title: "与季砚确认安全",
          position: survivorPosition(ctx, event),
          detail: "领取医药与电子元件",
        },
      ];
    return [];
  }
  if (event.kind === "convoy") {
    if (e.stage === 0)
      return [
        {
          action: "disable-alarm",
          title: "静默关闭车队警报",
          position: point(ctx, event, -1, 1),
          detail: "需要扳手；消耗电子元件 ×1",
        },
        {
          action: "force-cargo",
          title: "用撬棍强开警报线路",
          position: point(ctx, event, -1, -1),
          detail: "需要撬棍；不消耗元件，但巨响会吸引周围威胁",
        },
      ];
    return [
      {
        action: e.stage === 1 ? "unlock-cargo" : "convoy-reward",
        title: e.stage === 1 ? "解开货舱机械锁" : "取得补给并恢复前车",
        position: point(ctx, event, 0, -5.1),
        detail:
          e.stage === 1
            ? "先驱离货舱周围的威胁"
            : "前车恢复电池、轮胎和燃油，可实际驾驶",
      },
    ];
  }
  return [
    {
      action:
        e.stage === 0
          ? "ground-battery"
          : e.stage === 1
            ? "decode-box"
            : "wreck-reward",
      title:
        e.stage === 0
          ? "隔离残骸故障电池"
          : e.stage === 1
            ? "恢复黑匣子校验线路"
            : "下载军用航线并领取设备",
      position: point(ctx, event, e.stage === 0 ? -3.3 : 3.3, 0),
      detail:
        e.stage === 0
          ? "需要扳手；废金属 ×2"
          : e.stage === 1
            ? "电子元件 ×2；驱离周围威胁"
            : "瞄具、护甲、弹药；解锁矿场至研究站航线标记",
    },
  ];
}
export function worldEventInteractions(ctx: SimContext): Interaction[] {
  return ctx.state.events.flatMap((e) =>
    actions(ctx, e).map(
      (a) =>
        ({
          id: `event:${e.id}:${a.action}`,
          type: e.kind === "rescue" ? "npc" : "story",
          name: a.title,
          position: a.position,
          detail: a.detail,
        }) as Interaction,
    ),
  );
}
function transact(
  ctx: SimContext,
  cost: Record<string, number>,
  reward: Record<string, number>,
): boolean {
  const inventory = structuredClone(ctx.state.player.inventory);
  const missing = Object.entries(cost).filter(
    ([id, n]) => countItem(inventory, id) < n,
  );
  if (missing.length) {
    ctx.notify(
      "还需要：" +
        missing.map(([id, n]) => `${ITEMS[id]!.name} ×${n}`).join("、"),
      "warning",
    );
    return false;
  }
  for (const [id, n] of Object.entries(cost))
    if (!removeItem(inventory, id, n)) return false;
  for (const [id, n] of Object.entries(reward))
    if (!addItem(inventory, id, n)) {
      ctx.notify("背包空间不足。物资尚未消耗，奖励会保留。", "warning");
      return false;
    }
  const p = ctx.state.player;
  p.inventory.items = inventory.items;
  p.quickSlots = p.quickSlots.map((uid) =>
    p.inventory.items.some((i) => i.uid === uid) ? uid : null,
  );
  for (const [slot, uid] of Object.entries(p.equipment))
    if (!p.inventory.items.some((i) => i.uid === uid))
      delete p.equipment[slot as keyof typeof p.equipment];
  return true;
}
function advance(event: WorldEvent, now: number): void {
  event.encounter!.stage++;
  event.encounter!.stageAt = now;
}
function complete(ctx: SimContext, event: WorldEvent): boolean {
  if (!authored(event)) return false;
  const ledger = `event-reward:${event.id}`;
  if (event.encounter.rewardClaimed || ctx.state.flags.includes(ledger))
    return false;
  if (!transact(ctx, {}, WORLD_EVENT_DEFINITIONS[event.kind].reward))
    return false;
  event.encounter.rewardClaimed = true;
  event.encounter.outcome = "success";
  event.resolved = true;
  flag(ctx, ledger);
  flag(ctx, `event-complete:${event.kind}`);
  if (event.kind === "convoy") {
    const vehicle = ctx.state.vehicles.find(
      (v) => v.id === `${event.id}:vehicle:0`,
    );
    if (vehicle) {
      vehicle.health = Math.max(vehicle.health, 68);
      vehicle.engine = 70;
      vehicle.tires = 4;
      vehicle.battery = 65;
      vehicle.fuel = 18;
    }
  }
  if (event.kind === "wreck") {
    flag(ctx, "route:military-airway");
    const target = ctx.gen.pois.find((p) => p.id === "lab-0");
    if (target)
      ctx.state.waypoint = {
        x: target.x,
        y: ctx.gen.poiHeight(target),
        z: target.z,
      };
  }
  ctx.state.director.recoveryUntil = Math.max(
    ctx.state.director.recoveryUntil,
    ctx.state.elapsed + 60,
  );
  ctx.notify(
    event.kind === "rescue"
      ? "季砚已安全。医药与元件已交付，幸存者记住了你的援手。"
      : event.kind === "convoy"
        ? "车队补给已取得，前面的皮卡已恢复行驶能力。"
        : "黑匣子航线已保存，封存设备已领取。研究站位置已标记。",
    "success",
  );
  return true;
}

/** An action must exist at this stage and be physically reachable. No UI-only stage completion. */
export function interactWorldEvent(ctx: SimContext, id: string): boolean {
  if (!id.startsWith("event:")) return false;
  const event = ctx.state.events.find((e) => id.startsWith(`event:${e.id}:`));
  if (!event || !authored(event)) return false;
  const candidate = actions(ctx, event).find(
    (a) => id === `event:${event.id}:${a.action}`,
  );
  if (!candidate || ctx.state.player.stats.health <= 0) return false;
  const p = ctx.state.player.position;
  if (
    spatial(p, candidate.position) > 3.6 ||
    !ctx.collision.visible(
      { ...p, y: p.y + 1.4 },
      { ...candidate.position, y: candidate.position.y + 0.75 },
    )
  ) {
    ctx.notify("靠近事件目标，并确认前方没有阻挡。", "warning");
    return false;
  }
  const a = candidate.action,
    detail = event.encounter,
    inv = ctx.state.player.inventory;
  if (
    ["stabilize", "unlock-cargo", "decode-box"].includes(a) &&
    eventHostiles(ctx, event, a === "stabilize" ? 18 : 22).length
  ) {
    ctx.notify("附近仍有威胁。先将它们引开或清除，再完成操作。", "warning");
    return false;
  }
  if (
    ["disable-alarm", "ground-battery"].includes(a) &&
    !countItem(inv, "wrench")
  ) {
    ctx.notify("这项操作需要维修扳手。", "warning");
    return false;
  }
  if (a === "force-cargo" && !countItem(inv, "crowbar")) {
    ctx.notify("强开线路需要赤锈撬棍。", "warning");
    return false;
  }
  if (a.endsWith("-reward")) return complete(ctx, event);
  if (a === "stabilize") {
    if (!transact(ctx, { bandage: 1, water: 1 }, {})) return false;
    detail.approach = "aid";
    detail.survivorHealth = Math.max(60, detail.survivorHealth);
    ctx.notify("季砚：我能走了。别离我太远，前面那块背风处就好。");
  } else if (a === "disable-alarm") {
    if (!transact(ctx, { electronics: 1 }, {})) return false;
    detail.approach = "quiet";
    ctx.notify("警报电源已断开。靠近货舱前，确认周围没有威胁。");
  } else if (a === "force-cargo") {
    detail.approach = "force";
    ctx.noise(event.position, 220, "car-alarm");
    for (const actor of Object.values(ctx.state.actors))
      if (
        actor.health > 0 &&
        actor.kind !== "deer" &&
        spatial(actor.position, event.position) < 100
      ) {
        actor.state = "investigate";
        actor.target = { ...event.position };
        actor.awareness = Math.max(actor.awareness, 0.7);
        actor.timer = 25;
      }
    ctx.state.director.tension = Math.min(100, ctx.state.director.tension + 20);
    ctx.notify(
      "金属撕裂声传得很远。警报已拆下，但附近感染者正在靠近。",
      "warning",
    );
  } else if (a === "ground-battery") {
    if (!transact(ctx, { scrap: 2 }, {})) return false;
    detail.approach = "quiet";
    ctx.notify("故障电池已接地，电弧停止。现在可以检查黑匣子。");
  } else if (a === "decode-box") {
    if (!transact(ctx, { electronics: 2 }, {})) return false;
    ctx.notify("校验通过。黑匣子记录的是军用补给航线，终点位于第七研究站。");
  } else if (a !== "unlock-cargo") return false;
  advance(event, ctx.state.elapsed);
  ctx.bus.emit({
    type: "sound",
    text: "mechanical",
    kind: "mechanical",
    position: candidate.position,
  });
  return true;
}

/** Called from the once-per-second director tick; timing and escort progress survive saves. */
export function updateWorldEvents(ctx: SimContext): void {
  for (const event of ctx.state.events) {
    if (event.resolved) continue;
    if (event.expires <= ctx.state.elapsed) {
      event.resolved = true;
      if (event.encounter) {
        event.encounter.outcome = "expired";
        event.encounter.lastUpdate = ctx.state.elapsed;
      }
      continue;
    }
    if (!authored(event)) {
      const container = ctx.state.containers[event.id];
      if (container?.searched && container.inventory.items.length === 0) {
        event.resolved = true;
        flag(ctx, `event-complete:${event.kind}`);
      }
      if (["migration", "raidercamp"].includes(event.kind)) {
        const guards = Object.values(ctx.state.actors).filter((a) =>
          a.id.startsWith(event.id + ":guard:"),
        );
        if (
          guards.length &&
          guards.every(
            (a) =>
              a.health <= 0 ||
              (event.kind === "migration" &&
                spatial(a.position, event.position) > 90),
          )
        )
          event.resolved = true;
      }
      continue;
    }
    const detail = event.encounter,
      now = ctx.state.elapsed,
      dt = clamp(now - detail.lastUpdate, 0, 5);
    detail.lastUpdate = now;
    if (event.kind === "rescue" && detail.stage < 2) {
      const nearby = spatial(ctx.state.player.position, event.position) < 75;
      if (detail.stage === 0) {
        const threat = eventHostiles(ctx, event, 12).length;
        detail.survivorHealth = clamp(
          detail.survivorHealth - dt * (nearby ? 0.1 + threat * 0.18 : 0.025),
        );
        if (detail.survivorHealth <= 0) {
          detail.outcome = "failed";
          event.resolved = true;
          flag(ctx, `event-failed:${event.id}`);
          ctx.notify("求救信号中断了。季砚没能等到救助。", "warning");
        }
      } else {
        const survivor = survivorPosition(ctx, event);
        if (
          spatial(ctx.state.player.position, survivor) > 22 ||
          eventHostiles(ctx, event, 14).length
        )
          detail.stageAt += dt;
        else if (now - detail.stageAt >= 8) {
          advance(event, now);
          ctx.notify("季砚到达了背风处，过去确认他的情况。");
        }
      }
    }
    if (
      event.kind === "convoy" &&
      detail.stage === 0 &&
      now >= (ctx.state.cooldowns[`${event.id}:alarm`] ?? 0)
    ) {
      ctx.state.cooldowns[`${event.id}:alarm`] = now + 6;
      ctx.noise(event.position, 65, "car-alarm");
      ctx.bus.emit({
        type: "sound",
        text: "alarm",
        kind: "alarm",
        position: event.position,
      });
    }
    if (
      event.kind === "wreck" &&
      detail.stage === 0 &&
      spatial(ctx.state.player.position, event.position) < 2.8 &&
      dt > 0
    )
      ctx.damage(dt * 2, "残骸电弧", "arm", false);
  }
}

/** Pull-based desired scene state: repeated calls/reload do not repeat rewards or spawn actors. */
export function worldEventScenes(ctx: SimContext): WorldEventScene[] {
  return ctx.state.events
    .filter(authored)
    .filter((event) =>
      ctx.gen.pois.some((poi) => poi.id === event.encounter.poiId),
    )
    .filter((e) => ctx.state.elapsed < e.expires + 180)
    .map((event) => {
      const detail = event.encounter,
        poi = ctx.gen.pois.find((p) => p.id === detail.poiId)!,
        entities: EventEntity[] = [],
        colliders: Collider[] = [];
      if (event.kind === "rescue") {
        entities.push({
          id: `${event.id}:survivor`,
          model: "survivor",
          position: survivorPosition(ctx, event),
          rotation: 0.35,
          name: "季砚",
          state:
            detail.outcome === "failed"
              ? "dead"
              : detail.stage === 0
                ? "wounded"
                : detail.stage === 1
                  ? "walking"
                  : "waiting",
        });
        entities.push({
          id: `${event.id}:beacon`,
          model: "warning-beacon",
          position: point(ctx, event, 1.4, -1),
          rotation: 0,
          state: event.resolved ? "inactive" : "active",
        });
      } else if (event.kind === "convoy") {
        for (let n = 0; n < 2; n++) {
          const vehicle = ctx.state.vehicles.find(
            (v) => v.id === `${event.id}:vehicle:${n}`,
          );
          if (vehicle)
            entities.push({
              id: vehicle.id,
              vehicleId: vehicle.id,
              model: "vehicle",
              position: { ...vehicle.position },
              rotation: vehicle.yaw,
              state: detail.rewardClaimed && n === 0 ? "active" : "damaged",
            });
        }
        entities.push({
          id: `${event.id}:cargo`,
          model: "cargo",
          position: point(ctx, event, 0, -4),
          rotation: 0,
          state: detail.stage >= 2 ? "open" : "locked",
          dimensions: { x: 1.6, y: 0.8, z: 1.2 },
        });
        const cargo = point(ctx, event, 0, -4);
        colliders.push({
          id: `${event.id}:cargo-collider`,
          minX: cargo.x - 0.8,
          maxX: cargo.x + 0.8,
          minZ: cargo.z - 0.6,
          maxZ: cargo.z + 0.6,
          minY: cargo.y,
          maxY: cargo.y + 0.8,
          material: "metal",
        });
        entities.push({
          id: `${event.id}:alarm`,
          model: "warning-beacon",
          position: point(ctx, event, -3, 0, 2),
          rotation: 0,
          state: detail.stage === 0 && !event.resolved ? "active" : "inactive",
        });
      } else {
        entities.push({
          id: `${event.id}:wreck`,
          model: "drone-wreck",
          position: point(ctx, event),
          rotation: 0.22,
          state: "damaged",
          dimensions: { x: 5.5, y: 1.4, z: 3.5 },
        });
        entities.push({
          id: `${event.id}:smoke`,
          model: "smoke",
          position: point(ctx, event, -1.3, 0.5, 0.8),
          rotation: 0,
          state: detail.stage === 0 && !event.resolved ? "active" : "inactive",
        });
        entities.push({
          id: `${event.id}:arc`,
          model: "sparks",
          position: point(ctx, event, -2, 0, 0.6),
          rotation: 0,
          state: detail.stage === 0 && !event.resolved ? "active" : "inactive",
        });
        colliders.push({
          id: `${event.id}:wreck-collider`,
          minX: event.position.x - 2.3,
          maxX: event.position.x + 2.3,
          minZ: event.position.z - 1.3,
          maxZ: event.position.z + 1.3,
          minY: event.position.y,
          maxY: event.position.y + 1.2,
          material: "metal",
        });
      }
      return {
        id: event.id,
        kind: event.kind,
        title: event.name,
        description:
          detail.outcome === "success"
            ? "事件已完成，奖励已经交付。"
            : detail.outcome === "failed"
              ? "求救者没有等到救助。"
              : detail.outcome === "expired"
                ? "信号已过期，现场不再提供事件奖励。"
                : WORLD_EVENT_DEFINITIONS[event.kind].stages[
                    Math.min(2, detail.stage)
                  ]!,
        outcome: detail.outcome,
        stage: detail.stage,
        sourceAnchor: {
          poiId: detail.poiId,
          offset: {
            x: event.position.x - poi.x,
            y: event.position.y - ctx.gen.poiHeight(poi),
            z: event.position.z - poi.z,
          },
        },
        entities,
        colliders,
      };
    });
}
