import type { Collider, POI } from "../core/types";
import type { WorldGenerator } from "../world/generator";

export const OPENING_WRECK = {
  position: { x: -10.4, y: 1.34, z: -19.8 },
  yaw: 0.17,
  roll: 1.38,
  localMin: [-1.3, 0, -5.7] as const,
  localMax: [1.3, 3.05, 2.3] as const,
  luggage: [
    {
      x: -13.35,
      y: 0.17,
      z: -25.9,
      width: 0.62,
      height: 0.32,
      depth: 0.42,
      yaw: 0.7,
    },
    {
      x: -15.4,
      y: 0.16,
      z: -23.4,
      width: 0.72,
      height: 0.3,
      depth: 0.43,
      yaw: -0.4,
    },
    {
      x: -12.5,
      y: 0.13,
      z: -29.6,
      width: 0.46,
      height: 0.24,
      depth: 0.36,
      yaw: 0.2,
    },
  ],
};
/** Static opening set dressing is not a driveable vehicle; its collision is explicit. */
export function openingWreckColliders(): Collider[] {
  const points: [number, number, number][] = [];
  const { position, yaw, roll, localMin, localMax } = OPENING_WRECK;
  for (const x of [localMin[0], localMax[0]])
    for (const y of [localMin[1], localMax[1]])
      for (const z of [localMin[2], localMax[2]]) {
        const rx = x * Math.cos(roll) - y * Math.sin(roll),
          ry = x * Math.sin(roll) + y * Math.cos(roll);
        points.push([
          position.x + rx * Math.cos(yaw) + z * Math.sin(yaw),
          position.y + ry,
          position.z - rx * Math.sin(yaw) + z * Math.cos(yaw),
        ]);
      }
  return [
    {
      id: "opening:evacuation-truck",
      minX: Math.min(...points.map((p) => p[0])),
      maxX: Math.max(...points.map((p) => p[0])),
      minY: Math.min(...points.map((p) => p[1])),
      maxY: Math.max(...points.map((p) => p[1])),
      minZ: Math.min(...points.map((p) => p[2])),
      maxZ: Math.max(...points.map((p) => p[2])),
      material: "metal",
    },
    ...OPENING_WRECK.luggage.map((item, i) => ({
      id: "opening:luggage:" + i,
      minX: item.x - item.width * 0.7,
      maxX: item.x + item.width * 0.7,
      minY: 0,
      maxY: item.height,
      minZ: item.z - item.depth * 0.8,
      maxZ: item.z + item.depth * 0.8,
      material: "wood" as const,
    })),
  ];
}

export interface EnvironmentApproach {
  from: [number, number];
  to: [number, number];
  width: number;
}
/** Footpaths connect existing front doors to the closest reachable road edge. */
export function environmentApproaches(
  gen: WorldGenerator,
  pois: POI[],
): EnvironmentApproach[] {
  const paths: EnvironmentApproach[] = [];
  for (const p of pois) {
    if (p.kind === "extraction") continue;
    const from: [number, number] = [p.x, p.z - p.depth / 2 - 1.05];
    const spine = -9 + Math.sin(from[1] * 0.003) * 12;
    const candidates: [number, number][] = [
      [spine + Math.sign(p.x - spine) * 5.2, from[1]],
    ];
    for (const road of [225, -420])
      if (road < from[1]) candidates.push([p.x, road + 5.2]);
    if (p.region === "city") {
      const region = gen.regionAt(p.x, p.z);
      for (let row = 0; row < 4; row++) {
        const road = region.z + row * 46 - 17;
        if (road < from[1]) candidates.push([p.x, road + 5.2]);
      }
    }
    candidates.sort(
      (a, b) =>
        Math.hypot(a[0] - from[0], a[1] - from[1]) -
        Math.hypot(b[0] - from[0], b[1] - from[1]),
    );
    const to = candidates[0]!;
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 64) continue;
    paths.push({ from, to, width: p.region === "city" ? 1.7 : 1.45 });
  }
  return paths;
}
export function distanceToEnvironmentPath(
  x: number,
  z: number,
  path: EnvironmentApproach,
): number {
  const dx = path.to[0] - path.from[0],
    dz = path.to[1] - path.from[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - path.from[0]) * dx + (z - path.from[1]) * dz) /
        (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(x - path.from[0] - dx * t, z - path.from[1] - dz * t);
}
/** Trees need broad clearances; low grass only avoids actual walking/driving surfaces. */
export function groundCoverAllowed(
  gen: WorldGenerator,
  x: number,
  z: number,
  pois: POI[],
  paths: EnvironmentApproach[],
): boolean {
  if (gen.roadDistance(x, z) < 5.45 || gen.isWater(x, z)) return false;
  for (const p of pois) {
    if (
      Math.abs(x - p.x) < p.width / 2 + 0.32 &&
      Math.abs(z - p.z) < p.depth / 2 + 0.32
    )
      return false;
    if (
      Math.abs(x - p.x) < 1.5 &&
      z < p.z - p.depth / 2 &&
      z > p.z - p.depth / 2 - 2.6
    )
      return false;
  }
  return !paths.some(
    (path) => distanceToEnvironmentPath(x, z, path) < path.width / 2 + 0.18,
  );
}

export type EnvironmentAsset =
  | "chair"
  | "table"
  | "trash"
  | "barrel"
  | "jerrycan"
  | "carton"
  | "wrench"
  | "generator";
export interface EnvironmentPlacement {
  id: string;
  asset: EnvironmentAsset;
  /** Floor pivot, relative to the POI centre; dimensions are metres. */
  position: [number, number, number];
  size: [number, number, number];
  yaw: number;
  pitch?: number;
  roll?: number;
  solid: boolean;
}

/** Shared by the renderer and collision world; no Babylon dependency. */
export function environmentPlacements(p: POI): EnvironmentPlacement[] {
  if (p.kind === "extraction") return [];
  const w = p.width / 2,
    d = p.depth / 2;
  const items: EnvironmentPlacement[] = [];
  const add = (
    id: string,
    asset: EnvironmentAsset,
    position: EnvironmentPlacement["position"],
    size: EnvironmentPlacement["size"],
    yaw = 0,
    solid = true,
    roll = 0,
  ) =>
    items.push({
      id: p.id + ":environment:" + id,
      asset,
      position,
      size,
      yaw,
      solid,
      roll,
    });
  // Match the original table collider and keep the story page at y + .945.
  add("table", "table", [3, 0.085, 1.8], [2, 0.835, 1.4], 0, false);
  add("chair", "chair", [3, 0.085, 0.2], [0.51, 0.88, 0.55], Math.PI);
  add(
    "fallen-chair",
    "chair",
    [w - 1.18, 0.3294, 0.35],
    [0.51, 0.88, 0.55],
    0.8,
    true,
    -1.28,
  );
  add(
    "open-carton",
    "carton",
    [-w + 0.7, 0.43, d - 1.6],
    [0.62, 0.4, 0.52],
    0.16,
    false,
  );
  add(
    "floor-carton",
    "carton",
    [-w + 1.8, 0.085, d - 1.25],
    [0.68, 0.48, 0.58],
    -0.2,
  );
  add(
    "discarded-bag",
    "trash",
    [w - 0.9, 0.085, -d + 1.25],
    [0.55, 0.65, 0.5],
    1.7,
  );
  add(
    "yard-trash",
    "trash",
    [-w - 1.05, 0.02, d - 1.1],
    [0.65, 0.75, 0.6],
    -0.45,
  );
  const industrial =
    ["industrial", "warehouse", "lab"].includes(p.kind) || p.region === "fort";
  if (industrial) {
    add(
      "backup-generator",
      "generator",
      [w + 2, 0.03, d - 1],
      [1.15, 0.82, 0.75],
      Math.PI * 0.5,
    );
    add(
      "fuel-drum",
      "barrel",
      [w + 1.5, 0.03, d - 2.5],
      [0.64, 0.96, 0.64],
      -0.2,
    );
    add(
      "fuel-drum-2",
      "barrel",
      [w + 2.22, 0.03, d - 2.65],
      [0.64, 0.96, 0.64],
      0.4,
    );
    add(
      "reserve-fuel",
      "jerrycan",
      [w + 1.6, 0.03, d - 3.55],
      [0.34, 0.48, 0.18],
      0.3,
    );
    add(
      "workshop-tool",
      "wrench",
      [2.55, 0.925, 2.2],
      [0.25, 0.025, 0.065],
      1.9,
      false,
    );
  } else {
    add(
      "evacuation-fuel",
      "jerrycan",
      [-w + 1.6, 0.085, -d + 1.25],
      [0.34, 0.48, 0.18],
      0.2,
    );
    add(
      "packed-carton",
      "carton",
      [-w + 2.45, 0.085, d - 1.2],
      [0.55, 0.4, 0.45],
      0.35,
    );
  }
  if (["medical", "lab"].includes(p.kind)) {
    add(
      "clinical-waste",
      "trash",
      [2.8, 0.085, Math.min(d - 1.05, 3.5)],
      [0.52, 0.6, 0.5],
      -0.8,
    );
    add(
      "triage-supply",
      "carton",
      [-w + 0.7, 1.0, 1.1],
      [0.56, 0.32, 0.44],
      0,
      false,
    );
  }
  return items;
}

/** Conservative bounds include tilted furniture and keep rendering/physics aligned. */
export function environmentPropColliders(p: POI, floorY: number): Collider[] {
  return environmentPlacements(p)
    .filter((item) => item.solid)
    .map((item) => {
      const {
        position: [x, y, z],
        size: [w, h, d],
        yaw,
        roll = 0,
        pitch = 0,
      } = item;
      const points: [number, number, number][] = [];
      for (const px of [-w / 2, w / 2])
        for (const py of [0, h])
          for (const pz of [-d / 2, d / 2]) {
            const rx = px * Math.cos(roll) - py * Math.sin(roll),
              ry = px * Math.sin(roll) + py * Math.cos(roll);
            const ty = ry * Math.cos(pitch) - pz * Math.sin(pitch),
              tz = ry * Math.sin(pitch) + pz * Math.cos(pitch);
            points.push([
              x + rx * Math.cos(yaw) + tz * Math.sin(yaw),
              y + ty,
              z - rx * Math.sin(yaw) + tz * Math.cos(yaw),
            ]);
          }
      return {
        id: item.id,
        minX: p.x + Math.min(...points.map((v) => v[0])),
        maxX: p.x + Math.max(...points.map((v) => v[0])),
        minY: floorY + Math.min(...points.map((v) => v[1])),
        maxY: floorY + Math.max(...points.map((v) => v[1])),
        minZ: p.z + Math.min(...points.map((v) => v[2])),
        maxZ: p.z + Math.max(...points.map((v) => v[2])),
        material: ["chair", "table", "carton"].includes(item.asset)
          ? "wood"
          : "metal",
      };
    });
}
