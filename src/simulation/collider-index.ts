import type { Collider } from "../core/types";
type Entry = { collider: Collider; order: number; x: number; z: number };

/** Immutable geometry only. Dynamic door/vehicle/build state is filtered by the caller. */
export class ColliderIndex {
  private readonly cells = new Map<string, Entry[]>();
  private readonly entries: Entry[];
  constructor(colliders: readonly Collider[]) {
    this.entries = colliders.map((collider, order) => ({
      collider,
      order,
      x: (collider.minX + collider.maxX) / 2,
      z: (collider.minZ + collider.maxZ) / 2,
    }));
    for (const entry of this.entries) {
      const key = `${Math.floor(entry.x / 32)},${Math.floor(entry.z / 32)}`;
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(entry);
      else this.cells.set(key, [entry]);
    }
  }
  query(x: number, z: number, radius: number): Collider[] {
    const minX = Math.floor((x - radius) / 32),
      maxX = Math.floor((x + radius) / 32);
    const minZ = Math.floor((z - radius) / 32),
      maxZ = Math.floor((z + radius) / 32);
    const near = (e: Entry) =>
      Math.abs(e.x - x) < radius && Math.abs(e.z - z) < radius;
    // Long rays can cover most cells; scanning the original list is cheaper then.
    if ((maxX - minX + 1) * (maxZ - minZ + 1) > this.cells.size)
      return this.entries.filter(near).map((e) => e.collider);
    const result: Entry[] = [];
    for (let cz = minZ; cz <= maxZ; cz++)
      for (let cx = minX; cx <= maxX; cx++)
        for (const entry of this.cells.get(`${cx},${cz}`) ?? [])
          if (near(entry)) result.push(entry);
    // Preserve the old nearest-hit tie order across cell boundaries.
    result.sort((a, b) => a.order - b.order);
    return result.map((e) => e.collider);
  }
}
