import "./registrations";
import "@babylonjs/core/Engines/Extensions/engine.query";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.query";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
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
import { NarrativeWorldRenderer } from "./narrative-world";
import { WorldEventRenderer } from "./world-event-renderer";
import {
  CharacterRenderer,
  characterRig,
  type CharacterRig,
} from "./characters";
import { WeaponRenderer } from "./weapon";
import { FirstPersonMotionController } from "./first-person-motion";
import { PlayerBodyRenderer } from "./player-body";
import { CharacterAssetLibrary } from "./animated-assets";
import { EffectsRenderer } from "./effects";
import { structureModel, vehicleModel } from "./objects";
import type { GameSettings, Interaction, Feedback } from "../core/types";
import { distance } from "../core/types";
import { MotionSpring } from "../core/motion";
import { BUILDING_KINDS } from "../data/items";
import { ENEMIES } from "../data/enemies";
import type { Simulation } from "../simulation/simulation";
import type { Placement } from "../simulation/building";
export class GameRenderer {
  interactionSource = "";
  readonly scene: Scene;
  readonly camera: UniversalCamera;
  readonly materials: MaterialFactory;
  readonly lighting: LightingManager;
  readonly world: WorldRenderer;
  readonly narrativeWorld: NarrativeWorldRenderer;
  readonly eventWorld: WorldEventRenderer;
  readonly characters: CharacterRenderer;
  readonly weapon: WeaponRenderer;
  readonly motion = new FirstPersonMotionController();
  readonly body: PlayerBodyRenderer;
  readonly assets: CharacterAssetLibrary;
  readonly effects: EffectsRenderer;
  private sceneMetrics: SceneInstrumentation;
  private engineMetrics: EngineInstrumentation;
  private structures = new Map<
    string,
    {
      root: TransformNode;
      meshes: Mesh[];
      signature: string;
      door?: Mesh;
      lid?: Mesh;
      light?: PointLight;
    }
  >();
  private vehicles = new Map<string, ReturnType<typeof vehicleModel>>();
  private drops = new Map<string, Mesh>();
  private npc: CharacterRig | null = null;
  private ghost: Mesh;
  private syncTimer = 0;
  private time = 0;
  private disposers: (() => void)[] = [];
  private menuMode = true;
  private groundEye = new MotionSpring();
  private sequenceMotion: {
    kind: string;
    start: number;
    duration: number;
  } | null = null;
  sequenceAction(kind: string, duration: number) {
    this.sequenceMotion = {
      kind,
      start: this.sim.narrative.frame().elapsed,
      duration,
    };
    if (kind === "console-use")
      this.motion.feedback({
        type: "motion",
        text: "interact",
        value: duration,
      });
  }
  constructor(
    private engine: AbstractEngine,
    readonly sim: Simulation,
    readonly settings: GameSettings,
  ) {
    this.scene = new Scene(engine);
    this.sceneMetrics = new SceneInstrumentation(this.scene);
    this.sceneMetrics.captureFrameTime = true;
    this.sceneMetrics.captureAnimationsTime = true;
    this.sceneMetrics.captureRenderTargetsRenderTime = true;
    this.sceneMetrics.captureActiveMeshesEvaluationTime = true;
    this.engineMetrics = new EngineInstrumentation(engine);
    if (engine instanceof WebGPUEngine && engine.getCaps().timerQuery) {
      engine.enableGPUTimingMeasurements = false;
      engine.enableGPUTimingMeasurements = true;
    }
    this.engineMetrics.captureGPUFrameTime = true;
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
    this.assets = new CharacterAssetLibrary(this.scene);
    this.narrativeWorld = new NarrativeWorldRenderer(
      this.scene,
      this.materials,
      sim,
      this.assets,
      this.lighting,
      (a, b, c, d) => this.world.buildings.sign(a, b, c, d),
    );
    this.characters = new CharacterRenderer(
      this.scene,
      this.materials,
      sim,
      (m) => this.lighting.addCaster(m),
      (m) => this.lighting.removeCaster(m),
      this.assets,
      settings.quality,
    );
    this.weapon = new WeaponRenderer(
      this.scene,
      this.materials,
      this.camera,
      sim,
      this.motion,
      this.assets,
    );
    this.body = new PlayerBodyRenderer(this.scene, this.materials, (m) =>
      this.lighting.addCaster(m),
    );
    this.effects = new EffectsRenderer(this.scene, this.materials, sim);
    this.eventWorld = new WorldEventRenderer(
      this.scene,
      this.materials,
      sim,
      this.assets,
      this.lighting,
      this.effects,
    );
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
    await Promise.all([
      this.world.initialize(),
      this.weapon.preload(),
      this.characters.preload(),
      this.assets.preload(
        "male",
        this.settings.quality === "low" ? "low" : "high",
      ),
      this.assets.preload("male", "arms"),
      this.assets.preload("male", "body"),
    ]);
    void this.assets
      .preload("male", this.settings.quality === "low" ? "high" : "low")
      .catch(() => {});
    void this.assets.preload("female", "high").catch(() => {});
    this.body.initialize(this.assets);
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
    if (e.kind === "tree-felled" && e.position)
      this.world.fellTree(e.text, e.position);
    this.effects.event(e);
    this.motion.feedback(e);
    if (e.type === "shot" && e.kind !== "enemy" && e.kind !== "explosion") {
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
        b.kind +
        ":" +
        (["door", "gate"].includes(b.kind) ? "hinged" : b.active) +
        ":" +
        Math.floor(b.growth / 25);
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
    if (this.npc && !this.npc.skin && this.assets.ready("female")) {
      this.npc.meshes.forEach((m) => this.lighting.removeCaster(m));
      this.npc.root.dispose(false);
      this.npc = null;
    }
    if (nearNpc && !this.npc) {
      const skin = this.assets.instantiate("mira", "female", "high", "npc");
      this.npc = skin
        ? {
            root: skin.root,
            meshes: skin.meshes,
            head: skin.nodes.get("Head")!,
            limbs: [],
            skin,
          }
        : characterRig(this.scene, this.materials, "mira", "npc");
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
      if (this.npc.skin) this.npc.skin.dispose();
      else this.npc.root.dispose(false);
      this.npc = null;
    }
  }
  prepareView(dt: number, aiming: boolean, lean = 0): void {
    this.time += dt;
    const p = this.sim.state.player;
    if (this.menuMode) {
      this.camera.position.set(
        -19 + Math.sin(this.time * 0.035) * 1.6,
        3.4,
        -29,
      );
      this.camera.setTarget(new Vector3(14, 4, 20));
      this.camera.fov = (this.settings.fov * Math.PI) / 180;
      return;
    }
    const sequence = this.sim.narrative.frame();
    if (sequence.blocking && sequence.camera) {
      const camera = sequence.camera;
      this.camera.position.set(
        camera.position.x,
        camera.position.y,
        camera.position.z,
      );
      this.camera.setTarget(
        new Vector3(camera.lookAt.x, camera.lookAt.y, camera.lookAt.z),
      );
      this.camera.fov = (camera.fov * Math.PI) / 180;
      const motion = this.sequenceMotion;
      if (motion && sequence.elapsed - motion.start < motion.duration) {
        const progress = Math.max(
          0,
          (sequence.elapsed - motion.start) / motion.duration,
        );
        if (motion.kind === "wake") {
          this.camera.rotation.z = (1 - progress) * (1 - progress) * 0.24;
          this.camera.position.y -= Math.pow(1 - progress, 2) * 0.22;
        } else if (motion.kind === "console-use")
          this.camera.rotation.x += Math.sin(progress * Math.PI) * 0.035;
      } else this.sequenceMotion = null;
      this.world.focus = { ...camera.position };
      return;
    }
    this.world.focus = null;
    const pose = this.motion.update(dt, this.sim, this.settings, aiming, lean);
    if (
      !this.sim.grounded ||
      Math.abs(this.groundEye.value - p.position.y) > 0.65
    )
      this.groundEye.reset(p.position.y);
    else this.groundEye.step(p.position.y, 28, dt);
    this.camera.position.set(
      p.position.x +
        Math.cos(p.yaw) * pose.offset.x +
        Math.sin(p.yaw) * pose.offset.z,
      this.groundEye.value + pose.height + pose.offset.y,
      p.position.z -
        Math.sin(p.yaw) * pose.offset.x +
        Math.cos(p.yaw) * pose.offset.z,
    );
    this.camera.rotationQuaternion = null;
    this.camera.rotation.set(
      p.pitch - this.sim.combat.recoil * this.settings.cameraShake,
      p.yaw,
      pose.roll,
    );
    this.camera.fov = (pose.fov * Math.PI) / 180;
    this.camera.getViewMatrix(true);
  }
  update(dt: number, aiming: boolean): void {
    if (this.npc?.skin) {
      const nearby =
        distance(this.npc.root.position, this.sim.state.player.position) < 5;
      this.npc.skin.animator.sample(
        [
          {
            clip: nearby ? "Idle_Talking_Loop" : "Idle_Loop",
            phase: this.sim.state.elapsed / 3,
            weight: 1,
          },
        ],
        dt,
      );
      if (nearby)
        this.npc.root.rotation.y = Math.atan2(
          this.sim.state.player.position.x - this.npc.root.position.x,
          this.sim.state.player.position.z - this.npc.root.position.z,
        );
    }
    const cinematic = this.sim.narrative.frame().blocking;
    this.body.update(
      dt,
      this.sim,
      this.motion.pose,
      !this.menuMode && !cinematic,
    );
    this.narrativeWorld.update(dt, this.camera.position);
    this.eventWorld.update(dt);
    this.world.openContainer = this.interactionSource;
    this.world.update(dt);
    for (const [id, object] of this.structures) {
      if (object.door) {
        const door = this.sim.doors.get(id);
        if (door) object.door.rotation.y = -door.progress * Math.PI * 0.52;
      }
      if (object.lid) {
        const axis = object.lid.metadata.lidAxis as "x" | "y";
        const target =
          this.interactionSource === "structure:" + id
            ? axis === "y"
              ? -1.2
              : 1.3
            : 0;
        object.lid.rotation[axis] +=
          (target - object.lid.rotation[axis]) * (1 - Math.exp(-dt * 10));
      }
    }
    this.characters.update(this.time);
    this.weapon.update(
      dt,
      this.time,
      aiming,
      this.settings,
      !this.menuMode && !cinematic,
    );
    this.lighting.update(dt, this.time, this.sim, this.menuMode);
    this.effects.update(dt, this.time, this.lighting.wetness);
    for (const v of this.sim.state.vehicles) {
      const model = this.vehicles.get(v.id);
      if (model) {
        const roofed = this.sim.gen.pois.some(
          (p) =>
            Math.abs(v.position.x - p.x) < p.width / 2 &&
            Math.abs(v.position.z - p.z) < p.depth / 2 &&
            v.position.y + 1 < this.sim.gen.poiHeight(p) + 3.5,
        );
        model.paint.clearCoat.intensity =
          this.lighting.wetness * (roofed ? 0 : 0.45);
        model.root.position.set(
          v.position.x,
          v.position.y + Math.sin(this.time * 8) * Math.abs(v.speed) * 0.0015,
          v.position.z,
        );
        model.root.rotation.y = v.yaw;
        model.wheels.forEach((w) => (w.rotation.x += v.speed * dt * 2));
        const door = this.sim.doors.get("vehicle:" + v.id + ":left");
        if (door && model.doors[1])
          model.doors[1].rotation.y = -door.progress * 1.25;
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
    if (
      this.menuMode ||
      this.sim.building.active ||
      this.sim.narrative.frame().blocking
    )
      return null;
    const ray = new Ray(
      this.camera.position,
      this.camera.getForwardRay().direction,
      4,
    );
    const narrativeTarget = this.narrativeWorld.target(
      ray.origin,
      ray.direction,
    );
    if (narrativeTarget) return narrativeTarget;
    const eventTarget = this.eventWorld.target(ray.origin, ray.direction);
    if (eventTarget) return eventTarget;
    const tree = this.sim.collision.ray(ray.origin, ray.direction, 2.6);
    let treeTarget: Interaction | null = null;
    if (tree?.collider.id.startsWith("tree:")) {
      const c = tree.collider;
      treeTarget = {
        id: c.id,
        type: "resource",
        name: "松树",
        resource: "wood",
        position: {
          x: (c.minX + c.maxX) / 2,
          y: c.minY,
          z: (c.minZ + c.maxZ) / 2,
        },
        detail:
          this.sim.combat.equipped()?.id === "hatchet"
            ? `砍伐进度 ${this.sim.combat.treeProgress(c.id)}/4`
            : "需要装备手斧",
      };
    }
    const pick = this.scene.pickWithRay(
      ray,
      (m) =>
        m.isPickable &&
        m.isEnabled() &&
        m.isVisible &&
        !m.name.includes("first-person"),
    );
    const treeOccluded = !!(
      treeTarget &&
      pick?.hit &&
      pick.distance < tree!.distance
    );
    if (pick?.hit && pick.pickedMesh && (!treeTarget || treeOccluded)) {
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
        if (it.type === "door") {
          const door = this.sim.doors.get(it.id);
          it.detail =
            door?.status === "locked"
              ? "已上锁"
              : door?.status === "broken"
                ? "已损坏"
                : door?.status === "blocked"
                  ? "门被挡住，请让开"
                  : door?.target
                    ? "关闭"
                    : "打开";
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
      bestD = treeTarget && !treeOccluded ? Math.min(3.4, tree!.distance) : 3.4;
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
          along < Math.min(3.5, bestD) &&
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
    return best ?? (treeOccluded ? null : treeTarget);
  }
  applySettings() {
    this.lighting.settings(this.settings);
  }
  get stats() {
    const frameGPU = this.engineMetrics.gpuFrameTimeCounter.current;
    const mainGPU =
      this.engine instanceof WebGPUEngine
        ? (this.engine.gpuTimeInFrameForMainPass?.counter.current ?? 0)
        : 0;
    return {
      fps: this.engine.getFps(),
      chunks: this.world.chunks.size,
      meshes: this.scene.meshes.length,
      triangles: this.scene.meshes.reduce(
        (sum, m) => sum + m.getTotalIndices() / 3,
        0,
      ),
      drawCalls: this.engine._drawCalls?.current ?? 0,
      gpuMs: frameGPU > 0 ? frameGPU / 1e6 : mainGPU > 0 ? mainGPU / 1e6 : null,
      gpuMeasurement:
        frameGPU > 0 ? "frame" : mainGPU > 0 ? "main-pass" : "unavailable",
      sceneMs: this.sceneMetrics.frameTimeCounter.current,
      animationMs: this.sceneMetrics.animationsTimeCounter.current,
      shadowAndTargetsMs:
        this.sceneMetrics.renderTargetsRenderTimeCounter.current,
      activeMeshMs: this.sceneMetrics.activeMeshesEvaluationTimeCounter.current,
      animationGroups: this.scene.animationGroups.length,
      actorRigs: this.characters.rigs.size,
      resolution: [this.engine.getRenderWidth(), this.engine.getRenderHeight()],
    };
  }
  dispose() {
    this.sceneMetrics.dispose();
    this.engineMetrics.dispose();
    for (const off of this.disposers) off();
    this.world.dispose();
    this.narrativeWorld.dispose();
    this.eventWorld.dispose();
    this.characters.dispose();
    this.body.dispose();
    this.weapon.dispose();
    this.assets.dispose();
    this.scene.dispose();
  }
}
