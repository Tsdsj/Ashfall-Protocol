import "./registrations";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { type AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { type TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { MaterialFactory } from "./materials";
import { LightingManager } from "./environment";
import { WorldRenderer } from "./world-renderer";
import {
  CharacterRenderer,
  characterRig,
  type CharacterRig,
} from "./characters";
import { WeaponRenderer } from "./weapon";
import { EffectsRenderer } from "./effects";
import { structureModel, vehicleModel } from "./objects";
import type { GameSettings, Interaction, Feedback } from "../core/types";
import { distance } from "../core/types";
import { BUILDING_KINDS } from "../data/items";
import { ENEMIES } from "../data/enemies";
import type { Simulation } from "../simulation/simulation";
import type { Placement } from "../simulation/building";
export class GameRenderer {
  readonly scene: Scene;
  readonly camera: UniversalCamera;
  readonly materials: MaterialFactory;
  readonly lighting: LightingManager;
  readonly world: WorldRenderer;
  readonly characters: CharacterRenderer;
  readonly weapon: WeaponRenderer;
  readonly effects: EffectsRenderer;
  private structures = new Map<
    string,
    {
      root: TransformNode;
      meshes: Mesh[];
      signature: string;
      light?: PointLight;
    }
  >();
  private vehicles = new Map<string, ReturnType<typeof vehicleModel>>();
  private drops = new Map<string, Mesh>();
  private npc: CharacterRig | null = null;
  private ghost: Mesh;
  private syncTimer = 0;
  private time = 0;
  private damageShake = 0;
  private disposers: (() => void)[] = [];
  private menuMode = true;
  constructor(
    private engine: AbstractEngine,
    readonly sim: Simulation,
    readonly settings: GameSettings,
  ) {
    this.scene = new Scene(engine);
    this.scene.skipPointerMovePicking = true;
    // Firefox suppresses compatibility mouse events when Babylon cancels pointerdown.
    this.scene.preventDefaultOnPointerDown = false;
    this.scene.autoClear = true;
    this.camera = new UniversalCamera(
      "survivor-camera",
      new Vector3(-16, 2.8, -27),
      this.scene,
    );
    this.camera.minZ = 0.07;
    this.camera.maxZ = 1000;
    this.camera.fov = (settings.fov * Math.PI) / 180;
    this.camera.inputs.clear();
    this.camera.setTarget(new Vector3(16, 4, 22));
    this.scene.activeCamera = this.camera;
    this.materials = new MaterialFactory(this.scene);
    this.lighting = new LightingManager(
      this.scene,
      engine,
      this.camera,
      this.materials,
      settings,
    );
    this.world = new WorldRenderer(
      this.scene,
      this.materials,
      sim,
      this.lighting,
      settings.quality === "low"
        ? 0.35
        : settings.quality === "medium"
          ? 0.65
          : settings.quality === "ultra"
            ? 1.35
            : 1,
    );
    this.characters = new CharacterRenderer(
      this.scene,
      this.materials,
      sim,
      (m) => this.lighting.addCaster(m),
    );
    this.weapon = new WeaponRenderer(
      this.scene,
      this.materials,
      this.camera,
      sim,
    );
    this.effects = new EffectsRenderer(this.scene, this.materials, sim);
    this.ghost = MeshBuilder.CreateBox(
      "build-preview",
      { size: 1 },
      this.scene,
    );
    this.ghost.material = this.materials.simple(
      "preview",
      "#a8cb98",
      0.25,
      0.28,
    );
    this.ghost.isPickable = false;
    this.ghost.setEnabled(false);
    this.disposers.push(sim.bus.on((e) => this.feedback(e)));
    this.syncObjects();
    this.applySettings();
  }
  async initialize() {
    await this.world.initialize();
    this.characters.update(0);
    this.weapon.update(0, 0, false, this.settings, false);
    let timer = 0;
    try {
      await Promise.race([
        this.scene.whenReadyAsync(),
        new Promise<never>((_, reject) => {
          timer = window.setTimeout(
            () =>
              reject(
                new Error(
                  "图形初始化超时。请使用兼容渲染重试，或降低浏览器的图形负载。",
                ),
              ),
            45000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  private feedback(e: Feedback) {
    this.effects.event(e);
    if (e.type === "shot") {
      this.weapon.kick();
      if (e.kind !== "melee") {
        const dir = this.camera.getForwardRay().direction;
        this.lighting.fire(
          e.position
            ? new Vector3(e.position.x, e.position.y, e.position.z).add(
                dir.scale(0.6),
              )
            : this.camera.position.add(dir.scale(0.6)),
        );
      }
    }
    if (e.type === "damage") this.damageShake = 0.25;
  }
  setMenu(menu: boolean) {
    if (this.menuMode !== menu) {
      this.world.focus = menu ? { x: -14, y: 0, z: -28 } : null;
      void this.world.stream();
    }
    this.menuMode = menu;
    if (!menu) {
      this.camera.rotation.set(
        this.sim.state.player.pitch,
        this.sim.state.player.yaw,
        0,
      );
      this.camera.rotationQuaternion = null;
    }
  }
  private syncObjects() {
    const p = this.sim.state.player.position;
    const nearby = this.sim.state.structures.filter(
      (b) => b.health > 0 && distance(b.position, p) < 220,
    );
    const ids = new Set(nearby.map((b) => b.id));
    for (const [id, obj] of this.structures)
      if (!ids.has(id)) {
        obj.meshes.forEach((m) => this.lighting.removeCaster(m));
        obj.root.dispose(false);
        obj.light?.dispose();
        this.structures.delete(id);
      }
    for (const b of nearby) {
      const signature =
        b.kind + ":" + b.active + ":" + Math.floor(b.growth / 25);
      let obj = this.structures.get(b.id);
      if (obj && obj.signature !== signature) {
        obj.meshes.forEach((m) => this.lighting.removeCaster(m));
        obj.root.dispose(false);
        obj.light?.dispose();
        this.structures.delete(b.id);
        obj = undefined;
      }
      if (!obj) {
        const model = structureModel(this.scene, this.materials, b);
        obj = { ...model, signature };
        this.structures.set(b.id, obj);
        obj.meshes.forEach((m) => this.lighting.addCaster(m));
        if (b.kind === "light" && b.active) {
          obj.light = new PointLight(
            "base-light:" + b.id,
            new Vector3(b.position.x, b.position.y + 2.5, b.position.z),
            this.scene,
          );
          obj.light.range = 14;
          obj.light.diffuse = new Color3(1, 0.91, 0.69);
        }
      }
      if (obj.light)
        obj.light.intensity = this.sim.building.powered(b.position) ? 8 : 0;
    }
    const vehicles = this.sim.state.vehicles.filter(
      (v) => distance(v.position, p) < 240,
    );
    const vids = new Set(vehicles.map((v) => v.id));
    for (const [id, obj] of this.vehicles)
      if (!vids.has(id)) {
        obj.meshes.forEach((m) => this.lighting.removeCaster(m));
        obj.root.dispose(false);
        this.vehicles.delete(id);
      }
    for (const v of vehicles)
      if (!this.vehicles.has(v.id)) {
        const model = vehicleModel(this.scene, this.materials, v);
        this.vehicles.set(v.id, model);
        model.meshes.forEach((m) => this.lighting.addCaster(m));
      }
    const drops = Object.values(this.sim.state.containers).filter(
      (c) =>
        ["dropped", "event"].includes(c.type) && distance(c.position, p) < 160,
    );
    const dids = new Set(drops.map((c) => c.id));
    for (const [id, m] of this.drops)
      if (!dids.has(id)) {
        this.lighting.removeCaster(m);
        m.dispose();
        this.drops.delete(id);
      }
    for (const c of drops)
      if (!this.drops.has(c.id)) {
        const mesh = MeshBuilder.CreateBox(
          c.id,
          { width: 0.68, height: 0.34, depth: 0.48 },
          this.scene,
        );
        mesh.material = this.materials.surface(
          c.type === "event" ? "metal" : "cloth",
        );
        mesh.position.set(c.position.x, c.position.y, c.position.z);
        mesh.metadata = {
          interaction: {
            id: c.id,
            type: "container",
            name: c.name,
            position: c.position,
          },
        };
        this.drops.set(c.id, mesh);
        this.lighting.addCaster(mesh);
      }
    const clinic = this.sim.gen.pois.find((p) => p.id === "pine-1")!;
    const nearNpc = Math.hypot(p.x - clinic.x, p.z - clinic.z) < 180;
    if (nearNpc && !this.npc) {
      this.npc = characterRig(this.scene, this.materials, "mira", "npc");
      this.npc.root.position.set(
        clinic.x - 2,
        this.sim.gen.poiHeight(clinic),
        clinic.z - 2,
      );
      this.npc.root.rotation.y = Math.PI;
      this.npc.meshes.forEach((m) => {
        m.metadata = {
          interaction: {
            id: "mira",
            type: "npc",
            name: "米拉 · 医护员",
            position: {
              x: clinic.x - 2,
              y: this.sim.gen.poiHeight(clinic) + 1,
              z: clinic.z - 2,
            },
          },
        };
        this.lighting.addCaster(m);
      });
    }
    if (!nearNpc && this.npc) {
      this.npc.meshes.forEach((m) => this.lighting.removeCaster(m));
      this.npc.root.dispose(false);
      this.npc = null;
    }
  }
  update(dt: number, aiming: boolean, lean = 0): void {
    this.time += dt;
    this.damageShake = Math.max(0, this.damageShake - dt);
    const p = this.sim.state.player;
    if (this.menuMode) {
      this.camera.position.set(
        -19 + Math.sin(this.time * 0.035) * 1.6,
        3.4,
        -29,
      );
      this.camera.setTarget(new Vector3(14, 4, 20));
    } else {
      const bob =
        !this.settings.reducedMotion && this.sim.moving
          ? Math.sin(this.time * (this.sim.sprinting ? 13 : 9)) *
            0.035 *
            this.settings.headBob
          : 0;
      const height = p.vehicle
        ? 1.05
        : p.stance === "prone"
          ? 0.48
          : p.stance === "crouch"
            ? 1.06
            : 1.68;
      const shake = !this.settings.reducedMotion
        ? Math.sin(this.time * 49) *
          this.damageShake *
          0.05 *
          this.settings.cameraShake
        : 0;
      this.camera.position.set(
        p.position.x + Math.cos(p.yaw) * lean * 0.18,
        p.position.y + height + bob + shake,
        p.position.z - Math.sin(p.yaw) * lean * 0.18,
      );
      this.camera.rotationQuaternion = null;
      this.camera.rotation.set(
        p.pitch - this.sim.combat.recoil * this.settings.cameraShake,
        p.yaw,
        -lean * 0.06,
      );
      const scope = this.sim.combat.equipped()?.attachments.includes("scope"),
        fov =
          ((aiming
            ? scope
              ? 28
              : 53
            : this.sim.sprinting
              ? this.settings.fov + 5
              : this.settings.fov) *
            Math.PI) /
          180;
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 10);
    }
    this.world.update(dt);
    this.characters.update(this.time);
    this.weapon.update(dt, this.time, aiming, this.settings, !this.menuMode);
    this.lighting.update(dt, this.time, this.sim, this.menuMode);
    this.effects.update(dt, this.time, this.lighting.wetness);
    for (const v of this.sim.state.vehicles) {
      const model = this.vehicles.get(v.id);
      if (model) {
        model.root.position.set(
          v.position.x,
          v.position.y + Math.sin(this.time * 8) * Math.abs(v.speed) * 0.0015,
          v.position.z,
        );
        model.root.rotation.y = v.yaw;
        model.wheels.forEach((w) => (w.rotation.x += v.speed * dt * 2));
      }
    }
    this.syncTimer -= dt;
    if (this.syncTimer <= 0) {
      this.syncTimer = 0.35;
      this.syncObjects();
    }
    this.ghost.setEnabled(this.sim.building.active && !this.menuMode);
    if (this.sim.building.active && !this.menuMode) this.updateGhost();
    this.engine._drawCalls.fetchNewFrame();
    this.scene.render();
  }
  placement(): Placement {
    return this.sim.building.preview(
      this.camera.position,
      this.camera.getForwardRay().direction,
    );
  }
  private updateGhost() {
    const p = this.placement(),
      large = [
        "foundation",
        "wall",
        "window",
        "door",
        "floor",
        "roof",
        "fence",
        "gate",
      ].includes(p.kind);
    this.ghost.position.set(
      p.position.x,
      p.position.y + (large ? 1.5 : 0.5),
      p.position.z,
    );
    this.ghost.scaling.set(
      large ? 4 : p.kind === "bed" ? 1 : 1.2,
      large ? 3 : 1,
      large
        ? ["wall", "window", "door", "fence", "gate"].includes(p.kind)
          ? 0.2
          : 4
        : 1.2,
    );
    this.ghost.rotation.y = p.rotation;
    const mat = this.materials.simple("preview", "#a8cb98", 0.25, 0.28);
    mat.albedoColor = p.valid
      ? new Color3(0.45, 0.75, 0.4)
      : new Color3(0.9, 0.3, 0.2);
    mat.emissiveColor = mat.albedoColor.scale(0.15);
  }
  target(): Interaction | null {
    if (this.menuMode || this.sim.building.active) return null;
    const ray = new Ray(
      this.camera.position,
      this.camera.getForwardRay().direction,
      4,
    );
    const pick = this.scene.pickWithRay(
      ray,
      (m) =>
        m.isPickable &&
        m.isEnabled() &&
        m.isVisible &&
        !m.name.includes("first-person"),
    );
    if (pick?.hit && pick.pickedMesh) {
      const meta = pick.pickedMesh.metadata as {
        interaction?: Interaction;
        actorId?: string;
      } | null;
      if (meta?.interaction) {
        const it = { ...meta.interaction };
        if (it.type === "structure") {
          const b = this.sim.state.structures.find((b) => b.id === it.id);
          it.name =
            BUILDING_KINDS.find((k) => k[0] === b?.kind)?.[1] ?? "营地设施";
        }
        if (it.type === "container") {
          const c = this.sim.state.containers[it.id];
          it.detail = c?.searched
            ? c.inventory.items.length
              ? "已搜索"
              : "已搜空"
            : "未搜索";
        }
        return it;
      }
      if (meta?.actorId) {
        const a = this.sim.state.actors[meta.actorId];
        if (a && a.health <= 0)
          return {
            id: a.id,
            type: "corpse",
            name: ENEMIES[a.kind].name + "遗体",
            position: a.position,
          };
      }
    }
    // Small handles and documents are selectable within a narrow cone, without needing pixel-perfect aiming.
    let best: Interaction | null = null,
      bestD = 3.4;
    for (const chunk of this.world.chunks.values())
      for (const entry of chunk.interactions) {
        const it = entry.interaction;
        if (!entry.mesh.isEnabled()) continue;
        const pos = new Vector3(it.position.x, it.position.y, it.position.z),
          delta = pos.subtract(ray.origin),
          along = Vector3.Dot(delta, ray.direction);
        if (along < 0 || along > bestD) continue;
        const off = delta.subtract(ray.direction.scale(along)).length();
        if (
          off < (it.type === "story" ? 0.48 : 0.7) &&
          this.sim.collision.visible(ray.origin, it.position)
        ) {
          best = it;
          bestD = along;
        }
      }
    if (!best) {
      for (const a of Object.values(this.sim.state.actors)) {
        if (a.health > 0 || a.harvested) continue;
        const point = new Vector3(
            a.position.x - 0.4,
            a.position.y + 0.35,
            a.position.z,
          ),
          delta = point.subtract(ray.origin),
          along = Vector3.Dot(delta, ray.direction);
        if (
          along > 0 &&
          along < 3.5 &&
          delta.subtract(ray.direction.scale(along)).length() < 0.85 &&
          this.sim.collision.visible(ray.origin, point)
        )
          return {
            id: a.id,
            type: "corpse",
            name: ENEMIES[a.kind].name + "遗体",
            position: a.position,
          };
      }
    }
    return best;
  }
  applySettings() {
    this.lighting.settings(this.settings);
  }
  get stats() {
    return {
      fps: this.engine.getFps(),
      chunks: this.world.chunks.size,
      meshes: this.scene.meshes.length,
      triangles: this.scene.getTotalVertices() / 3,
      drawCalls: this.engine._drawCalls?.current ?? 0,
    };
  }
  dispose() {
    for (const off of this.disposers) off();
    this.world.dispose();
    this.characters.dispose();
    this.scene.dispose();
  }
}
