import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { damp } from "../core/motion";

/** Read one consistent pose, rebuilding shared ancestors once instead of per limb. */
export function createWorldMatrixReader() {
  const refreshed = new Set<TransformNode>();
  const read = (node: TransformNode): Matrix => {
    if (!refreshed.has(node)) {
      if (node.parent instanceof TransformNode) read(node.parent);
      // Animations/IK can change a node within the same Scene render ID.
      node.markAsDirty();
      node.computeWorldMatrix();
      refreshed.add(node);
    }
    return node.getWorldMatrix();
  };
  return read;
}

export interface ClipSample {
  clip: string;
  phase: number;
  weight: number;
  loop?: boolean;
}
interface PlayingClip {
  group: AnimationGroup;
  weight: number;
  phase: number;
}
export class RigAnimator {
  private active = new Map<string, PlayingClip>();
  private corrections = new Map<
    TransformNode,
    { rotation: Quaternion | null; position: Vector3 }
  >();
  private elapsed = 0;
  sampled = false;
  lastClips: { name: string; weight: number; phase: number }[] = [];
  constructor(readonly clips: Map<string, AnimationGroup>) {}
  duration(name: string): number {
    const group = this.clips.get(name);
    return group
      ? (group.to - group.from) /
          (group.targetedAnimations[0]?.animation.framePerSecond ?? 60)
      : 1;
  }
  sample(
    samples: ClipSample[],
    dt: number,
    interval = 0,
    blendRate = 17,
  ): boolean {
    this.sampled = false;
    this.elapsed += dt;
    if (this.active.size && this.elapsed < interval) return false;
    const step = this.elapsed;
    this.elapsed = 0;
    for (const [node, pose] of this.corrections) {
      if (pose.rotation && node.rotationQuaternion)
        node.rotationQuaternion.copyFrom(pose.rotation);
      node.position.copyFrom(pose.position);
    }
    this.corrections.clear();
    const first = !this.active.size;
    for (const sample of samples) {
      if (!this.clips.has(sample.clip)) continue;
      if (!this.active.has(sample.clip)) {
        const group = this.clips.get(sample.clip)!;
        group.start(true, 0);
        group.pause();
        group.setWeightForAllAnimatables(0);
        this.active.set(sample.clip, {
          group,
          weight: first ? sample.weight : 0,
          phase: sample.phase,
        });
      }
    }
    let total = 0;
    for (const [name, value] of this.active) {
      const requested = samples.find((s) => s.clip === name);
      value.weight = damp(
        value.weight,
        requested?.weight ?? 0,
        blendRate,
        step,
      );
      if (requested)
        value.phase =
          requested.loop === false
            ? Math.max(0, Math.min(0.99999, requested.phase))
            : ((requested.phase % 1) + 1) % 1;
      if (!requested && value.weight < 0.002) {
        value.group.stop();
        this.active.delete(name);
        continue;
      }
      total += value.weight;
    }
    this.lastClips = [];
    for (const [name, value] of this.active) {
      const weight = total > 0 ? value.weight / total : 0;
      value.group.setWeightForAllAnimatables(weight);
      value.group.goToFrame(
        value.group.from + (value.group.to - value.group.from) * value.phase,
        true,
      );
      this.lastClips.push({ name, weight, phase: value.phase });
    }
    this.sampled = true;
    return true;
  }
  preserve(node: TransformNode) {
    if (!this.corrections.has(node))
      this.corrections.set(node, {
        rotation: node.rotationQuaternion?.clone() ?? null,
        position: node.position.clone(),
      });
  }
  offset(
    node: TransformNode | undefined,
    pitch: number,
    yaw: number,
    roll: number,
  ) {
    if (!node?.rotationQuaternion) return;
    this.preserve(node);
    node.rotationQuaternion.multiplyInPlace(
      Quaternion.RotationYawPitchRoll(yaw, pitch, roll),
    );
  }
  dispose() {
    for (const group of this.clips.values()) group.dispose();
    this.active.clear();
    this.corrections.clear();
  }
}

export function rotateBoneToward(
  node: TransformNode,
  child: TransformNode,
  point: Vector3,
) {
  node.computeWorldMatrix(true);
  child.computeWorldMatrix(true);
  const start = node.getAbsolutePosition();
  const current = child.getAbsolutePosition().subtract(start).normalize();
  const wanted = point.subtract(start).normalize();
  if (current.lengthSquared() < 0.01 || wanted.lengthSquared() < 0.01) return;
  const parent = node.parent as TransformNode | null;
  const inverseParent = parent
    ? Matrix.Invert(parent.computeWorldMatrix(true))
    : Matrix.Identity();
  const currentLocal = Vector3.TransformNormal(
    current,
    inverseParent,
  ).normalize();
  const wantedLocal = Vector3.TransformNormal(
    wanted,
    inverseParent,
  ).normalize();
  const change = Quaternion.Identity();
  Quaternion.FromUnitVectorsToRef(currentLocal, wantedLocal, change);
  node.rotationQuaternion = change.multiply(
    node.rotationQuaternion ?? Quaternion.Identity(),
  );
  node.computeWorldMatrix(true);
}

export function setBoneWorldRotation(node: TransformNode, world: Matrix) {
  const parent = node.parent as TransformNode | null;
  const local = parent
    ? world.multiply(Matrix.Invert(parent.computeWorldMatrix(true)))
    : world;
  const rotation = Quaternion.Identity();
  local.decompose(undefined, rotation);
  node.rotationQuaternion = rotation;
}
