import { BUILDING_KINDS, ITEMS } from "../data/items";
import { clamp, distance, type Vec3, type StructureData } from "../core/types";
import { addItem, countItem, newInventory, removeItem } from "./inventory";
import type { SimContext } from "./context";
export interface Placement {
  position: Vec3;
  rotation: number;
  valid: boolean;
  reason: string;
  kind: string;
}
export class BuildingSystem {
  selected = "campfire";
  rotation = 0;
  active = false;
  constructor(private ctx: SimContext) {}
  preview(origin: Vec3, direction: Vec3): Placement {
    let t = 4;
    for (let step = 1; step < 80; step++) {
      const d = step * 0.12,
        x = origin.x + direction.x * d,
        z = origin.z + direction.z * d,
        y = origin.y + direction.y * d;
      if (y <= this.ctx.gen.height(x, z) + 0.1) {
        t = d;
        break;
      }
    }
    let x = origin.x + direction.x * Math.min(t, 7),
      z = origin.z + direction.z * Math.min(t, 7);
    const structural = [
      "foundation",
      "wall",
      "window",
      "door",
      "floor",
      "roof",
      "stairs",
      "fence",
      "gate",
    ].includes(this.selected);
    if (structural) {
      x = Math.round(x / 4) * 4;
      z = Math.round(z / 4) * 4;
      if (["wall", "window", "door", "fence", "gate"].includes(this.selected)) {
        if (Math.round(this.rotation / (Math.PI / 2)) % 2) x += 2;
        else z += 2;
      }
    }
    let y = this.ctx.gen.height(x, z);
    const base = this.ctx.state.structures.find(
      (b) =>
        b.kind === "foundation" && distance(b.position, { x, y: 0, z }) < 3,
    );
    if (base && this.selected !== "foundation") y = base.position.y + 0.22;
    if (this.selected === "floor") y += 3;
    const position = { x, y, z };
    let reason = "";
    const p = this.ctx.state.player;
    if (
      !this.ctx.state.flags.includes("creative-mode") &&
      !countItem(p.inventory, "kit_" + this.selected)
    )
      reason = "缺少组件，在制作菜单制作";
    else if (this.ctx.gen.isWater(x, z)) reason = "不能在水中建造";
    else if (distance(position, p.position) < 1.4) reason = "距离自己太近";
    else if (
      this.ctx.state.structures.some(
        (b) =>
          b.health > 0 &&
          b.kind === this.selected &&
          distance(b.position, position) < (structural ? 1.8 : 0.85) &&
          Math.abs(b.position.y - y) < 1,
      )
    )
      reason = "与现有结构重叠";
    else if (
      this.ctx.collision
        .nearby(x, z, 4)
        .some(
          (c) =>
            !c.id.startsWith("build-") &&
            x > c.minX - 0.5 &&
            x < c.maxX + 0.5 &&
            z > c.minZ - 0.5 &&
            z < c.maxZ + 0.5,
        )
    )
      reason = "与现有建筑冲突";
    else if (
      Math.abs(this.ctx.gen.height(x + 1, z) - this.ctx.gen.height(x - 1, z)) >
      1.4
    )
      reason = "地面过于陡峭";
    return {
      position,
      rotation: this.rotation,
      valid: !reason,
      reason,
      kind: this.selected,
    };
  }
  place(placement: Placement): boolean {
    if (!placement.valid) {
      this.ctx.notify(placement.reason, "warning");
      return false;
    }
    if (
      !this.ctx.state.flags.includes("creative-mode") &&
      !removeItem(this.ctx.state.player.inventory, "kit_" + placement.kind)
    )
      return false;
    const b: StructureData = {
      id: this.ctx.nextId("build"),
      kind: placement.kind,
      position: { ...placement.position },
      rotation: placement.rotation,
      health: 100,
      fuel: placement.kind === "campfire" ? 60 : 0,
      active: placement.kind === "campfire",
      growth: 0,
      plantedAt: 0,
    };
    if (["storage", "fridge"].includes(b.kind))
      b.inventory = newInventory(10, 6);
    this.ctx.state.structures.push(b);
    this.ctx.noise(b.position, 18, "build");
    this.ctx.notify(
      "已放置 " + (BUILDING_KINDS.find((k) => k[0] === b.kind)?.[1] ?? b.kind),
      "success",
    );
    return true;
  }
  powered(position: Vec3): boolean {
    const s = this.ctx.state;
    const spatial = (a: Vec3, b: Vec3) =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    return s.structures.some(
      (b) =>
        b.kind === "generator" &&
        b.active &&
        b.fuel > 0 &&
        b.health > 0 &&
        spatial(b.position, position) <
          (s.structures.some(
            (w) =>
              w.health > 0 &&
              w.kind === "wire" &&
              spatial(w.position, b.position) < 12,
          )
            ? 30
            : 16),
    );
  }
  near(kind: string, radius = 6): StructureData | undefined {
    return this.ctx.state.structures.find(
      (b) =>
        b.kind === kind &&
        b.health > 0 &&
        Math.abs(b.position.y - this.ctx.state.player.position.y) < 2.5 &&
        distance(b.position, this.ctx.state.player.position) < radius,
    );
  }
  interact(id: string): boolean {
    const s = this.ctx.state,
      b = s.structures.find((b) => b.id === id);
    if (!b) return false;
    const inv = s.player.inventory;
    if (b.kind === "campfire" || b.kind === "generator") {
      if (b.fuel <= 0) {
        const fuel = b.kind === "campfire" ? "wood" : "fuel";
        if (!removeItem(inv, fuel, 1)) {
          this.ctx.notify("需要 " + ITEMS[fuel]!.name, "warning");
          return false;
        }
        b.fuel += b.kind === "campfire" ? 80 : 100;
      }
      b.active = !b.active;
      this.ctx.notify(b.active ? "已点燃 / 启动" : "已熄灭 / 停机");
      return true;
    }
    if (b.kind === "door" || b.kind === "gate") {
      return this.ctx.doors.request(id);
    }
    if (b.kind === "planter") {
      if (b.growth >= 100) {
        const harvest = structuredClone(inv);
        if (!addItem(harvest, "turnip", 3) || !addItem(harvest, "seeds", 2)) {
          this.ctx.notify("背包空间不足。作物和种子仍留在花盆中。", "warning");
          return false;
        }
        inv.items = harvest.items;
        b.growth = 0;
        b.plantedAt = 0;
        this.ctx.notify("收获成熟作物", "success");
        return true;
      }
      if (b.plantedAt === 0) {
        if (!removeItem(inv, "seeds", 1)) {
          this.ctx.notify("需要耐寒蔬菜种子", "warning");
          return false;
        }
        b.plantedAt = Math.max(1, s.elapsed);
        this.ctx.notify("播种完成。雨水会促进生长。");
        return true;
      }
      this.ctx.notify("作物生长 " + Math.floor(b.growth) + "%");
      return true;
    }
    if (b.kind === "raincollector") {
      if (b.fuel < 20) {
        this.ctx.notify("雨水不足，请等待降雨。");
        return false;
      }
      if (!addItem(inv, "water")) return false;
      b.fuel -= 20;
      this.ctx.notify("取得收集的雨水", "success");
      return true;
    }
    if (b.kind === "light") {
      b.active = !b.active;
      this.ctx.notify(
        this.powered(b.position) ? "照明已切换" : "附近没有运行的发电机。",
        "info",
      );
      return true;
    }
    return false;
  }
  fuel(id: string): boolean {
    const b = this.ctx.state.structures.find((b) => b.id === id);
    if (!b || !["generator", "campfire"].includes(b.kind)) return false;
    if (
      !removeItem(
        this.ctx.state.player.inventory,
        b.kind === "campfire" ? "wood" : "fuel",
      )
    )
      return false;
    b.fuel = clamp(b.fuel + 80, 0, 300);
    this.ctx.notify("燃料已添加");
    return true;
  }
  repair(id: string): boolean {
    const b = this.ctx.state.structures.find((b) => b.id === id);
    if (
      !b ||
      b.health >= 100 ||
      !removeItem(this.ctx.state.player.inventory, "wood", 2)
    )
      return false;
    b.health = clamp(b.health + 40);
    this.ctx.notify("结构已维修");
    return true;
  }
  reclaim(id: string): boolean {
    const s = this.ctx.state,
      b = s.structures.find((b) => b.id === id);
    if (!b) return false;
    if (b.inventory?.items.length) {
      this.ctx.notify("先取出容器中的物品", "warning");
      return false;
    }
    const reclaimed = structuredClone(s.player.inventory);
    const fits =
      b.kind === "campfire"
        ? addItem(reclaimed, "stone", 3) && addItem(reclaimed, "wood", 1)
        : addItem(reclaimed, "kit_" + b.kind);
    if (!fits) {
      this.ctx.notify("背包空间不足", "warning");
      return false;
    }
    s.player.inventory.items = reclaimed.items;
    s.structures = s.structures.filter((b) => b.id !== id);
    this.ctx.notify("组件已回收");
    return true;
  }
  update(dt: number): void {
    const s = this.ctx.state;
    for (const b of s.structures) {
      if (b.health <= 0) {
        b.active = false;
        continue;
      }
      if (b.active && ["generator", "campfire"].includes(b.kind)) {
        b.fuel = Math.max(
          0,
          b.fuel - dt * (b.kind === "campfire" ? 0.05 : 0.07),
        );
        if (b.fuel === 0) b.active = false;
        if (
          b.kind === "generator" &&
          s.elapsed >= (s.cooldowns["generator-noise:" + b.id] ?? 0)
        ) {
          this.ctx.noise(b.position, 65, "generator");
          s.cooldowns["generator-noise:" + b.id] = s.elapsed + 5;
        }
      }
      if (b.kind === "planter" && b.plantedAt > 0)
        b.growth = clamp(
          b.growth +
            (dt / 900) *
              100 *
              (s.weather === "rain" || s.weather === "storm" ? 1.3 : 1),
        );
      if (
        b.kind === "raincollector" &&
        (s.weather === "rain" || s.weather === "storm")
      )
        b.fuel = clamp(b.fuel + dt * 0.2);
      if (b.inventory)
        for (const i of b.inventory.items)
          if (ITEMS[i.id]?.perishable)
            i.freshness = clamp(
              i.freshness -
                dt *
                  (b.kind === "fridge" && this.powered(b.position)
                    ? 0.001
                    : 0.02),
            );
      if (s.weather === "storm" && b.id.startsWith("build-"))
        b.health = Math.max(0, b.health - dt * 0.001);
    }
  }
}
