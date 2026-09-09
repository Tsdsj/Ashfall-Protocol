import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { type Camera } from "@babylonjs/core/Cameras/camera";
import { type AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { GameSettings } from "../core/types";
import type { MaterialFactory } from "./materials";
import type { Simulation } from "../simulation/simulation";
import { insideFacility } from "../world/facility";
import { cascadeCasters } from "./shadow-culling";
const skyVertex = `precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vDirection;void main(){vDirection=position;gl_Position=worldViewProjection*vec4(position,1.0);}`;
const skyFragment = `precision highp float;varying vec3 vDirection;uniform vec3 sunDirection;uniform float day;uniform float time;uniform float clouds;uniform float dusk;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=noise(p)*a;p=p*2.07+3.1;a*=.5;}return v;}
 void main(){vec3 d=normalize(vDirection);float h=max(d.y,0.);vec3 horizon=mix(vec3(.018,.027,.038),vec3(.52,.58,.52),day);vec3 zenith=mix(vec3(.008,.015,.026),vec3(.21,.34,.39),day);vec3 col=mix(horizon,zenith,pow(h,.55));float s=max(dot(d,sunDirection),0.);col+=vec3(.43,.23,.09)*pow(s,8.)*dusk;col+=vec3(1.,.87,.64)*pow(s,1400.)*day*1.8;vec2 uv=d.xz/(.3+max(d.y,.035))*1.7+vec2(time*.003,time*.001);float f=fbm(uv);float cloud=smoothstep(.52-clouds*.16,.74-clouds*.17,f)*smoothstep(-.05,.12,d.y);vec3 cloudCol=mix(vec3(.025,.037,.047),mix(vec3(.7,.73,.67),vec3(.35,.4,.39),clouds),day);col=mix(col,cloudCol,cloud*.88);float star=step(.9985,hash(floor(d.xz/(max(d.y,.01)) * 450.)))*smoothstep(.02,.3,d.y)*(1.-day)*(1.-cloud);col+=star*.55;gl_FragColor=vec4(col,1.);}`;
const waterVertex = `precision highp float;attribute vec3 position;attribute vec3 normal;uniform mat4 worldViewProjection;uniform mat4 world;uniform float time;varying vec3 vWorld;varying vec4 vClip;void main(){vec3 p=position;p.y+=sin(p.x*.18+time*.7)*.045+cos(p.z*.22+time*.9)*.03;vWorld=(world*vec4(p,1.)).xyz;vClip=worldViewProjection*vec4(p,1.);gl_Position=vClip;}`;
const waterFragment = `precision highp float;varying vec3 vWorld;varying vec4 vClip;uniform vec3 cameraPosition;uniform float time;uniform float daylight;uniform sampler2D reflectionSampler;void main(){float shore=length(vec2((vWorld.x+570.)/170.,(vWorld.z+615.)/115.));if(shore>1.)discard;vec3 n=normalize(vec3(cos(vWorld.x*.18+time*.7)*.10,1.,sin(vWorld.z*.22+time*.9)*.10));vec3 view=normalize(cameraPosition-vWorld);float f=.04+.85*pow(1.-max(dot(view,n),0.),3.);vec2 uv=vClip.xy/vClip.w*.5+.5;vec3 r=texture2D(reflectionSampler,vec2(uv.x,1.-uv.y)+n.xz*.018).rgb;vec3 deep=vec3(.055,.12,.105)*(.2+daylight*.8);float ripple=sin(vWorld.x*7.+time*2.)*sin(vWorld.z*8.-time*1.8)*.012;gl_FragColor=vec4(mix(deep,r,f)+ripple*daylight,.94*(1.-smoothstep(.94,1.,shore)));}`;
export class LightingManager {
  readonly sun: DirectionalLight;
  readonly ambient: HemisphericLight;
  readonly shadows: CascadedShadowGenerator;
  readonly flashlight: SpotLight;
  readonly flashlightShadows: ShadowGenerator;
  readonly muzzle: PointLight;
  readonly pipeline: DefaultRenderingPipeline;
  readonly sky: Mesh;
  private skyMaterial: ShaderMaterial;
  private waterMaterial: ShaderMaterial;
  private mirror: MirrorTexture;
  readonly water: Mesh;
  private ssao: SSAO2RenderingPipeline | null = null;
  wetness = 0;
  clouds = 0.5;
  daylight = 1;
  private flash = 0;
  private casters = new Set<Mesh>();
  private casterTimer = 0;
  private shadowDistance = 120;
  constructor(
    readonly scene: Scene,
    private engine: AbstractEngine,
    private camera: Camera,
    private mats: MaterialFactory,
    settings: GameSettings,
  ) {
    scene.clearColor = new Color4(0.3, 0.36, 0.32, 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0045;
    scene.fogColor = new Color3(0.36, 0.43, 0.38);
    scene.environmentTexture = mats.environment();
    scene.environmentIntensity = 0.72;
    this.sun = new DirectionalLight(
      "sun",
      new Vector3(-0.55, -0.45, 0.35),
      scene,
    );
    this.sun.position.set(150, 200, -100);
    this.sun.intensity = 3;
    this.sun.diffuse = new Color3(1, 0.87, 0.67);
    this.ambient = new HemisphericLight("sky-fill", Vector3.Up(), scene);
    this.ambient.intensity = 0.75;
    this.ambient.diffuse = new Color3(0.7, 0.8, 0.86);
    this.ambient.groundColor = new Color3(0.21, 0.24, 0.18);
    this.shadows = new CascadedShadowGenerator(
      settings.quality === "ultra"
        ? 2048
        : settings.quality === "low"
          ? 512
          : 1024,
      this.sun,
    );
    this.shadows.numCascades = 2;
    this.shadows.shadowMaxZ = 140;
    this.shadowDistance =
      settings.quality === "low"
        ? 55
        : settings.quality === "medium"
          ? 85
          : settings.quality === "ultra"
            ? 170
            : 120;
    this.shadows.shadowMaxZ = this.shadowDistance + 20;
    this.shadows.lambda = 0.7;
    this.shadows.cascadeBlendPercentage = 0.15;
    this.shadows.stabilizeCascades = true;
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.bias = 0.002;
    this.shadows.normalBias = 0.025;
    this.shadows.darkness = 0.2;
    this.shadows.filteringQuality = 1;
    const sunMap = this.shadows.getShadowMap()!;
    sunMap.getCustomRenderList = (cascade, meshes, length) => {
      const matrix = this.shadows.getCascadeTransformMatrix(cascade);
      return matrix && meshes ? cascadeCasters(matrix, meshes, length) : null;
    };
    this.flashlight = new SpotLight(
      "flashlight",
      Vector3.Zero(),
      new Vector3(0, 0, 1),
      Math.PI / 3.4,
      12,
      scene,
    );
    this.flashlight.intensity = 0;
    this.flashlight.diffuse = new Color3(1, 0.96, 0.84);
    this.flashlight.range = 45;
    this.flashlightShadows = new ShadowGenerator(
      settings.quality === "low"
        ? 256
        : settings.quality === "ultra"
          ? 1024
          : 512,
      this.flashlight,
    );
    this.flashlightShadows.usePercentageCloserFiltering =
      settings.quality !== "low";
    this.flashlightShadows.bias = 0.0015;
    this.flashlightShadows.normalBias = 0.012;
    this.flashlightShadows.darkness = 0.12;
    this.muzzle = new PointLight("muzzle", Vector3.Zero(), scene);
    this.muzzle.intensity = 0;
    this.muzzle.range = 9;
    this.muzzle.diffuse = new Color3(1, 0.52, 0.13);
    this.sky = MeshBuilder.CreateSphere(
      "atmosphere",
      { diameter: 1800, segments: 24, sideOrientation: Mesh.BACKSIDE },
      scene,
    );
    this.sky.isPickable = false;
    this.sky.infiniteDistance = true;
    this.sky.applyFog = false;
    this.skyMaterial = new ShaderMaterial(
      "atmosphere-shader",
      scene,
      { vertexSource: skyVertex, fragmentSource: skyFragment },
      {
        attributes: ["position"],
        uniforms: [
          "worldViewProjection",
          "sunDirection",
          "day",
          "time",
          "clouds",
          "dusk",
        ],
      },
    );
    this.skyMaterial.backFaceCulling = false;
    this.skyMaterial.disableDepthWrite = true;
    this.sky.material = this.skyMaterial;
    this.water = MeshBuilder.CreateGround(
      "lake-water",
      { width: 340, height: 230, subdivisions: 32 },
      scene,
    );
    this.water.position.set(-570, -4.5, -615);
    this.water.isPickable = true;
    this.water.metadata = {
      interaction: {
        id: "lake",
        type: "water",
        name: "赤杨水库",
        position: { x: -570, y: -4.5, z: -615 },
        resource: "water",
      },
    };
    this.mirror = new MirrorTexture("lake-reflection", 256, scene, true);
    this.mirror.mirrorPlane = new Plane(0, -1, 0, -4.5);
    this.mirror.level = 0.7;
    this.mirror.adaptiveBlurKernel = 6;
    this.mirror.renderList = [this.sky];
    this.mirror.refreshRate = 2;
    this.waterMaterial = new ShaderMaterial(
      "water-shader",
      scene,
      { vertexSource: waterVertex, fragmentSource: waterFragment },
      {
        attributes: ["position", "normal"],
        uniforms: [
          "worldViewProjection",
          "world",
          "time",
          "cameraPosition",
          "daylight",
        ],
        samplers: ["reflectionSampler"],
        needAlphaBlending: true,
      },
    );
    this.waterMaterial.setTexture("reflectionSampler", this.mirror);
    this.waterMaterial.backFaceCulling = false;
    this.water.material = this.waterMaterial;
    this.pipeline = new DefaultRenderingPipeline("ashfall-post", true, scene, [
      camera,
    ]);
    this.pipeline.fxaaEnabled = true;
    this.pipeline.samples = 1;
    this.pipeline.bloomEnabled = settings.quality !== "low";
    this.pipeline.bloomThreshold = 1.15;
    this.pipeline.bloomWeight = 0.16;
    this.pipeline.bloomKernel = 32;
    this.pipeline.imageProcessingEnabled = true;
    const img = scene.imageProcessingConfiguration;
    img.toneMappingEnabled = true;
    img.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    img.exposure = 1.25;
    img.contrast = 1.07;
    img.vignetteEnabled = true;
    img.vignetteWeight = 0.65;
    img.vignetteStretch = 0.12;
    img.vignetteColor = new Color4(0.03, 0.04, 0.03, 1);
    this.pipeline.grainEnabled = true;
    this.pipeline.grain.intensity = 1.3;
    this.pipeline.grain.animated = true;
    if (settings.quality === "high" || settings.quality === "ultra") {
      this.ssao = new SSAO2RenderingPipeline(
        "ambient-occlusion",
        scene,
        { ssaoRatio: 0.5, blurRatio: 0.5 },
        [camera],
      );
      this.ssao.radius = 1.3;
      this.ssao.totalStrength = 0.55;
      this.ssao.samples = 8;
      this.ssao.maxZ = 80;
      this.ssao.expensiveBlur = false;
    }
  }
  addCaster(mesh: Mesh) {
    if (mesh.name.includes("grass") || mesh.name.includes("fern")) return;
    this.shadows.addShadowCaster(mesh);
    this.casters.add(mesh);
    this.casterTimer = 0;
    if (!mesh.name.startsWith("view-") && !mesh.name.includes("first-person"))
      this.flashlightShadows.addShadowCaster(mesh);
    if (this.mirror.renderList && this.mirror.renderList.length < 90)
      this.mirror.renderList.push(mesh);
  }
  removeCaster(mesh: Mesh) {
    this.casters.delete(mesh);
    this.shadows.removeShadowCaster(mesh);
    this.flashlightShadows.removeShadowCaster(mesh);
    if (this.mirror.renderList)
      this.mirror.renderList = this.mirror.renderList.filter((m) => m !== mesh);
  }
  fire(position: Vector3) {
    this.muzzle.position.copyFrom(position);
    this.flash = 0.08;
  }
  update(dt: number, time: number, sim: Simulation, menu = false): void {
    this.casterTimer -= dt;
    if (this.casterTimer <= 0) {
      this.casterTimer = 0.45;
      const near = (mesh: Mesh, range: number) => {
        if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible)
          return false;
        const sphere = mesh.getBoundingInfo().boundingSphere;
        return (
          Vector3.Distance(sphere.centerWorld, this.camera.position) -
            sphere.radiusWorld <
          range
        );
      };
      const all = [...this.casters];
      const sunMap = this.shadows.getShadowMap(),
        handMap = this.flashlightShadows.getShadowMap();
      if (sunMap)
        sunMap.renderList = all.filter((m) => near(m, this.shadowDistance));
      if (handMap) handMap.renderList = all.filter((m) => near(m, 65));
    }
    const hour = sim.state.time,
      angle = ((hour - 6) / 24) * Math.PI * 2,
      alt = Math.sin(angle);
    const daylight = Math.max(0.025, Math.min(1, (alt + 0.06) * 1.8));
    this.daylight = daylight;
    const cloudTarget = {
      clear: 0.12,
      cloudy: 0.43,
      overcast: 0.83,
      rain: 0.87,
      storm: 1,
      fog: 0.65,
    }[sim.state.weather];
    this.clouds += (cloudTarget - this.clouds) * Math.min(1, dt * 0.12);
    const wetTarget =
      sim.state.weather === "rain" || sim.state.weather === "storm" ? 1 : 0;
    this.wetness += (wetTarget - this.wetness) * Math.min(1, dt * 0.06);
    const sunPos = new Vector3(
      Math.cos(angle) * 0.7,
      Math.max(0.14, Math.abs(alt)),
      Math.sin(angle) * 0.45,
    ).normalize();
    this.sun.direction.copyFrom(sunPos.scale(-1));
    this.sun.position.copyFrom(this.camera.position.add(sunPos.scale(150)));
    const dusk = Math.max(0, 1 - Math.abs(alt) * 2);
    this.sun.diffuse = Color3.Lerp(
      new Color3(0.56, 0.67, 0.83),
      Color3.Lerp(
        new Color3(1, 0.91, 0.73),
        new Color3(1, 0.58, 0.3),
        dusk * 0.8,
      ),
      daylight,
    );
    this.sun.intensity = daylight * (2.3 - this.clouds * 1.35) + 0.035;
    const underground = insideFacility(
      sim.gen,
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
    );
    const sunMap = this.shadows.getShadowMap(),
      sunRate = underground ? 0 : 1;
    if (sunMap && sunMap.refreshRate !== sunRate) sunMap.refreshRate = sunRate;
    if (underground) this.sun.intensity = 0;
    this.ambient.intensity =
      (0.18 + daylight * 0.58) * (sim.indoors && !menu ? 0.63 : 1);
    this.scene.environmentIntensity =
      (0.08 + daylight * 0.65) * (sim.indoors && !menu ? 0.65 : 1);
    const fogTarget =
      sim.state.weather === "fog"
        ? 0.013
        : sim.state.weather === "storm"
          ? 0.0085
          : 0.0032 + this.clouds * 0.002;
    this.scene.fogDensity +=
      (fogTarget - this.scene.fogDensity) * Math.min(1, dt * 0.3);
    this.scene.fogColor = Color3.Lerp(
      new Color3(0.019, 0.034, 0.047),
      new Color3(0.43, 0.49, 0.44),
      daylight,
    );
    this.scene.imageProcessingConfiguration.exposure =
      1.25 + (sim.indoors && !menu ? 0.12 : 0);
    this.skyMaterial.setVector3("sunDirection", sunPos);
    this.skyMaterial.setFloat("day", daylight);
    this.skyMaterial.setFloat("time", time);
    this.skyMaterial.setFloat("clouds", this.clouds);
    this.skyMaterial.setFloat("dusk", dusk);
    this.flashlight.position.copyFrom(this.camera.position);
    this.flashlight.direction.copyFrom(this.camera.getForwardRay().direction);
    const held = sim.combat.equipped(),
      torch = held?.id === "torch" && held.durability > 0;
    this.flashlight.intensity = !menu
      ? torch
        ? 14
        : sim.state.player.flashlight
          ? held?.attachments.includes("weaponlight")
            ? 28
            : 18
          : 0
      : 0;
    this.flashlight.range = torch
      ? 12
      : held?.attachments.includes("weaponlight")
        ? 65
        : 45;
    const charge = sim.state.player.flashlightCharge;
    if (!torch && charge < 15) this.flashlight.intensity *= 0.6 + charge / 37.5;
    if (
      !torch &&
      charge < 7 &&
      Math.sin(time * 8.7) * Math.sin(time * 2.3) > 0.84
    )
      this.flashlight.intensity *= 0.25;
    // Keep the shadow sampler contract stable across WebGPU material variants.
    // An unlit flashlight reuses one cached shadow map instead of rebuilding it.
    const flashlightMap = this.flashlightShadows.getShadowMap();
    const flashlightRate = this.flashlight.intensity > 0 ? 1 : 0;
    if (flashlightMap && flashlightMap.refreshRate !== flashlightRate)
      flashlightMap.refreshRate = flashlightRate;
    this.flashlight.diffuse = torch
      ? new Color3(1, 0.58, 0.23)
      : new Color3(1, 0.96, 0.84);
    this.flash = Math.max(0, this.flash - dt);
    this.muzzle.intensity = this.flash > 0 ? 12 : 0;
    if (sim.state.weather === "storm" && Math.sin(time * 0.64) > 0.9998) {
      this.sun.intensity += 4;
    }
    if (
      this.camera.position.y < -4.5 &&
      sim.gen.isWater(this.camera.position.x, this.camera.position.z)
    ) {
      this.scene.fogColor = new Color3(0.025, 0.13, 0.14);
      this.scene.fogDensity = 0.13;
      this.scene.imageProcessingConfiguration.exposure = 0.75;
    }
    this.waterMaterial.setFloat("time", time);
    this.waterMaterial.setFloat("daylight", daylight);
    this.waterMaterial.setVector3("cameraPosition", this.camera.position);
    this.mats.update(time, this.wetness);
    const waterVisible =
      Math.hypot(this.camera.position.x + 570, this.camera.position.z + 615) <
      650;
    this.water.setEnabled(waterVisible);
    const mirrorRate = waterVisible ? 2 : 0;
    if (this.mirror.refreshRate !== mirrorRate)
      this.mirror.refreshRate = mirrorRate;
  }
  settings(settings: GameSettings) {
    this.engine.setHardwareScalingLevel(
      1 /
        (Math.min(
          devicePixelRatio,
          settings.quality === "ultra"
            ? 1.5
            : settings.quality === "high"
              ? 1.25
              : 1,
        ) *
          settings.resolution),
    );
    this.pipeline.bloomEnabled = settings.quality !== "low";
    this.pipeline.grainEnabled = !settings.reducedMotion;
  }
}
