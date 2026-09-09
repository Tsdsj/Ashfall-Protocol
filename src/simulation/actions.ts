import { ITEMS } from "../data/items";
import { STORY } from "../world/generator";
import { ENEMIES } from "../data/enemies";
import { initialStats } from "./state";
import {
  addItem,
  countItem,
  newInventory,
  removeItem,
  removeUid,
  transfer,
} from "./inventory";
import {
  clamp,
  distance,
  type Interaction,
  type Stack,
  type Vec3,
} from "../core/types";
import type { SimContext } from "./context";
export class Actions {
  pending: {
    kind: string;
    label: string;
    total: number;
    remaining: number;
    uid?: string;
    target?: Vec3;
    range: number;
  } | null = null;
  revision = 0;
  private complete: (() => boolean) | null = null;
  constructor(private ctx: SimContext) {}
  begin(
    kind: string,
    label: string,
    seconds: number,
    complete: () => boolean,
    options: { uid?: string; target?: Vec3; range?: number } = {},
  ): boolean {
    if (this.ctx.state.player.stats.health <= 0) return false;
    if (this.ctx.busy) {
      this.ctx.notify("先完成制作，或取消当前制作。", "warning");
      return false;
    }
    if (this.pending) {
      this.ctx.notify("先完成当前操作，或按 Esc 取消。", "warning");
      return false;
    }
    this.pending = {
      kind,
      label,
      total: seconds,
      remaining: seconds,
      uid: options.uid,
      target: options.target ? { ...options.target } : undefined,
      range: options.range ?? 3.8,
    };
    this.complete = complete;
    this.ctx.bus.emit({ type: "motion", text: kind, value: seconds });
    this.ctx.bus.emit({ type: "sound", text: kind, kind: "action-start" });
    return true;
  }
  cancel(message = "操作已取消，尚未消耗物品。") {
    if (!this.pending) return;
    this.pending = null;
    this.complete = null;
    this.revision++;
    this.ctx.bus.emit({ type: "motion", text: "cancel", value: 0.12 });
    if (message) this.ctx.notify(message);
  }
  update(dt: number) {
    const action = this.pending;
    if (!action) return;
    const p = this.ctx.state.player;
    if (p.stats.health <= 0) {
      this.cancel("");
      return;
    }
    if (action.uid && !p.inventory.items.some((i) => i.uid === action.uid)) {
      this.cancel("物品已移出背包，操作取消。");
      return;
    }
    if (action.target && distance(p.position, action.target) > action.range) {
      this.cancel("已离开操作位置。");
      return;
    }
    const before = Math.floor(action.remaining * 2);
    action.remaining = Math.max(0, action.remaining - dt);
    if (before !== Math.floor(action.remaining * 2)) {
      this.ctx.noise(
        action.target ?? p.position,
        action.kind === "search" ? 6 : action.kind === "repair" ? 10 : 3,
        action.kind,
      );
      this.ctx.bus.emit({
        type: "sound",
        text: action.kind,
        kind: "action-loop",
        position: action.target,
      });
    }
    if (action.remaining > 0) return;
    const complete = this.complete;
    this.pending = null;
    this.complete = null;
    complete?.();
    this.cleanup();
    this.revision++;
  }
  cleanup(): void {
    const p = this.ctx.state.player;
    p.quickSlots = p.quickSlots.map((uid) =>
      p.inventory.items.some((i) => i.uid === uid) ? uid : null,
    );
    for (const [slot, uid] of Object.entries(p.equipment))
      if (!p.inventory.items.some((i) => i.uid === uid))
        delete p.equipment[slot as keyof typeof p.equipment];
  }
  use(uid: string): boolean {
    const item = this.ctx.state.player.inventory.items.find(
      (i) => i.uid === uid,
    );
    if (!item) return false;
    const definition = ITEMS[item.id]!;
    if (["food", "drink", "medical"].includes(definition.category)) {
      const medical = definition.category === "medical";
      return this.begin(
        medical ? "heal" : definition.category === "drink" ? "drink" : "eat",
        medical
          ? "正在使用 " + definition.name
          : (definition.category === "drink" ? "正在饮用 " : "正在食用 ") +
              definition.name,
        medical ? 1.6 : definition.category === "drink" ? 1.05 : 1.25,
        () => this.applyUse(uid),
        { uid },
      );
    }
    if (this.pending) this.cancel("切换装备，当前操作已取消。");
    return this.applyUse(uid);
  }
  private applyUse(uid: string): boolean {
    const p = this.ctx.state.player,
      i = p.inventory.items.find((i) => i.uid === uid);
    if (!i) return false;
    const d = ITEMS[i.id]!,
      s = p.stats;
    if (d.weapon || i.id === "grenade" || d.category === "tool") {
      p.quickSlots[p.selected] = i.uid;
      p.equipment.primary = i.uid;
      this.ctx.notify("已装备 " + d.name, "success");
      return true;
    }
    if (d.slot) {
      p.equipment[d.slot] = i.uid;
      this.ctx.notify("已穿戴 " + d.name, "success");
      return true;
    }
    if (d.category === "food" || d.category === "drink") {
      s.energy = clamp(
        s.energy + (d.energy ?? 0) * (i.freshness < 20 ? 0.3 : 1),
      );
      s.hydration = clamp(s.hydration + (d.hydration ?? 0));
      if (
        i.id === "dirtywater" ||
        ["rawmeat", "fish", "mushroom"].includes(i.id) ||
        i.freshness < 20
      ) {
        s.poison = clamp(s.poison + 20);
        this.ctx.notify("未处理的食物或水引起了不适。", "warning");
      }
      if (i.id === "energydrink") s.fatigue = clamp(s.fatigue - 12);
      if (["stew", "porridge", "cookedmeat"].includes(i.id))
        s.temperature = Math.min(37.2, s.temperature + 0.2);
      removeUid(p.inventory, uid);
      this.cleanup();
      this.ctx.notify(
        (d.category === "drink" ? "已饮用 " : "已食用 ") + d.name,
        "success",
      );
      this.ctx.bus.emit({ type: "sound", text: "consume", kind: d.category });
      return true;
    }
    if (d.category === "medical") {
      s.health = clamp(s.health + (d.healing ?? 0));
      if (d.cure === "bleed1") s.bleeding = Math.max(0, s.bleeding - 1);
      if (d.cure === "bleed" || d.cure === "all") s.bleeding = 0;
      if (d.cure === "infection" || d.cure === "all") s.infection = 0;
      if (d.cure === "pain" || d.cure === "all") s.pain = 0;
      if (d.cure === "fracture" || d.cure === "all") s.fracture = false;
      if (d.cure === "all") {
        s.blood = clamp(s.blood + 25);
        s.poison = 0;
      }
      if (i.id === "tourniquet") s.pain = clamp(s.pain + 8);
      removeUid(p.inventory, uid);
      this.cleanup();
      this.ctx.notify("已使用 " + d.name, "success");
      this.ctx.bus.emit({ type: "sound", text: "medical", kind: "medical" });
      return true;
    }
    if (
      [
        "scope",
        "reddot",
        "suppressor",
        "grip",
        "extendedmag",
        "laser",
        "weaponlight",
      ].includes(i.id)
    ) {
      const equipped = p.inventory.items.find(
        (w) => w.uid === p.quickSlots[p.selected],
      );
      if (
        !equipped ||
        equipped.id === "bow" ||
        !ITEMS[equipped.id]?.weapon?.ammo
      ) {
        this.ctx.notify("先在快捷栏装备一把枪械。", "warning");
        return false;
      }
      if (equipped.attachments.includes(i.id)) {
        this.ctx.notify("已安装同类配件");
        return false;
      }
      equipped.attachments.push(i.id);
      removeUid(p.inventory, uid);
      this.cleanup();
      this.ctx.notify("已安装 " + d.name, "success");
      return true;
    }
    this.ctx.notify(
      d.structure
        ? "在建造菜单选择这个组件并放置。"
        : "此物品可用于制作或世界交互。",
    );
    return false;
  }
  detach(uid: string, id: string): boolean {
    const inv = this.ctx.state.player.inventory,
      i = inv.items.find((i) => i.uid === uid);
    if (!i || !i.attachments.includes(id)) return false;
    if (!addItem(inv, id)) return false;
    const current = inv.items.find((i) => i.uid === uid)!;
    current.attachments = current.attachments.filter((a) => a !== id);
    this.ctx.notify("配件已卸下");
    return true;
  }
  assign(uid: string, slot: number): void {
    if (slot < 0 || slot > 4) return;
    const p = this.ctx.state.player;
    const item = p.inventory.items.find((i) => i.uid === uid);
    if (!item) return;
    if (
      !["weapon", "tool", "food", "drink", "medical"].includes(
        ITEMS[item.id]!.category,
      )
    ) {
      this.ctx.notify("快捷栏用于武器、工具和可使用的补给。");
      return;
    }
    p.quickSlots[slot] = uid;
    this.ctx.notify(`已放入快捷栏 ${slot + 1}`);
  }
  repairItem(uid: string): boolean {
    return this.begin(
      "repair",
      "正在维护装备",
      1.8,
      () => this.repairItemNow(uid),
      { uid },
    );
  }
  private repairItemNow(uid: string): boolean {
    const inv = this.ctx.state.player.inventory,
      i = inv.items.find((i) => i.uid === uid);
    if (!i || (i.durability >= 100 && i.dirt === 0)) return false;
    if (!removeItem(inv, "scrap", 2)) {
      this.ctx.notify("维修需要 2 份废金属", "warning");
      return false;
    }
    i.durability = clamp(i.durability + 45);
    i.dirt = Math.max(0, i.dirt - 65);
    this.ctx.notify("装备已修复", "success");
    return true;
  }
  drop(uid: string): boolean {
    const s = this.ctx.state,
      p = s.player,
      i = p.inventory.items.find((i) => i.uid === uid);
    if (!i) return false;
    const inventory = newInventory(8, 6);
    if (!transfer(p.inventory, inventory, uid)) return false;
    const id = this.ctx.nextId("drop");
    s.containers[id] = {
      id,
      name: "遗留物资",
      type: "dropped",
      position: {
        x: p.position.x + Math.sin(p.yaw) * 1.5,
        y: p.position.y + 0.15,
        z: p.position.z + Math.cos(p.yaw) * 1.5,
      },
      inventory,
      searched: true,
      openedAt: s.elapsed,
    };
    this.cleanup();
    this.ctx.notify("物品已放在面前");
    return true;
  }
  loot(containerId: string, uid: string): boolean {
    const c = this.ctx.state.containers[containerId];
    if (!c) return false;
    const name =
      ITEMS[c.inventory.items.find((i) => i.uid === uid)?.id ?? ""]?.name;
    if (!transfer(c.inventory, this.ctx.state.player.inventory, uid)) {
      this.ctx.notify("背包空间不足，先整理或转移一些物品。", "warning");
      return false;
    }
    c.searched = true;
    c.openedAt = this.ctx.state.elapsed;
    this.ctx.notify("已取得 " + name, "success");
    this.ctx.bus.emit({ type: "sound", text: "pickup", kind: "pickup" });
    return true;
  }
  gather(target: Interaction): boolean {
    const s = this.ctx.state;
    if (s.destroyed.includes(target.id)) return false;
    const inv = s.player.inventory;
    let id = target.resource ?? "wood",
      n = id === "wood" ? 3 : id === "stone" ? 3 : 2;
    const weapon = inv.items.find(
      (i) => i.uid === s.player.quickSlots[s.player.selected],
    );
    if (id === "wood" && weapon?.id === "hatchet") n = 7;
    if (
      id === "ore" &&
      !inv.items.some((i) => i.id === "shovel" || i.id === "hatchet")
    ) {
      this.ctx.notify("采矿需要铲子或手斧", "warning");
      return false;
    }
    if (s.player.stats.stamina < 8) {
      this.ctx.notify("体力不足", "warning");
      return false;
    }
    if (id === "water") {
      id = "dirtywater";
      n = 1;
    }
    if (!addItem(inv, id, n)) {
      this.ctx.notify("背包空间不足", "warning");
      return false;
    }
    s.player.stats.stamina -= 8;
    if (target.type !== "water") s.destroyed.push(target.id);
    this.ctx.noise(target.position, 14, "gather");
    this.ctx.notify(`已采集 ${ITEMS[id]!.name} ×${n}`, "success");
    return true;
  }
  harvest(id: string): boolean {
    const a = this.ctx.state.actors[id];
    if (!a || a.health > 0 || a.harvested) return false;
    const inv = this.ctx.state.player.inventory,
      def = ENEMIES[a.kind];
    if (
      def.animal &&
      !inv.items.some((i) => ["knife", "machete", "hatchet"].includes(i.id))
    ) {
      this.ctx.notify("处理猎物需要刀具", "warning");
      return false;
    }
    const cId = "corpse:" + id;
    if (!this.ctx.state.containers[cId]) {
      const bag = newInventory(8, 6);
      for (const [item, n] of Object.entries(def.loot)) addItem(bag, item, n);
      this.ctx.state.containers[cId] = {
        id: cId,
        name: def.name + "的遗留物",
        type: "dropped",
        position: { ...a.position, y: a.position.y + 0.3 },
        inventory: bag,
        searched: false,
        openedAt: 0,
      };
    }
    a.harvested = true;
    this.ctx.noise(a.position, 5, "harvest");
    this.ctx.notify(
      def.animal ? "猎物已处理，打开遗留物取得肉与兽皮。" : "已搜索遗留物。",
      "success",
    );
    return true;
  }
  door(id: string): boolean {
    return this.ctx.doors.request(id);
  }
  read(id: string): boolean {
    const story = STORY[id];
    if (!story) return false;
    const s = this.ctx.state;
    if (id === "lab" && !countItem(s.player.inventory, "keycard")) {
      this.ctx.notify("研究终端需要访问卡。", "warning");
      return false;
    }
    if (!s.journal.includes(id)) {
      s.journal.push(id);
      this.ctx.notify("新记录：" + story.title, "success");
    }
    return true;
  }
  radio(): boolean {
    const s = this.ctx.state,
      inv = s.player.inventory;
    if (s.flags.includes("broadcast")) {
      this.ctx.notify("信号持续发送。接应点在东侧。");
      return true;
    }
    if (!countItem(inv, "protocol")) {
      this.ctx.notify("需要第七研究站的原始档案。", "warning");
      return false;
    }
    if (!s.flags.includes("radio-repaired")) {
      const cost = { radio: 1, electronics: 3, battery: 1 };
      if (Object.entries(cost).some(([id, n]) => countItem(inv, id) < n)) {
        this.ctx.notify(
          "修复广播需要：收发器 ×1、电子元件 ×3、蓄电池 ×1。",
          "warning",
        );
        return false;
      }
      for (const [id, n] of Object.entries(cost)) removeItem(inv, id, n);
      s.flags.push("radio-repaired");
      this.cleanup();
    }
    s.flags.push("broadcast");
    s.journal.push("broadcast");
    this.ctx.notify("档案已发送，封锁线外的接应组作出了回应。", "success");
    return true;
  }
  extract(): boolean {
    const s = this.ctx.state;
    if (!s.flags.includes("broadcast")) {
      this.ctx.notify("这里没有接应信号。先修复广播站并发送档案。", "warning");
      return false;
    }
    s.ended = true;
    if (!s.flags.includes("extracted")) s.flags.push("extracted");
    return true;
  }
  fish(): boolean {
    const p = this.ctx.state.player;
    if (this.ctx.state.elapsed < (this.ctx.state.cooldowns.fishing ?? 0)) {
      this.ctx.notify("正在收线，稍等几秒再抛竿。");
      return false;
    }
    if (!p.inventory.items.some((i) => i.id === "fishingrod")) {
      this.ctx.notify("需要简易钓竿，可以在制作菜单组装。", "warning");
      return false;
    }
    if (p.stats.stamina < 10) {
      this.ctx.notify("体力不足");
      return false;
    }
    if (!addItem(p.inventory, "fish")) {
      this.ctx.notify("背包空间不足", "warning");
      return false;
    }
    p.stats.stamina -= 10;
    this.ctx.state.cooldowns.fishing = this.ctx.state.elapsed + 12;
    this.ctx.notify("钓到一条水库鲜鱼。记得烹饪后食用。", "success");
    return true;
  }
  trade(
    payId: string,
    payCount: number,
    itemId: string,
    itemCount = 1,
  ): boolean {
    const inv = this.ctx.state.player.inventory,
      next = structuredClone(inv);
    if (!removeItem(next, payId, payCount)) {
      this.ctx.notify("交换物资不足", "warning");
      return false;
    }
    if (!addItem(next, itemId, itemCount)) {
      this.ctx.notify("背包空间不足", "warning");
      return false;
    }
    inv.items = next.items;
    this.cleanup();
    this.ctx.notify("交易完成：" + ITEMS[itemId]!.name, "success");
    return true;
  }
  sleep(id: string): boolean {
    const s = this.ctx.state,
      bed = s.structures.find((b) => b.id === id && b.kind === "bed");
    if (!bed) return false;
    if (
      s.player.stats.bleeding > 0 ||
      s.player.stats.hydration < 20 ||
      s.player.stats.energy < 15
    ) {
      this.ctx.notify("先处理出血，并补充足够的食物和饮水。", "warning");
      return false;
    }
    if (
      Object.values(s.actors).some(
        (a) =>
          a.health > 0 &&
          (!ENEMIES[a.kind].animal ||
            a.kind === "wolf" ||
            (a.kind === "boar" && a.state === "attack")) &&
          distance(a.position, bed.position) < 28,
      )
    ) {
      this.ctx.notify("附近仍有威胁，无法安全入睡。", "warning");
      return false;
    }
    const hours = 6,
      seconds = hours * ((s.rules.dayLength * 60) / 24);
    const age = (inv: typeof s.player.inventory, rate = 0.022) => {
      for (const item of inv.items)
        if (ITEMS[item.id]?.perishable)
          item.freshness = clamp(item.freshness - seconds * rate);
    };
    age(s.player.inventory);
    for (const b of s.structures) {
      if (b.inventory) {
        const powered =
          b.kind === "fridge" &&
          s.structures.some(
            (g) =>
              g.kind === "generator" &&
              g.active &&
              g.fuel / 0.07 >= seconds &&
              distance(g.position, b.position) < 16,
          );
        age(b.inventory, powered ? 0.001 : 0.022);
      }
      if (b.active && ["campfire", "generator"].includes(b.kind)) {
        b.fuel = Math.max(
          0,
          b.fuel - seconds * (b.kind === "campfire" ? 0.05 : 0.07),
        );
        if (b.fuel === 0) b.active = false;
      }
    }
    for (const b of s.structures) {
      if (b.kind === "planter" && b.plantedAt > 0 && b.health > 0)
        b.growth = clamp(
          b.growth +
            (seconds / 900) *
              100 *
              (s.weather === "rain" || s.weather === "storm" ? 1.3 : 1),
        );
      if (
        b.kind === "raincollector" &&
        b.health > 0 &&
        (s.weather === "rain" || s.weather === "storm")
      )
        b.fuel = clamp(b.fuel + seconds * 0.2);
    }
    for (const v of s.vehicles) age(v.inventory);
    s.time += hours;
    if (s.time >= 24) {
      s.time -= 24;
      s.day++;
    }
    s.elapsed += hours * ((s.rules.dayLength * 60) / 24);
    s.player.stats.fatigue = clamp(s.player.stats.fatigue - 65);
    s.player.stats.health = clamp(s.player.stats.health + 18);
    s.player.stats.energy = clamp(s.player.stats.energy - 14);
    s.player.stats.hydration = clamp(s.player.stats.hydration - 18);
    s.player.stats.stamina = 100;
    s.player.spawn = { ...bed.position, x: bed.position.x + 2 };
    this.ctx.notify("休息了 6 小时，营地已设为重生点。", "success");
    return true;
  }
  die(): void {
    const s = this.ctx.state;
    if (s.flags.includes("player-dead")) return;
    s.flags.push("player-dead");
    s.player.deaths++;
    this.ctx.bus.emit({ type: "death", text: "你的故事暂时停在了这里。" });
  }
  respawn(): boolean {
    const s = this.ctx.state;
    if (s.rules.permadeath) return false;
    const id = this.ctx.nextId("deathbag");
    s.containers[id] = {
      id,
      name: "你的遗落背包",
      type: "dropped",
      position: { ...s.player.position, y: s.player.position.y + 0.25 },
      inventory: structuredClone(s.player.inventory),
      searched: true,
      openedAt: s.elapsed,
    };
    s.player.inventory = newInventory();
    addItem(s.player.inventory, "knife");
    s.player.quickSlots = [
      s.player.inventory.items[0]!.uid,
      null,
      null,
      null,
      null,
    ];
    s.player.equipment = { primary: s.player.inventory.items[0]!.uid };
    s.player.selected = 0;
    s.player.stats = initialStats();
    s.player.position = { ...s.player.spawn };
    s.player.vehicle = null;
    s.flags = s.flags.filter((f) => f !== "player-dead");
    return true;
  }
}
export function itemLabel(stack: Stack): string {
  return ITEMS[stack.id]?.name ?? stack.id;
}
