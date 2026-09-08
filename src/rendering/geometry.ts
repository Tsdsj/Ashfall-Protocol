import "@babylonjs/core/Meshes/thinInstanceMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { type Material } from "@babylonjs/core/Materials/material";
import { type Scene } from "@babylonjs/core/scene";
import { type TransformNode } from "@babylonjs/core/Meshes/transformNode";
export type XYZ = [number, number, number];
export class ModelBatch {
  meshes: Mesh[] = [];
  constructor(
    readonly scene: Scene,
    readonly prefix: string,
  ) {}
  box(
    name: string,
    size: XYZ,
    position: XYZ,
    material: Material,
    rotation: XYZ = [0, 0, 0],
  ): Mesh {
    const m = MeshBuilder.CreateBox(
      this.prefix + ":" + name,
      { width: size[0], height: size[1], depth: size[2], wrap: true },
      this.scene,
    );
    m.position.set(...position);
    m.rotation.set(...rotation);
    m.material = material;
    this.meshes.push(m);
    return m;
  }
  beveledBox(
    name: string,
    size: XYZ,
    position: XYZ,
    material: Material,
    rotation: XYZ = [0, 0, 0],
  ): Mesh {
    const mesh = new Mesh(this.prefix + ":" + name, this.scene),
      data = new VertexData(),
      p: number[] = [],
      normals: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    const half = size.map((n) => n / 2),
      radius = Math.min(...size) * 0.18;
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [-1, 1]) {
        const uAxis = (axis + 2) % 3,
          vAxis = (axis + 1) % 3;
        const us = [
            -half[uAxis]!,
            -half[uAxis]! + radius,
            half[uAxis]! - radius,
            half[uAxis]!,
          ],
          vs = [
            -half[vAxis]!,
            -half[vAxis]! + radius,
            half[vAxis]! - radius,
            half[vAxis]!,
          ],
          start = p.length / 3;
        for (let v = 0; v < 4; v++)
          for (let u = 0; u < 4; u++) {
            const raw = [0, 0, 0];
            raw[axis] = sign * half[axis]!;
            raw[uAxis] = us[u]!;
            raw[vAxis] = vs[v]!;
            const core = raw.map((n, i) =>
                Math.max(-half[i]! + radius, Math.min(half[i]! - radius, n)),
              ),
              delta = raw.map((n, i) => n - core[i]!),
              len = Math.hypot(...delta) || 1;
            p.push(...core.map((n, i) => n + (delta[i]! / len) * radius));
            normals.push(...delta.map((n) => n / len));
            uvs.push(u / 3, v / 3);
          }
        for (let v = 0; v < 3; v++)
          for (let u = 0; u < 3; u++) {
            const a = start + v * 4 + u;
            if (sign > 0) indices.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
            else indices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
          }
      }
    data.positions = p;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    this.meshes.push(mesh);
    return mesh;
  }
  cylinder(
    name: string,
    height: number,
    diameter: number,
    position: XYZ,
    material: Material,
    rotation: XYZ = [0, 0, 0],
    top?: number,
    sides = 12,
  ): Mesh {
    const m = MeshBuilder.CreateCylinder(
      this.prefix + ":" + name,
      {
        height,
        diameterBottom: diameter,
        diameterTop: top ?? diameter,
        tessellation: sides,
      },
      this.scene,
    );
    m.position.set(...position);
    m.rotation.set(...rotation);
    m.material = material;
    this.meshes.push(m);
    return m;
  }
  sphere(
    name: string,
    size: XYZ,
    position: XYZ,
    material: Material,
    segments = 12,
  ): Mesh {
    const m = MeshBuilder.CreateSphere(
      this.prefix + ":" + name,
      { diameter: 1, segments },
      this.scene,
    );
    m.scaling.set(...size);
    m.position.set(...position);
    m.material = material;
    this.meshes.push(m);
    return m;
  }
  pipe(
    name: string,
    a: XYZ,
    b: XYZ,
    diameter: number,
    material: Material,
  ): Mesh {
    const va = new Vector3(...a),
      vb = new Vector3(...b),
      delta = vb.subtract(va);
    const m = this.cylinder(
      name,
      delta.length(),
      diameter,
      va.add(vb).scale(0.5).asArray() as XYZ,
      material,
    );
    m.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      delta.normalize(),
      new Quaternion(),
    );
    return m;
  }
  take(mesh: Mesh): Mesh {
    this.meshes = this.meshes.filter((m) => m !== mesh);
    return mesh;
  }
  finish(parent?: TransformNode): Mesh[] {
    const groups = new Map<Material, Mesh[]>();
    for (const m of this.meshes) {
      if (!m.material) continue;
      const list = groups.get(m.material) ?? [];
      list.push(m);
      groups.set(m.material, list);
    }
    const output: Mesh[] = [];
    for (const [material, meshes] of groups) {
      const merged = Mesh.MergeMeshes(
        meshes,
        true,
        true,
        undefined,
        false,
        false,
      );
      if (!merged) continue;
      merged.name = this.prefix + ":" + material.name;
      merged.material = material;
      merged.receiveShadows = true;
      if (parent) merged.parent = parent;
      merged.freezeWorldMatrix();
      output.push(merged);
    }
    this.meshes = [];
    return output;
  }
}
export function transform(
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = sx,
  sz = sx,
  angle = 0,
): Matrix {
  return Matrix.Compose(
    new Vector3(sx, sy, sz),
    Quaternion.RotationYawPitchRoll(angle, 0, 0),
    new Vector3(x, y, z),
  );
}
export function applyThinInstances(
  source: Mesh,
  matrices: Matrix[],
  name: string,
): Mesh {
  const mesh = source.clone(name, null, true)!;
  mesh.makeGeometryUnique();
  mesh.setEnabled(true);
  mesh.isVisible = true;
  mesh.thinInstanceSetBuffer(
    "matrix",
    new Float32Array(matrices.flatMap((m) => Array.from(m.m))),
    16,
    true,
  );
  mesh.thinInstanceRefreshBoundingInfo(true);
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}
export function terrainMesh(
  scene: Scene,
  name: string,
  positions: Float32Array,
  indices: Uint32Array,
  uvs: Float32Array,
  colors?: Float32Array,
): Mesh {
  const mesh = new Mesh(name, scene),
    data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  let up = 0;
  for (let i = 1; i < normals.length; i += 3) up += normals[i]!;
  if (up < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const b = indices[i + 1]!;
      indices[i + 1] = indices[i + 2]!;
      indices[i + 2] = b;
    }
    VertexData.ComputeNormals(positions, indices, normals);
  }
  data.normals = normals;
  if (colors) {
    data.colors = colors;
    mesh.useVertexColors = true;
  }
  data.applyToMesh(mesh);
  mesh.receiveShadows = true;
  return mesh;
}
