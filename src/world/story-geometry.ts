import type { Collider, WorldState } from "../core/types";
import type { WorldGenerator } from "./generator";
import { smoothstep } from "../core/motion";
export function storyShelfPose(gen: WorldGenerator, state: WorldState) {
  const poi = gen.pois.find((p) => p.id === "pine-3")!,
    n = state.narrative,
    active = n.activeSequence;
  const progress = n.seenSequences.includes("shelf-collapse")
    ? 1
    : active?.id === "shelf-collapse" && active.applied.includes("fall")
      ? smoothstep(active.elapsed / 0.8)
      : 0;
  return {
    position: {
      x: poi.x - 5,
      y: gen.poiHeight(poi) + progress * 0.32,
      z: poi.z + 1,
    },
    angle: (progress * Math.PI) / 2,
  };
}
export function storyColliders(
  gen: WorldGenerator,
  state: WorldState,
): Collider[] {
  const pose = storyShelfPose(gen, state),
    p = pose.position,
    c = Math.cos(pose.angle),
    s = Math.sin(pose.angle),
    points = [];
  for (const x of [-0.8, 0.8])
    for (const y of [0, 2.1])
      for (const z of [-0.32, 0.32])
        points.push({
          x: p.x + x,
          y: p.y + y * c - z * s,
          z: p.z + y * s + z * c,
        });
  return [
    {
      id: "story:market-shelf",
      minX: Math.min(...points.map((v) => v.x)),
      maxX: Math.max(...points.map((v) => v.x)),
      minY: Math.min(...points.map((v) => v.y)),
      maxY: Math.max(...points.map((v) => v.y)),
      minZ: Math.min(...points.map((v) => v.z)),
      maxZ: Math.max(...points.map((v) => v.z)),
      material: "metal",
    },
  ];
}
