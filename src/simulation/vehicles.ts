import { clamp, distance } from "../core/types";
import { removeItem } from "./inventory";
import type { SimContext } from "./context";
import type { AISystem } from "./ai";
export class VehicleSystem {
  constructor(
    private ctx: SimContext,
    private ai: AISystem,
  ) {}
  enter(id: string): boolean {
    const s = this.ctx.state,
      v = s.vehicles.find((v) => v.id === id);
    if (!v) return false;
    if (
      v.fuel <= 0 ||
      v.health <= 0 ||
      v.engine < 20 ||
      v.battery < 15 ||
      v.tires < 4
    ) {
      this.ctx.notify("车辆尚不可用。检查燃料、电池、轮胎和引擎。", "warning");
      return false;
    }
    s.player.vehicle = id;
    s.player.yaw = v.yaw;
    this.ctx.notify("已进入驾驶位。W / S 加速制动，A / D 转向，E 下车。");
    return true;
  }
  exit(): boolean {
    const s = this.ctx.state,
      v = s.vehicles.find((v) => v.id === s.player.vehicle);
    if (!v) return false;
    if (Math.abs(v.speed) > 2) {
      this.ctx.notify("先停车再下车", "warning");
      return false;
    }
    for (let n = 0; n < 8; n++) {
      const angle = v.yaw + Math.PI / 2 + (n * Math.PI) / 4,
        x = v.position.x + Math.sin(angle) * 3,
        z = v.position.z + Math.cos(angle) * 3,
        p = this.ctx.gen.position(x, z);
      if (!this.ctx.collision.blocked(p.x, p.y, p.z)) {
        s.player.vehicle = null;
        s.player.position = p;
        this.ctx.notify("已下车");
        return true;
      }
    }
    this.ctx.notify("车门被挡住，换个位置停车。", "warning");
    return false;
  }
  service(
    id: string,
    type: "fuel" | "battery" | "tires" | "engine" | "health",
  ): boolean {
    const v = this.ctx.state.vehicles.find((v) => v.id === id);
    if (!v) return false;
    if (
      ["engine", "health"].includes(type) &&
      !this.ctx.state.player.inventory.items.some((i) => i.id === "wrench")
    ) {
      this.ctx.notify("引擎与车身维修需要扳手。", "warning");
      return false;
    }
    if (type === "tires" ? v.tires >= 4 : v[type] >= 100) {
      this.ctx.notify("这项车况无需补充或维修。");
      return false;
    }
    const inv = this.ctx.state.player.inventory;
    const resources = {
      fuel: "fuel",
      battery: "battery",
      tires: "tire",
      engine: "parts",
      health: "scrap",
    };
    const cost = type === "engine" || type === "health" ? 2 : 1;
    if (!removeItem(inv, resources[type], cost)) {
      this.ctx.notify("缺少维修所需物资。", "warning");
      return false;
    }
    if (type === "tires") v.tires = Math.min(4, v.tires + 1);
    else v[type] = clamp(v[type] + (type === "fuel" ? 28 : 45));
    this.ctx.notify("车辆状态已更新", "success");
    return true;
  }
  update(dt: number, throttle: number, steer: number, brake: boolean): void {
    const s = this.ctx.state,
      v = s.vehicles.find((v) => v.id === s.player.vehicle);
    if (!v) return;
    if (v.fuel <= 0 || v.health <= 0) throttle = 0;
    const traction = (v.tires / 4) * Math.max(0.3, v.engine / 100);
    v.speed += throttle * 7 * dt * traction;
    v.speed *= Math.exp(-dt * (brake ? 6 : throttle === 0 ? 1.1 : 0.15));
    v.speed = clamp(v.speed, -7, 23 * traction);
    const turn = steer * dt * 1.4 * clamp(v.speed / 8, -1, 1);
    v.yaw += turn;
    s.player.yaw += turn;
    const dx = Math.sin(v.yaw) * v.speed * dt,
      dz = Math.cos(v.yaw) * v.speed * dt,
      moved = this.ctx.collision.move(v.position, dx, dz, 1.1, 1.8);
    if (
      Math.hypot(moved.x - v.position.x, moved.z - v.position.z) <
        Math.hypot(dx, dz) * 0.4 &&
      Math.abs(v.speed) > 2
    ) {
      v.health = clamp(v.health - Math.abs(v.speed) * 1.4);
      this.ctx.damage(
        Math.max(0, Math.abs(v.speed) - 6),
        "车辆碰撞",
        "chest",
        false,
      );
      v.speed *= -0.2;
      this.ctx.bus.emit({ type: "sound", text: "crash", kind: "impact" });
    }
    Object.assign(v.position, moved);
    v.position.y = this.ctx.gen.height(v.position.x, v.position.z);
    if (this.ctx.gen.isWater(v.position.x, v.position.z)) {
      v.speed *= 0.9;
      v.engine = clamp(v.engine - dt * 3);
    }
    v.fuel = Math.max(0, v.fuel - dt * (0.009 + Math.abs(v.speed) * 0.001));
    s.player.position = { ...v.position, y: v.position.y + 0.6 };
    if (Math.abs(v.speed) > 1) {
      this.ctx.noise(v.position, 90, "engine");
      for (const a of Object.values(s.actors))
        if (
          a.health > 0 &&
          distance(a.position, v.position) < 2 &&
          Math.abs(v.speed) > 5
        ) {
          this.ai.hurt(a, Math.abs(v.speed) * 9);
          v.health = clamp(v.health - 4);
        }
    }
  }
}
