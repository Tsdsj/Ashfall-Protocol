import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4, Color3 } from "@babylonjs/core/Maths/math.color";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { type Mesh } from "@babylonjs/core/Meshes/mesh";
import { type Scene } from "@babylonjs/core/scene";
import { distance, type Feedback, type Vec3 } from "../core/types";
import type { MaterialFactory } from "./materials";
import type { Simulation } from "../simulation/simulation";
interface Spark {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
  maxLife: number;
}
export class EffectsRenderer {
  private rain: ParticleSystem;
  private dust: ParticleSystem;
  private texture: Texture;
  private sparks: Spark[] = [];
  private shells: Spark[] = [];
  private gas = new Map<string, ParticleSystem>();
  private fires = new Map<
    string,
    { fire: ParticleSystem; smoke: ParticleSystem; light: PointLight }
  >();
  private tracer: Mesh[] = [];
  private decals: { mesh: Mesh; life: number }[] = [];
  private sequenceParticles: { system: ParticleSystem; life: number }[] = [];
  constructor(
    private scene: Scene,
    private mats: MaterialFactory,
    private sim: Simulation,
  ) {
    const tex = new DynamicTexture(
        "particle",
        { width: 64, height: 64 },
        scene,
        false,
      ),
      ctx = tex.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    tex.update();
    tex.hasAlpha = true;
    this.texture = tex;
    this.rain = new ParticleSystem("rain", 1800, scene);
    this.rain.particleTexture = tex;
    this.rain.emitter = new Vector3(0, 10, 0);
    this.rain.minEmitBox = new Vector3(-20, 2, -20);
    this.rain.maxEmitBox = new Vector3(20, 10, 20);
    this.rain.direction1 = new Vector3(-1, -25, -0.5);
    this.rain.direction2 = new Vector3(-2, -29, -1);
    this.rain.minEmitPower = 1;
    this.rain.maxEmitPower = 1;
    this.rain.minSize = 0.025;
    this.rain.maxSize = 0.04;
    this.rain.minScaleY = 18;
    this.rain.maxScaleY = 28;
    this.rain.minLifeTime = 0.45;
    this.rain.maxLifeTime = 0.9;
    this.rain.color1 = new Color4(0.7, 0.78, 0.78, 0.2);
    this.rain.color2 = new Color4(0.7, 0.75, 0.78, 0.35);
    this.rain.colorDead = new Color4(0.6, 0.7, 0.75, 0);
    this.rain.emitRate = 0;
    this.rain.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.rain.start();
    this.dust = new ParticleSystem("airborne-ash", 280, scene);
    this.dust.particleTexture = tex;
    this.dust.emitter = new Vector3(0, 0, 0);
    this.dust.minEmitBox = new Vector3(-22, 1, -22);
    this.dust.maxEmitBox = new Vector3(22, 11, 22);
    this.dust.direction1 = new Vector3(0.07, -0.01, 0.03);
    this.dust.direction2 = new Vector3(0.2, 0.02, 0.1);
    this.dust.minLifeTime = 7;
    this.dust.maxLifeTime = 14;
    this.dust.minSize = 0.016;
    this.dust.maxSize = 0.045;
    this.dust.emitRate = 18;
    this.dust.color1 = new Color4(0.83, 0.84, 0.7, 0.15);
    this.dust.color2 = new Color4(0.86, 0.78, 0.61, 0.13);
    this.dust.colorDead = new Color4(0.7, 0.7, 0.6, 0);
    this.dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.dust.start();
    for (let n = 0; n < 56; n++) {
      const mesh = MeshBuilder.CreateSphere(
        "impact-pool",
        { diameter: 0.035, segments: 4 },
        scene,
      );
      mesh.material = mats.simple("spark", "#d3a76e", 1.4);
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.sparks.push({ mesh, velocity: Vector3.Zero(), life: 0, maxLife: 1 });
    }
    for (let n = 0; n < 24; n++) {
      const mesh = MeshBuilder.CreateCylinder(
        "shell-pool",
        { height: 0.05, diameter: 0.014, tessellation: 6 },
        scene,
      );
      const brass = mats.simple("brass", "#bda270");
      brass.metallic = 0.8;
      brass.roughness = 0.3;
      mesh.material = brass;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.shells.push({ mesh, velocity: Vector3.Zero(), life: 0, maxLife: 2 });
    }
    for (let n = 0; n < 24; n++) {
      const mesh = MeshBuilder.CreateSphere(
        "bullet-tracer",
        { diameter: 0.016, segments: 4 },
        scene,
      );
      mesh.material = mats.simple("tracer", "#d5c69c", 1.5);
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.tracer.push(mesh);
    }
  }
  event(e: Feedback) {
    if (
      e.type === "shot" &&
      e.kind !== "melee" &&
      e.kind !== "explosion" &&
      e.kind !== "bow" &&
      e.position
    ) {
      const shell = this.shells.find((s) => s.life <= 0);
      if (shell) {
        const yaw = this.sim.state.player.yaw;
        shell.mesh.position.set(
          e.position.x + Math.cos(yaw) * 0.25,
          e.position.y - 0.15,
          e.position.z - Math.sin(yaw) * 0.25,
        );
        shell.velocity.set(Math.cos(yaw) * 1.6, 1.6, -Math.sin(yaw) * 1.6);
        shell.life = 2;
        shell.mesh.setEnabled(true);
      }
    }
    if (e.type !== "hit" && !(e.type === "shot" && e.kind === "explosion"))
      return;
    if (!e.position) return;
    const blood = e.type === "hit" && e.kind !== "wall";
    const material = e.material ?? "concrete";
    const metal = material === "metal" || e.kind === "explosion";
    if (e.type === "hit" && e.kind === "wall" && material !== "glass") {
      if (this.decals.length >= 36) this.decals.shift()!.mesh.dispose();
      const mark = MeshBuilder.CreateDisc(
        "impact-mark",
        { radius: material === "dirt" ? 0.065 : 0.035, tessellation: 9 },
        this.scene,
      );
      mark.isPickable = false;
      mark.material = this.mats.simple(
        "impact-mark-" + material,
        material === "wood"
          ? "#33251b"
          : material === "dirt"
            ? "#4e4029"
            : "#272b27",
      );
      mark.position.set(e.position.x, e.position.y, e.position.z);
      const dir = e.direction ?? { x: 0, y: -1, z: 0 };
      const normal = e.normal
        ? new Vector3(e.normal.x, e.normal.y, e.normal.z)
        : material === "dirt"
          ? new Vector3(0, 1, 0)
          : Math.abs(dir.y) > Math.max(Math.abs(dir.x), Math.abs(dir.z))
            ? new Vector3(0, -Math.sign(dir.y), 0)
            : Math.abs(dir.x) > Math.abs(dir.z)
              ? new Vector3(-Math.sign(dir.x), 0, 0)
              : new Vector3(0, 0, -Math.sign(dir.z));
      mark.position.addInPlace(normal.scale(0.008));
      mark.lookAt(mark.position.subtract(normal));
      this.decals.push({ mesh: mark, life: 45 });
    }
    for (let n = 0; n < (e.kind === "explosion" ? 24 : 7); n++) {
      const s = this.sparks.find((s) => s.life <= 0);
      if (!s) break;
      s.mesh.position.set(e.position.x, e.position.y, e.position.z);
      s.mesh.setEnabled(true);
      s.mesh.material = this.mats.simple(
        blood ? "blood" : "debris-" + material,
        blood
          ? "#633a2b"
          : metal
            ? "#d3a76e"
            : material === "wood"
              ? "#8b714b"
              : material === "dirt"
                ? "#706247"
                : material === "glass"
                  ? "#bdcfcb"
                  : "#8f9287",
        metal ? 1.4 : 0,
      );
      s.velocity.set(
        (Math.random() - 0.5) * 3,
        Math.random() * 3,
        (Math.random() - 0.5) * 3,
      );
      s.life = 0.2 + Math.random() * 0.5;
      s.maxLife = s.life;
    }
  }
  sequenceBurst(
    position: Vec3,
    effect: "dust" | "sparks" | "smoke" | "embers",
    count: number,
    duration: number,
  ) {
    if (this.sequenceParticles.length >= 6)
      this.sequenceParticles.shift()!.system.dispose(false);
    const system = new ParticleSystem(
      "sequence-" + effect,
      Math.min(250, count),
      this.scene,
    );
    system.particleTexture = this.texture;
    system.emitter = new Vector3(position.x, position.y, position.z);
    system.minEmitBox = new Vector3(-0.45, 0, -0.45);
    system.maxEmitBox = new Vector3(0.45, 0.25, 0.45);
    system.direction1 = new Vector3(-0.3, 0.5, -0.3);
    system.direction2 = new Vector3(0.5, 1.5, 0.5);
    const glowing = effect === "sparks" || effect === "embers";
    system.minSize = glowing ? 0.02 : 0.2;
    system.maxSize = glowing ? 0.07 : 1.1;
    system.minLifeTime = glowing ? 0.2 : 1;
    system.maxLifeTime = glowing ? 1 : 3;
    system.emitRate = Math.min(250, count) / Math.max(0.5, duration);
    system.color1 = glowing
      ? new Color4(1, 0.63, 0.2, 0.8)
      : new Color4(0.36, 0.38, 0.32, 0.25);
    system.color2 = glowing
      ? new Color4(1, 0.3, 0.05, 0.5)
      : new Color4(0.23, 0.26, 0.22, 0.15);
    system.colorDead = new Color4(0.1, 0.1, 0.1, 0);
    system.blendMode = glowing
      ? ParticleSystem.BLENDMODE_ADD
      : ParticleSystem.BLENDMODE_STANDARD;
    system.start();
    this.sequenceParticles.push({ system, life: duration });
  }
  private makeFire(id: string, pos: Vec3) {
    const p = new ParticleSystem("fire:" + id, 90, this.scene);
    p.particleTexture = this.texture;
    p.emitter = new Vector3(pos.x, pos.y + 0.2, pos.z);
    p.minEmitBox = new Vector3(-0.18, 0, -0.18);
    p.maxEmitBox = new Vector3(0.18, 0.07, 0.18);
    p.direction1 = new Vector3(-0.12, 0.9, -0.12);
    p.direction2 = new Vector3(0.12, 1.7, 0.12);
    p.minEmitPower = 0.7;
    p.maxEmitPower = 1.4;
    p.minLifeTime = 0.25;
    p.maxLifeTime = 0.7;
    p.minSize = 0.07;
    p.maxSize = 0.16;
    p.minScaleY = 2.4;
    p.maxScaleY = 4;
    p.emitRate = 90;
    p.addColorGradient(0, new Color4(1, 0.79, 0.23, 0.8));
    p.addColorGradient(0.45, new Color4(1, 0.22, 0.045, 0.6));
    p.addColorGradient(1, new Color4(0.2, 0.1, 0.03, 0));
    p.blendMode = ParticleSystem.BLENDMODE_ADD;
    p.start();
    const smoke = new ParticleSystem("smoke:" + id, 70, this.scene);
    smoke.particleTexture = this.texture;
    smoke.emitter = new Vector3(pos.x, pos.y + 0.65, pos.z);
    smoke.direction1 = new Vector3(0.1, 0.6, 0.1);
    smoke.direction2 = new Vector3(0.3, 1, 0.2);
    smoke.minSize = 0.25;
    smoke.maxSize = 0.8;
    smoke.minLifeTime = 2;
    smoke.maxLifeTime = 5;
    smoke.emitRate = 8;
    smoke.color1 = new Color4(0.16, 0.18, 0.16, 0.14);
    smoke.color2 = new Color4(0.25, 0.24, 0.2, 0.1);
    smoke.colorDead = new Color4(0.16, 0.17, 0.15, 0);
    smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    smoke.start();
    const light = new PointLight(
      "campfire-light:" + id,
      new Vector3(pos.x, pos.y + 1, pos.z),
      this.scene,
    );
    light.diffuse = new Color3(1, 0.46, 0.14);
    light.range = 12;
    light.intensity = 6;
    return { fire: p, smoke, light };
  }
  update(dt: number, time: number, rainAmount: number): void {
    const p = this.sim.state.player.position;
    for (const entry of this.sequenceParticles) {
      entry.life -= dt;
      if (entry.life <= 0) entry.system.emitRate = 0;
      if (entry.life < -3) entry.system.dispose(false);
    }
    this.sequenceParticles = this.sequenceParticles.filter((e) => e.life >= -3);
    for (const decal of this.decals) {
      decal.life -= dt;
      decal.mesh.visibility = Math.min(1, decal.life / 5);
      if (decal.life <= 0) decal.mesh.dispose();
    }
    this.decals = this.decals.filter((d) => d.life > 0);
    this.rain.emitter = new Vector3(p.x, p.y + 4, p.z);
    this.rain.emitRate = rainAmount * (this.sim.indoors ? 0 : 1100);
    this.dust.emitter = new Vector3(p.x, p.y, p.z);
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.setEnabled(false);
        continue;
      }
      s.velocity.y -= dt * 7;
      s.mesh.position.addInPlace(s.velocity.scale(dt));
      s.mesh.visibility = Math.min(1, (s.life / s.maxLife) * 2);
    }
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.setEnabled(false);
        continue;
      }
      s.velocity.y -= dt * 9.8;
      s.mesh.position.addInPlace(s.velocity.scale(dt));
      s.mesh.rotation.x += dt * 8;
      s.mesh.rotation.z += dt * 5;
      const ground =
        this.sim.collision.ground(
          s.mesh.position.x,
          s.mesh.position.z,
          s.mesh.position.y,
        ) + 0.012;
      if (s.mesh.position.y < ground) {
        s.mesh.position.y = ground;
        s.velocity.y = Math.abs(s.velocity.y) * 0.23;
        s.velocity.x *= 0.8;
        s.velocity.z *= 0.8;
      }
    }
    const visible = [
      ...this.sim.state.structures.filter(
        (b) =>
          b.health > 0 &&
          b.kind === "campfire" &&
          b.active &&
          distance(b.position, p) < 80,
      ),
      ...this.sim.state.events.filter(
        (e) =>
          e.kind === "wildfire" &&
          e.expires > this.sim.state.elapsed &&
          distance(e.position, p) < 120,
      ),
    ]
      .sort((a, b) => distance(a.position, p) - distance(b.position, p))
      .slice(0, 3);
    const ids = new Set(visible.map((b) => b.id));
    for (const [id, fire] of this.fires)
      if (!ids.has(id)) {
        fire.fire.dispose(false);
        fire.smoke.dispose(false);
        fire.light.dispose();
        this.fires.delete(id);
      }
    for (const b of visible) {
      let fire = this.fires.get(b.id);
      if (!fire) {
        fire = this.makeFire(b.id, b.position);
        this.fires.set(b.id, fire);
      }
      fire.light.intensity =
        5.5 + Math.sin(time * 13) * 0.6 + Math.sin(time * 21) * 0.3;
    }
    const clouds = this.sim.state.events.filter(
        (e) =>
          e.kind === "gas" &&
          e.expires > this.sim.state.elapsed &&
          distance(e.position, p) < 75,
      ),
      cloudIds = new Set(clouds.map((e) => e.id));
    for (const [id, system] of this.gas)
      if (!cloudIds.has(id)) {
        system.dispose(false);
        this.gas.delete(id);
      }
    for (const e of clouds)
      if (!this.gas.has(e.id)) {
        const system = new ParticleSystem("gas:" + e.id, 140, this.scene);
        system.particleTexture = this.texture;
        system.emitter = new Vector3(
          e.position.x,
          e.position.y + 0.5,
          e.position.z,
        );
        system.minEmitBox = new Vector3(-7, 0, -7);
        system.maxEmitBox = new Vector3(7, 0.8, 7);
        system.minSize = 1;
        system.maxSize = 3.5;
        system.minLifeTime = 3;
        system.maxLifeTime = 7;
        system.emitRate = 16;
        system.direction1 = new Vector3(-0.05, 0.08, -0.05);
        system.direction2 = new Vector3(0.1, 0.17, 0.1);
        system.color1 = new Color4(0.38, 0.45, 0.16, 0.1);
        system.color2 = new Color4(0.47, 0.5, 0.21, 0.1);
        system.colorDead = new Color4(0.25, 0.3, 0.1, 0);
        system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
        system.start();
        this.gas.set(e.id, system);
      }
    const bullets = this.sim.combat.projectiles
      .filter((b) => b.active)
      .slice(0, 24);
    for (let n = 0; n < this.tracer.length; n++) {
      const mesh = this.tracer[n]!,
        b = bullets[n];
      mesh.setEnabled(!!b);
      if (b) {
        mesh.position.set(b.position.x, b.position.y, b.position.z);
        mesh.scaling.set(1, 1, 35);
        mesh.lookAt(
          mesh.position.add(
            new Vector3(b.velocity.x, b.velocity.y, b.velocity.z),
          ),
        );
      }
    }
  }
}
