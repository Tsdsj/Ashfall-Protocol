import {
  distance,
  type ActorData,
  type Collider,
  type Vec3,
} from "../core/types";
import { orientedBoxContains } from "./doors";
import type { SimContext } from "./context";

interface Route {
  goal: Vec3;
  points: Vec3[];
  retryAt: number;
  found: boolean;
}
class SearchHeap {
  private items: { index: number; score: number }[] = [];
  get length() {
    return this.items.length;
  }
  push(index: number, score: number) {
    const item = { index, score };
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p]!.score <= score) break;
      this.items[i] = this.items[p]!;
      i = p;
    }
    this.items[i] = item;
  }
  pop(): number {
    const result = this.items[0]!,
      last = this.items.pop()!;
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let c = i * 2 + 1;
        if (
          c + 1 < this.items.length &&
          this.items[c + 1]!.score < this.items[c]!.score
        )
          c++;
        if (this.items[c]!.score >= last.score) break;
        this.items[i] = this.items[c]!;
        i = c;
      }
      this.items[i] = last;
    }
    return result.index;
  }
}
export class LocalNavigator {
  private routes = new Map<string, Route>();
  budget = 2;
  constructor(private ctx: SimContext) {}
  beginFrame() {
    this.budget = 2;
  }
  clear(id: string) {
    this.routes.delete(id);
  }
  waypoint(actor: ActorData, goal: Vec3): { point: Vec3; found: boolean } {
    const elevated = (p: Vec3) => ({ ...p, y: p.y + 0.65 });
    if (this.ctx.collision.visible(elevated(actor.position), elevated(goal))) {
      this.routes.delete(actor.id);
      return { point: goal, found: true };
    }
    let route = this.routes.get(actor.id);
    if (
      !route ||
      distance(route.goal, goal) > 2.5 ||
      this.ctx.state.elapsed > route.retryAt
    ) {
      if (this.budget > 0) {
        this.budget--;
        route = this.find(actor, goal);
        this.routes.set(actor.id, route);
      }
    }
    if (!route) return { point: goal, found: false };
    while (
      route.points.length > 1 &&
      distance(actor.position, route.points[0]!) < 0.6
    )
      route.points.shift();
    return { point: route.points[0] ?? goal, found: route.found };
  }
  private find(actor: ActorData, goal: Vec3): Route {
    const cell = 0.8,
      side = 49,
      half = (side - 1) / 2,
      ox = Math.round(actor.position.x / cell) * cell - half * cell,
      oz = Math.round(actor.position.z / cell) * cell - half * cell;
    const obstacles = this.ctx.collision.nearby(
      actor.position.x,
      actor.position.z,
      half * cell + 3,
    );
    const height =
      actor.kind === "deer" || actor.kind === "wolf" || actor.kind === "boar"
        ? 1
        : 1.7;
    const blocked = new Int8Array(side * side).fill(-1),
      heights = new Float32Array(side * side);
    const cellIndex = (x: number, z: number) =>
      Math.max(0, Math.min(side - 1, Math.round((z - oz) / cell))) * side +
      Math.max(0, Math.min(side - 1, Math.round((x - ox) / cell)));
    const start = cellIndex(actor.position.x, actor.position.z),
      target = cellIndex(goal.x, goal.z);
    const position = (index: number): Vec3 => ({
      x: ox + (index % side) * cell,
      y: heights[index]!,
      z: oz + Math.floor(index / side) * cell,
    });
    const walkable = (index: number) => {
      if (index < 0 || index >= blocked.length) return false;
      if (blocked[index] !== -1) return blocked[index] === 0;
      const p = position(index);
      p.y = this.ctx.gen.height(p.x, p.z);
      heights[index] = p.y;
      const collides = obstacles.some((c: Collider) =>
        orientedBoxContains(c, p, 0.34, height),
      );
      blocked[index] = collides || this.ctx.gen.isWater(p.x, p.z) ? 1 : 0;
      return blocked[index] === 0;
    };
    blocked[start] = 0;
    heights[start] = actor.position.y;
    const costs = new Float32Array(side * side).fill(Infinity),
      parents = new Int32Array(side * side).fill(-1),
      closed = new Uint8Array(side * side);
    const heap = new SearchHeap();
    costs[start] = 0;
    heap.push(start, 0);
    let best = start,
      bestDistance = Infinity,
      visited = 0;
    const tx = target % side,
      tz = Math.floor(target / side);
    while (heap.length && visited++ < 1400) {
      const current = heap.pop();
      if (closed[current]) continue;
      closed[current] = 1;
      const x = current % side,
        z = Math.floor(current / side),
        heuristic = Math.hypot(x - tx, z - tz);
      if (heuristic < bestDistance) {
        bestDistance = heuristic;
        best = current;
      }
      if (current === target) break;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const nx = x + dx!,
          nz = z + dz!;
        if (nx < 0 || nx >= side || nz < 0 || nz >= side) continue;
        const next = nz * side + nx;
        if (closed[next] || !walkable(next)) continue;
        if (dx && dz && (!walkable(z * side + nx) || !walkable(nz * side + x)))
          continue;
        const slope = Math.abs(heights[next]! - heights[current]!);
        if (slope > 0.75) continue;
        const cost = costs[current]! + (dx && dz ? 1.414 : 1) + slope * 0.35;
        if (cost < costs[next]!) {
          costs[next] = cost;
          parents[next] = current;
          heap.push(next, cost + Math.hypot(nx - tx, nz - tz));
        }
      }
    }
    const points: Vec3[] = [];
    if (best !== start) {
      let node = best;
      while (node !== start && node >= 0) {
        points.push(position(node));
        node = parents[node]!;
      }
      points.reverse();
    }
    return {
      goal: { ...goal },
      points,
      retryAt: this.ctx.state.elapsed + (bestDistance < 1.5 ? 1.2 : 0.6),
      found: bestDistance < 1.5,
    };
  }
}
