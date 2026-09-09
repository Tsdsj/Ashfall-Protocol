import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import type { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

/** Cull only outside the light's XY footprint; CSM depth-clamped casters remain. */
export function cascadeCasters(
  matrix: Matrix,
  meshes: readonly AbstractMesh[],
  length: number,
): AbstractMesh[] {
  const planes = Frustum.GetPlanes(matrix).slice(2);
  const visible: AbstractMesh[] = [];
  for (let i = 0; i < length; i++) {
    const mesh = meshes[i]!;
    // Animated skeleton bounds need not enclose the current animation pose.
    if (mesh.skeleton) {
      visible.push(mesh);
      continue;
    }
    mesh.computeWorldMatrix();
    const box = mesh.getBoundingInfo().boundingBox;
    const center = box.centerWorld,
      extent = box.extendSizeWorld;
    if (
      planes.every(
        (p) =>
          p.dotCoordinate(center) +
            Math.abs(p.normal.x) * extent.x +
            Math.abs(p.normal.y) * extent.y +
            Math.abs(p.normal.z) * extent.z >=
          -1,
      )
    )
      visible.push(mesh);
  }
  return visible;
}
