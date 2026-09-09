import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";

/**
 * Packed glTF streams mix byte joint IDs with float positions/weights. In the
 * WebGPU skinning path this layout produced stretched triangles despite valid
 * CPU poses. Repack once on asset templates, before cloning skeleton instances.
 * Geometry remains shared; animation still runs on the GPU.
 */
export function prepareSkinnedGeometry(meshes: readonly AbstractMesh[]): void {
  const prepared = new Set<NonNullable<Mesh["geometry"]>>();
  for (const mesh of meshes) {
    if (!(mesh instanceof Mesh) || !mesh.skeleton || !mesh.geometry) continue;
    const geometry = mesh.geometry;
    if (prepared.has(geometry)) continue;
    prepared.add(geometry);
    const kinds = geometry.getVerticesDataKinds();
    if (
      !kinds.some((kind) => {
        const buffer = geometry.getVertexBuffer(kind)!;
        return (
          buffer.byteOffset !== 0 ||
          buffer.byteStride !==
            buffer.getSize() * VertexBuffer.GetTypeByteLength(buffer.type)
        );
      })
    )
      continue;
    // Capture every channel before replacing any view of the shared buffer.
    const channels = kinds.map((kind) => ({
      kind,
      size: geometry.getVertexBuffer(kind)!.getSize(),
      data: new Float32Array(geometry.getVerticesData(kind)!),
    }));
    for (const channel of channels)
      geometry.setVerticesData(channel.kind, channel.data, false, channel.size);
  }
}
