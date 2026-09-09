import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Animations/animatable";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { prepareSkinnedGeometry } from "./skinning-layout";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { ActorData, ActorAttack } from "../core/types";
import { RigAnimator, type ClipSample } from "./rig-animation";

export type AnimalKind = "deer" | "wolf" | "boar";
export interface AnimalAnimation {
  duration: number;
  loop: boolean;
  hitPhase?: number;
  provenance: string;
}
export interface AnimalProfile {
  /** Source conversion multiplier, already embedded in the GLB. Never apply again. */
  scale: number;
  sourceScale?: number;
  runtimeScale?: 1;
  forward: "+Z";
  groundY: number;
  animations: Record<string, AnimalAnimation>;
  bones: {
    head: string;
    body: string;
    frontLeft: string;
    frontRight: string;
    backLeft: string;
    backRight: string;
  };
  bounds?: { min: number[]; max: number[] };
  /** Offline audit only; these corrections are already baked into motion.glb. */
  deathGrounding?: { phase: number; uncorrectedMinY: number; rootY: number }[];
  hoofGrounding?: Record<string, number>;
}
export interface AnimalRig {
  root: TransformNode;
  meshes: Mesh[];
  nodes: Map<string, TransformNode>;
  head: TransformNode;
  feet: TransformNode[];
  animator: RigAnimator;
  profile: AnimalProfile;
  kind: AnimalKind;
  dispose(): void;
}
/** Assets are fetched only for animal species currently needed by streamed actors. */
export class AnimalAssetLibrary {
  private containers = new Map<string, AssetContainer>();
  private loading = new Map<string, Promise<void>>();
  private profiles: Record<AnimalKind, AnimalProfile> | null = null;
  private metadata: Promise<void> | null = null;
  private disposed = false;
  readonly failures: string[] = [];
  constructor(private scene: Scene) {}
  private manifest() {
    return (this.metadata ??= fetch("/assets/animals/manifest.json").then(
      async (response) => {
        if (!response.ok)
          throw new Error("Animal metadata: " + response.status);
        this.profiles = (await response.json()).animals;
      },
    ));
  }
  private load(kind: AnimalKind, variant: "motion" | "high" | "low") {
    const key = kind + ":" + variant;
    let job = this.loading.get(key);
    if (job) return job;
    job = LoadAssetContainerAsync(
      `/assets/animals/${kind}-${variant}.glb`,
      this.scene,
      { pluginOptions: { gltf: { animationStartMode: 0 } } },
    )
      .then((container) => {
        if (this.disposed) {
          container.dispose();
          return;
        }
        prepareSkinnedGeometry(container.meshes);
        this.containers.set(key, container);
      })
      .catch((error) => {
        this.failures.push(key + ": " + String(error));
        throw error;
      });
    this.loading.set(key, job);
    return job;
  }
  async preload(kind: AnimalKind, variant: "high" | "low" = "high") {
    await Promise.all([
      this.manifest(),
      this.load(kind, "motion"),
      this.load(kind, variant),
    ]);
  }
  ready(kind: AnimalKind, variant: "high" | "low" = "high") {
    return Boolean(
      this.profiles &&
      this.containers.has(kind + ":motion") &&
      this.containers.has(kind + ":" + variant),
    );
  }
  instantiate(
    id: string,
    kind: AnimalKind,
    variant: "high" | "low" = "high",
  ): AnimalRig | null {
    const meshContainer = this.containers.get(kind + ":" + variant),
      motion = this.containers.get(kind + ":motion"),
      profile = this.profiles?.[kind];
    if (!meshContainer || !motion || !profile) return null;
    const entries = meshContainer.instantiateModelsToScene(
      (name) => id + ":" + name,
      false,
      { doNotInstantiate: true },
    );
    const root = new TransformNode(id + ":quadruped", this.scene),
      nodes = new Map<string, TransformNode>(),
      meshes: Mesh[] = [];
    for (const node of entries.rootNodes) node.parent = root;
    for (const node of [
      ...entries.rootNodes,
      ...entries.rootNodes.flatMap((node) => node.getDescendants()),
    ]) {
      if (node instanceof TransformNode)
        nodes.set(
          node.name.startsWith(id + ":")
            ? node.name.slice(id.length + 1)
            : node.name,
          node,
        );
      if (node instanceof Mesh && node.getTotalVertices()) {
        node.isPickable = true;
        node.receiveShadows = true;
        node.metadata = { actorId: id, animal: kind };
        meshes.push(node);
      }
    }
    const groups = new Map<string, AnimationGroup>();
    for (const source of motion.animationGroups) {
      const group = new AnimationGroup(id + ":" + source.name, this.scene);
      for (const track of source.targetedAnimations) {
        const target = nodes.get((track.target as TransformNode).name);
        if (target) group.addTargetedAnimation(track.animation, target);
      }
      groups.set(source.name, group);
    }
    const animator = new RigAnimator(groups),
      head = nodes.get(profile.bones.head) ?? root;
    const feet = [
      profile.bones.frontLeft,
      profile.bones.frontRight,
      profile.bones.backLeft,
      profile.bones.backRight,
    ]
      .map((name) => nodes.get(name))
      .filter((node): node is TransformNode => Boolean(node));
    return {
      root,
      nodes,
      meshes,
      head,
      feet,
      animator,
      profile,
      kind,
      dispose() {
        animator.dispose();
        for (const skeleton of entries.skeletons) skeleton.dispose();
        root.dispose(false);
      },
    };
  }
  get pending() {
    return [...this.loading.keys()].filter((key) => !this.containers.has(key))
      .length;
  }
  dispose() {
    this.disposed = true;
    for (const container of this.containers.values()) container.dispose();
    this.containers.clear();
  }
}

/** Align the visible contact pose exactly with AI hitTime, regardless of attack duration. */
export function animalAttackPhase(
  attack: Pick<ActorAttack, "elapsed" | "hitTime" | "duration">,
  hitPhase: number,
): number {
  const elapsed = Math.max(0, Math.min(attack.duration, attack.elapsed));
  return elapsed <= attack.hitTime
    ? (elapsed / Math.max(0.001, attack.hitTime)) * hitPhase
    : hitPhase +
        ((elapsed - attack.hitTime) /
          Math.max(0.001, attack.duration - attack.hitTime)) *
          (1 - hitPhase);
}
export function animalClipSamples(
  profile: AnimalProfile,
  actor: ActorData,
  time: number,
): ClipSample[] {
  const duration = (clip: string) => profile.animations[clip]?.duration ?? 1;
  if (actor.health <= 0)
    return [
      {
        clip: "Death",
        phase: Math.min(1, (time - actor.deathTime) / duration("Death")),
        weight: 1,
        loop: false,
      },
    ];
  if (actor.attack)
    return [
      {
        clip: "Attack",
        phase: animalAttackPhase(
          actor.attack,
          profile.animations.Attack?.hitPhase ?? 0.5,
        ),
        weight: 1,
        loop: false,
      },
    ];
  if (
    actor.reaction &&
    ["stagger", "knockdown", "downed"].includes(actor.state)
  ) {
    const clip =
      actor.reaction.side === "left" || actor.reaction.side === "back"
        ? "HitAlt"
        : "Hit";
    return [
      {
        clip,
        phase: Math.min(1, actor.stateAge / duration(clip)),
        weight: 1,
        loop: false,
      },
    ];
  }
  if (actor.speed > 0.15) {
    const run = Math.max(0, Math.min(1, (actor.speed - 1.4) / 1.7));
    const phase = actor.gaitPhase / (Math.PI * 2);
    return [
      { clip: "Walk", phase, weight: 1 - run },
      { clip: "Run", phase, weight: run },
    ];
  }
  const idle =
    actor.behavior === "feeding" && profile.animations.Eat
      ? "Eat"
      : actor.phase % 2 > 1 && profile.animations.IdleLook
        ? "IdleLook"
        : "Idle";
  return [
    { clip: idle, phase: (time + actor.phase) / duration(idle), weight: 1 },
  ];
}
/** Call after setting root position/yaw. Existing AI owns displacement and combat timing. */
export function updateAnimalAnimation(
  rig: AnimalRig,
  actor: ActorData,
  time: number,
  dt: number,
  distance: number,
): boolean {
  const interval = distance < 28 ? 0 : distance < 75 ? 1 / 24 : 1 / 10;
  return rig.animator.sample(
    animalClipSamples(rig.profile, actor, time),
    dt,
    interval,
    actor.attack ? 23 : 16,
  );
}
