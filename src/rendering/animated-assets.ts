import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Animations/animatable";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { RigAnimator } from "./rig-animation";
import { InfectedSkinMaterial } from "./skin-material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { prepareSkinnedGeometry } from "./skinning-layout";

export interface AnimatedRig {
  root: TransformNode;
  meshes: Mesh[];
  nodes: Map<string, TransformNode>;
  animator: RigAnimator;
  dispose(): void;
}
type Gender = "male" | "female";
type Variant = "high" | "low" | "arms" | "body";
export class CharacterAssetLibrary {
  private containers = new Map<string, AssetContainer>();
  private loading = new Map<string, Promise<void>>();
  private materials = new Map<string, Material>();
  private disposed = false;
  private fabric: { albedo: Texture; normal: Texture; orm: Texture } | null =
    null;
  failures: string[] = [];
  constructor(private scene: Scene) {}
  private async load(key: string, filename: string) {
    if (this.loading.has(key)) return this.loading.get(key)!;
    const job = LoadAssetContainerAsync(
      "/assets/characters/" + filename,
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
        this.failures.push(String(error));
        throw error;
      });
    this.loading.set(key, job);
    return job;
  }
  async preload(gender: Gender, variant: Variant = "high") {
    await Promise.all([
      this.load(gender + ":motion", "survivor-" + gender + "-motion.glb"),
      this.load(
        gender + ":" + variant,
        variant === "arms" || variant === "body"
          ? "survivor-player-" + variant + ".glb"
          : "survivor-" + gender + "-" + variant + ".glb",
      ),
    ]);
  }
  ready(gender: Gender, variant: Variant = "high"): boolean {
    return (
      this.containers.has(gender + ":motion") &&
      this.containers.has(gender + ":" + variant)
    );
  }
  get pending() {
    return [...this.loading.keys()].filter((key) => !this.containers.has(key))
      .length;
  }
  instantiate(
    id: string,
    gender: Gender,
    variant: Variant,
    appearance = "walker",
  ): AnimatedRig | null {
    const container = this.containers.get(gender + ":" + variant),
      motion = this.containers.get(gender + ":motion");
    if (!container || !motion) return null;
    const entries = container.instantiateModelsToScene(
      (name) => id + ":" + name,
      false,
      { doNotInstantiate: true },
    );
    const root = new TransformNode(id + ":animated-rig", this.scene);
    for (const node of entries.rootNodes) node.parent = root;
    const nodes = new Map<string, TransformNode>(),
      meshes: Mesh[] = [],
      ownedMaterials = new Map<string, Material>();
    for (const node of [
      ...entries.rootNodes,
      ...entries.rootNodes.flatMap((n) => n.getDescendants()),
    ]) {
      if (node instanceof TransformNode)
        nodes.set(
          node.name.startsWith(id + ":")
            ? node.name.slice(id.length + 1)
            : node.name,
          node,
        );
      if (node instanceof Mesh && node.getTotalVertices()) {
        meshes.push(node);
        node.isPickable = true;
        node.receiveShadows = true;
        node.metadata = { actorId: id };
        node.alwaysSelectAsActiveMesh = true;
        if (node.material)
          node.material = this.material(
            node.material,
            appearance,
            gender,
            `${root.uniqueId}:${node.skeleton?.uniqueId ?? "rig"}`,
            ownedMaterials,
          );
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
    const animator = new RigAnimator(groups);
    const materialCache = this.materials;
    return {
      root,
      meshes,
      nodes,
      animator,
      dispose() {
        animator.dispose();
        for (const skeleton of entries.skeletons) skeleton.dispose();
        root.dispose(false);
        for (const [key, material] of ownedMaterials) {
          materialCache.delete(key);
          material.dispose(false, false);
        }
        ownedMaterials.clear();
      },
    };
  }
  private material(
    source: Material,
    appearance: string,
    gender: Gender,
    owner: string,
    owned: Map<string, Material>,
  ): Material {
    // A material's bone texture binding must not alternate between skeletons.
    const key = owner + ":" + gender + ":" + appearance + ":" + source.uniqueId;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const material = source.clone(key) as PBRMaterial;
    if (!material) return source;
    if (/survivor-(shirt|pants|boots)/.test(source.name)) material.metallic = 0;
    const colors: Record<string, string> = {
      walker: "#77816c",
      runner: "#81725f",
      bloated: "#798369",
      armored: "#505b50",
      stalker: "#5a6260",
      raider: "#776c59",
      npc: "#c8c4ad",
      player: "#788574",
    };
    if (source.name.includes("shirt"))
      material.albedoColor = Color3.FromHexString(
        colors[appearance] ?? colors.walker!,
      ).toLinearSpace();
    if (source.name.includes("pants"))
      material.albedoColor = Color3.FromHexString(
        appearance === "npc" ? "#596a68" : "#62685a",
      ).toLinearSpace();
    if (source.name.includes("shirt") || source.name.includes("pants")) {
      this.fabric ??= {
        albedo: new Texture("/textures/denim_fabric_06/albedo.jpg", this.scene),
        normal: new Texture("/textures/denim_fabric_06/normal.jpg", this.scene),
        orm: new Texture("/textures/denim_fabric_06/orm.jpg", this.scene),
      };
      this.fabric.albedo.level = 28;
      this.fabric.normal.gammaSpace = false;
      this.fabric.normal.level = 0.35;
      this.fabric.orm.gammaSpace = false;
      material.albedoTexture = this.fabric.albedo;
      material.albedoColor.r *= 1.45;
      material.albedoColor.b *= 0.58;
      material.bumpTexture = this.fabric.normal;
      material.metallicTexture = this.fabric.orm;
      material.useRoughnessFromMetallicTextureAlpha = false;
      material.useRoughnessFromMetallicTextureGreen = true;
      material.useMetallnessFromMetallicTextureBlue = true;
      material.useAmbientOcclusionFromMetallicTextureRed = true;
    }
    if (
      source.name.includes("skin") &&
      !["npc", "player", "raider"].includes(appearance)
    ) {
      material.albedoColor = new Color3(0.77, 0.85, 0.73);
      new InfectedSkinMaterial(material);
    }
    if (
      source.name.includes("Eyes") &&
      !["npc", "player", "raider"].includes(appearance)
    ) {
      material.albedoTexture = null;
      material.albedoColor = new Color3(0.34, 0.38, 0.32);
      material.roughness = 0.88;
    }
    material.maxSimultaneousLights = 6;
    this.materials.set(key, material);
    owned.set(key, material);
    return material;
  }
  dispose() {
    this.disposed = true;
    for (const container of this.containers.values()) container.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.containers.clear();
    this.materials.clear();
  }
}
