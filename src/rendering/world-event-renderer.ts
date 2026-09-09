import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  worldEventScenes,
  worldEventInteractions,
  type EventEntity,
} from "../simulation/world-events";
import type { Simulation } from "../simulation/simulation";
import type { Interaction } from "../core/types";
import { ModelBatch } from "./geometry";
import type { MaterialFactory } from "./materials";
import type { LightingManager } from "./environment";
import type { CharacterAssetLibrary, AnimatedRig } from "./animated-assets";
import type { EffectsRenderer } from "./effects";
export class WorldEventRenderer {
  private entries = new Map<
    string,
    {
      root: TransformNode;
      meshes: Mesh[];
      rig?: AnimatedRig;
      lid?: Mesh;
      nextBurst: number;
      last: Vector3;
    }
  >();
  private time = 0;
  constructor(
    private scene: Scene,
    private mats: MaterialFactory,
    private sim: Simulation,
    private assets: CharacterAssetLibrary,
    private lighting: LightingManager,
    private effects: EffectsRenderer,
  ) {}
  update(dt: number) {
    this.time += dt;
    const p = this.sim.state.player.position,
      wanted = new Set<string>();
    const interactions = worldEventInteractions(this.sim);
    for (const event of worldEventScenes(this.sim))
      for (const entity of event.entities) {
        if (
          entity.model === "vehicle" ||
          Math.hypot(entity.position.x - p.x, entity.position.z - p.z) > 170
        )
          continue;
        wanted.add(entity.id);
        let entry = this.entries.get(entity.id);
        if (!entry) {
          entry = this.create(entity);
          if (!entry) continue;
          this.entries.set(entity.id, entry);
        }
        entry.root.position.set(
          entity.position.x,
          entity.position.y,
          entity.position.z,
        );
        entry.root.rotation.y = entity.rotation;
        if (entry.rig) {
          const walking = entity.state === "walking",
            dead = entity.state === "dead";
          const travel = entry.root.position.subtract(entry.last);
          if (walking && travel.lengthSquared() > 0.0001)
            entry.root.rotation.y = Math.atan2(travel.x, travel.z);
          const clip = dead
            ? "Death01"
            : entity.state === "wounded"
              ? "Sitting_Idle_Loop"
              : walking
                ? "Walk_Loop"
                : "Idle_Talking_Loop";
          entry.rig.animator.sample(
            [
              {
                clip,
                weight: 1,
                phase: dead
                  ? 0.999
                  : this.sim.state.elapsed / (walking ? 1.2 : 3),
                loop: !dead,
              },
            ],
            dt,
          );
          entry.last.copyFrom(entry.root.position);
        }
        const target = interactions
          .filter((i) => i.id.startsWith("event:" + event.id + ":"))
          .sort(
            (a, b) =>
              Math.hypot(
                a.position.x - entity.position.x,
                a.position.z - entity.position.z,
              ) -
              Math.hypot(
                b.position.x - entity.position.x,
                b.position.z - entity.position.z,
              ),
          )[0];
        for (const mesh of entry.meshes)
          mesh.metadata = target ? { interaction: target } : null;
        if (entry.lid)
          entry.lid.rotation.x +=
            (Number(entity.state === "open") * 1.2 - entry.lid.rotation.x) *
            (1 - Math.exp(-dt * 9));
        if (entity.model === "warning-beacon")
          entry.root.setEnabled(
            entity.state === "active" && Math.sin(this.time * 7) > -0.3,
          );
        if (
          (entity.model === "smoke" || entity.model === "sparks") &&
          entity.state === "active" &&
          entry.nextBurst < this.time
        ) {
          this.effects.sequenceBurst(
            entity.position,
            entity.model,
            entity.model === "smoke" ? 20 : 8,
            2,
          );
          entry.nextBurst = this.time + 2;
        }
      }
    for (const [id, entry] of this.entries)
      if (!wanted.has(id)) {
        entry.meshes.forEach((m) => this.lighting.removeCaster(m));
        if (entry.rig) entry.rig.dispose();
        else entry.root.dispose(false);
        this.entries.delete(id);
      }
  }
  private create(
    entity: EventEntity,
  ):
    | {
        root: TransformNode;
        meshes: Mesh[];
        rig?: AnimatedRig;
        lid?: Mesh;
        nextBurst: number;
        last: Vector3;
      }
    | undefined {
    if (entity.model === "survivor") {
      const rig = this.assets.instantiate(entity.id, "male", "high", "npc");
      if (!rig) return;
      rig.meshes.forEach((m) => this.lighting.addCaster(m));
      return {
        root: rig.root,
        meshes: rig.meshes,
        rig,
        nextBurst: 0,
        last: new Vector3(
          entity.position.x,
          entity.position.y,
          entity.position.z,
        ),
      };
    }
    const root = new TransformNode(entity.id, this.scene),
      b = new ModelBatch(this.scene, entity.id),
      metal = this.mats.surface("metal", "#949a91"),
      rust = this.mats.surface("rust"),
      dark = this.mats.surface("plastic");
    let lid: Mesh | undefined;
    if (entity.model === "cargo") {
      b.box("floor", [1.6, 0.1, 1.2], [0, 0.06, 0], rust);
      for (const side of [-1, 1]) {
        b.box("side", [0.08, 0.75, 1.2], [side * 0.76, 0.42, 0], metal);
        b.box("end", [1.6, 0.75, 0.08], [0, 0.42, side * 0.56], metal);
      }
      lid = b.box("lid", [1.6, 0.08, 1.2], [0, 0.85, 0], metal);
      b.take(lid);
      lid.setPivotPoint(new Vector3(0, 0, 0.6));
      lid.parent = root;
    } else if (entity.model === "drone-wreck") {
      b.beveledBox(
        "fuselage",
        [0.75, 0.8, 3.2],
        [0, 0.55, 0],
        metal,
        [0.07, 0, 0.1],
      );
      for (const side of [-1, 1]) {
        b.beveledBox(
          "snapped-wing",
          [2.6, 0.09, 0.8],
          [side * 1.7, 0.3, -0.25],
          metal,
          [0, side * 0.13, side * -0.11],
        );
        b.cylinder("engine-pod", 0.9, 0.34, [side * 1.7, 0.38, 0.25], rust, [
          Math.PI / 2,
          0,
          0,
        ]);
        b.box("tail-fin", [0.06, 0.9, 0.5], [side * 0.4, 0.8, -1.35], metal, [
          0,
          0,
          side * 0.3,
        ]);
      }
      b.sphere("sensor", [0.32, 0.32, 0.32], [0, 0.25, 1.45], dark, 12);
      b.beveledBox(
        "battery",
        [0.5, 0.38, 0.6],
        [-1.2, 0.2, 0.7],
        this.mats.surface("metal", "#5d6c4f"),
      );
      for (let n = 0; n < 6; n++)
        b.box(
          "debris",
          [0.4, 0.06, 0.13],
          [(n - 3) * 0.53, 0.08, n % 2 ? 0.95 : -0.9],
          metal,
          [0, n * 0.6, 0],
        );
    } else if (entity.model === "warning-beacon") {
      b.cylinder("base", 0.12, 0.28, [0, 0.08, 0], dark);
      b.cylinder(
        "lamp",
        0.2,
        0.2,
        [0, 0.23, 0],
        this.mats.simple("beacon-orange", "#ef7c33", 2.5),
      );
    }
    const meshes = [...b.finish(root), ...(lid ? [lid] : [])];
    for (const mesh of meshes) {
      mesh.unfreezeWorldMatrix();
      this.lighting.addCaster(mesh);
    }
    return { root, meshes, lid, nextBurst: 0, last: Vector3.Zero() };
  }
  target(origin: Vector3, direction: Vector3): Interaction | null {
    let selected: Interaction | null = null,
      nearest = 3.5;
    for (const interaction of worldEventInteractions(this.sim)) {
      const target = new Vector3(
          interaction.position.x,
          interaction.position.y + 0.8,
          interaction.position.z,
        ),
        delta = target.subtract(origin),
        along = Vector3.Dot(delta, direction);
      if (
        along > 0 &&
        along < nearest &&
        delta.subtract(direction.scale(along)).length() < 0.72 &&
        this.sim.collision.visible(origin, target)
      ) {
        nearest = along;
        selected = interaction;
      }
    }
    return selected;
  }
  dispose() {
    for (const entry of this.entries.values())
      if (entry.rig) entry.rig.dispose();
      else entry.root.dispose(false);
    this.entries.clear();
  }
}
