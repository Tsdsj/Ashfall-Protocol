import "@babylonjs/loaders/glTF";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import weaponManifest from "../data/weapon-assets.json";

export type WeaponAssetKind =
  "pistol" | "rifle" | "military" | "shotgun" | "smg";
export type WeaponPart =
  "body" | "slide" | "magazine" | "pump" | "bolt" | "scope" | "sights";
export type WeaponAnchor =
  | "muzzle"
  | "rightGrip"
  | "leftGrip"
  | "rearSight"
  | "frontSight"
  | "magazine"
  | "support";
export interface WeaponAssetInfo {
  id: WeaponAssetKind;
  file: string;
  dimensions: number[];
  anchors: Record<WeaponAnchor, number[]>;
  slideTravel: number;
  magazineTravel: number;
}
/** Coordinates already match the current left-handed, +Z-forward viewmodel. */
function assetInfo(id: WeaponAssetKind): WeaponAssetInfo {
  const entry = weaponManifest.files.find((file) => file.id === id);
  if (!entry) throw new Error(`Missing weapon asset metadata: ${id}`);
  return { ...entry, id };
}
export const WEAPON_ASSET_INFO: Record<WeaponAssetKind, WeaponAssetInfo> = {
  pistol: assetInfo("pistol"),
  rifle: assetInfo("rifle"),
  military: assetInfo("military"),
  shotgun: assetInfo("shotgun"),
  smg: assetInfo("smg"),
};
export function weaponAssetKind(itemId: string): WeaponAssetKind | null {
  if (itemId === "pistol" || itemId === "pistol45") return "pistol";
  if (itemId === "rifle") return "rifle";
  if (itemId === "military") return "military";
  if (itemId === "shotgun") return "shotgun";
  if (itemId === "smg") return "smg";
  return null;
}
export interface WeaponAssetInstance {
  readonly root: TransformNode;
  readonly meshes: Mesh[];
  readonly parts: Partial<Record<WeaponPart, TransformNode>>;
  /** Anchor nodes follow all weapon/camera transforms. */
  readonly anchors: Record<WeaponAnchor, TransformNode>;
  readonly info: WeaponAssetInfo;
  /** Original local part poses, useful when driving existing reload/recoil curves. */
  readonly restPositions: Partial<Record<WeaponPart, Vector3>>;
  resetParts(): void;
  dispose(): void;
}

export class WeaponAssetLibrary {
  private containers = new Map<WeaponAssetKind, AssetContainer>();
  private loading = new Map<WeaponAssetKind, Promise<void>>();
  private instances = new Set<WeaponAssetInstance>();
  private disposed = false;
  readonly failures: string[] = [];
  constructor(private scene: Scene) {}

  /** One local GLB per class; no remote fetch and no extra texture requests. */
  preload(
    itemIds: readonly string[] = [
      "pistol",
      "rifle",
      "military",
      "shotgun",
      "smg",
    ],
  ): Promise<void> {
    const kinds = [
      ...new Set(
        itemIds
          .map(weaponAssetKind)
          .filter((key): key is WeaponAssetKind => key !== null),
      ),
    ];
    return Promise.all(kinds.map((key) => this.load(key))).then(
      () => undefined,
    );
  }
  private load(key: WeaponAssetKind): Promise<void> {
    if (this.disposed || this.containers.has(key)) return Promise.resolve();
    const pending = this.loading.get(key);
    if (pending) return pending;
    const job = LoadAssetContainerAsync(
      `${import.meta.env.BASE_URL}assets/weapons/${WEAPON_ASSET_INFO[key].file}`,
      this.scene,
      { pluginOptions: { gltf: { animationStartMode: 0 } } },
    )
      .then((container) => {
        if (this.disposed) {
          container.dispose();
          return;
        }
        for (const material of container.materials) {
          const pbr = material as PBRMaterial;
          pbr.maxSimultaneousLights = 6;
          // The viewmodel is lit by the same scene lights as the articulated hands.
          pbr.environmentIntensity = 0.65;
          pbr.clearCoat.isEnabled = true;
          pbr.clearCoat.intensity = 0;
          pbr.clearCoat.roughness = 0.16;
        }
        this.containers.set(key, container);
      })
      .catch((error) => {
        if (!this.disposed) this.failures.push(`${key}: ${String(error)}`);
        throw error;
      })
      .finally(() => this.loading.delete(key));
    this.loading.set(key, job);
    return job;
  }
  ready(itemId: string): boolean {
    const key = weaponAssetKind(itemId);
    return !!key && this.containers.has(key);
  }
  get pending(): number {
    return this.loading.size;
  }
  instantiate(
    itemId: string,
    parent: TransformNode,
    id = `view-${itemId}`,
    attachments: readonly string[] = [],
  ): WeaponAssetInstance | null {
    const kind = weaponAssetKind(itemId),
      container = kind && this.containers.get(kind);
    if (!kind || !container || this.disposed) return null;
    const entries = container.instantiateModelsToScene(
      (name) => `${id}:${name}`,
      false,
      { doNotInstantiate: true },
    );
    const root = new TransformNode(`${id}:asset`, this.scene);
    root.parent = parent;
    // Keep glTF's handedness conversion root: +Z remains forward and side anchors become correct LH X.
    for (const node of entries.rootNodes) {
      node.parent = root;
      node.setEnabled(true);
    }
    const nodes = [
      ...entries.rootNodes,
      ...entries.rootNodes.flatMap((node) => node.getDescendants()),
    ];
    const meshes = nodes.filter(
      (node): node is Mesh =>
        node instanceof Mesh && node.getTotalVertices() > 0,
    );
    const parts: Partial<Record<WeaponPart, TransformNode>> = {};
    const anchors = {} as Record<WeaponAnchor, TransformNode>;
    const restPositions: Partial<Record<WeaponPart, Vector3>> = {};
    for (const node of nodes) {
      if (!(node instanceof TransformNode)) continue;
      const name = node.name.slice(id.length + 1);
      if (name.startsWith("part_") && !name.includes("_primitive")) {
        const part = name.slice(5) as WeaponPart;
        // Source part rotations were baked during conversion; expose Euler rotation for reload curves.
        node.rotationQuaternion = null;
        parts[part] = node;
        restPositions[part] = node.position.clone();
      }
      if (name.startsWith("anchor_"))
        anchors[name.slice(7) as WeaponAnchor] = node;
    }
    for (const mesh of meshes) {
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.renderingGroupId = 1;
      mesh.alwaysSelectAsActiveMesh = true;
    }
    if (parts.scope) parts.scope.setEnabled(attachments.includes("scope"));
    if (parts.sights) parts.sights.setEnabled(!attachments.includes("scope"));
    for (const anchor of [
      "muzzle",
      "rightGrip",
      "leftGrip",
      "rearSight",
      "frontSight",
      "magazine",
      "support",
    ] as const) {
      if (!anchors[anchor]) {
        root.dispose(false);
        throw new Error(`Missing ${kind} weapon anchor: ${anchor}`);
      }
    }
    let released = false;
    const instance: WeaponAssetInstance = {
      root,
      meshes,
      parts,
      anchors,
      restPositions,
      info: WEAPON_ASSET_INFO[kind],
      resetParts() {
        for (const [part, node] of Object.entries(parts)) {
          node.position.copyFrom(restPositions[part as WeaponPart]!);
          node.rotation.setAll(0);
        }
      },
      dispose: () => {
        if (released) return;
        released = true;
        for (const animation of entries.animationGroups) animation.dispose();
        for (const skeleton of entries.skeletons) skeleton.dispose();
        root.dispose(false);
        this.instances.delete(instance);
      },
    };
    this.instances.add(instance);
    return instance;
  }
  dispose(): void {
    this.disposed = true;
    for (const instance of [...this.instances]) instance.dispose();
    for (const container of this.containers.values()) container.dispose();
    this.containers.clear();
    this.loading.clear();
  }
}
