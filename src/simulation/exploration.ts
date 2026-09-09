import type { WorldState } from "../core/types";

export const MAP_CELL_SIZE = 64;
export const MAP_GRID_SIZE = 64;
const PREFIX = "map-explored:";
type ExplorationState = Pick<WorldState, "flags" | "player" | "discovered">;
type KnownPlace = { id: string; x: number; z: number };
type Memory = {
  flags: string[];
  cells: Set<number>;
  lastCell: number;
  known: Set<string>;
};
const memories = new WeakMap<ExplorationState, Memory>();

export function explorationCell(x: number, z: number): number {
  const clamp = (n: number) =>
    Math.max(0, Math.min(63, Math.floor((n + 2048) / MAP_CELL_SIZE)));
  return clamp(z) * MAP_GRID_SIZE + clamp(x);
}
function memory(state: ExplorationState): Memory {
  const cached = memories.get(state);
  if (cached?.flags === state.flags) return cached;
  const cells = new Set<number>();
  for (const flag of state.flags) {
    const match = /^map-explored:(\d+):(\d+)$/.exec(flag);
    if (match && +match[1] < 64 && +match[2] < 64)
      cells.add(+match[2] * 64 + +match[1]);
  }
  const next = {
    flags: state.flags,
    cells,
    lastCell: -1,
    known: new Set<string>(),
  };
  memories.set(state, next);
  return next;
}
function reveal(memory: Memory, cell: number): boolean {
  let changed = false;
  const cx = cell % 64,
    cz = Math.floor(cell / 64);
  for (let z = Math.max(0, cz - 1); z <= Math.min(63, cz + 1); z++)
    for (let x = Math.max(0, cx - 1); x <= Math.min(63, cx + 1); x++) {
      const id = z * 64 + x;
      if (memory.cells.has(id)) continue;
      memory.cells.add(id);
      memory.flags.push(`${PREFIX}${x}:${z}`);
      changed = true;
    }
  return changed;
}
/** O(1) on frames inside the same cell; writes at most 4096 bounded flags. */
export function recordExploration(state: ExplorationState): boolean {
  const { x, z } = state.player.position;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const cached = memory(state),
    cell = explorationCell(x, z);
  if (cell === cached.lastCell) return false;
  cached.lastCell = cell;
  return reveal(cached, cell);
}
/** Old saves retain known POI surroundings when their map is first opened. */
export function exploredCells(
  state: ExplorationState,
  places: readonly KnownPlace[] = [],
): ReadonlySet<number> {
  const cached = memory(state);
  if (places.length) {
    const known = new Set(state.discovered);
    for (const place of places) {
      if (!known.has(place.id) || cached.known.has(place.id)) continue;
      cached.known.add(place.id);
      reveal(cached, explorationCell(place.x, place.z));
    }
  }
  return cached.cells;
}
