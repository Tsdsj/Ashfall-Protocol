import { ToHalfFloat } from "@babylonjs/core/Misc/textureTools";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Material } from "@babylonjs/core/Materials/material";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { type Scene } from "@babylonjs/core/scene";
import { type UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { noise, random } from "../core/random";
export type Surface =
  | "skin"
  | "soil"
  | "wood"
  | "bark"
  | "metal"
  | "rust"
  | "concrete"
  | "plaster"
  | "brick"
  | "road"
  | "stone"
  | "cloth"
  | "leather"
  | "plastic";
const colors: Record<Surface, [number, number, number]> = {
  skin: [125, 116, 93],
  soil: [80, 83, 59],
  wood: [100, 87, 65],
  bark: [64, 57, 46],
  metal: [68, 76, 73],
  rust: [109, 67, 43],
  concrete: [120, 123, 113],
  plaster: [156, 160, 143],
  brick: [112, 82, 65],
  road: [53, 57, 53],
  stone: [111, 114, 102],
  cloth: [98, 104, 83],
  leather: [68, 53, 39],
  plastic: [36, 43, 39],
};
class WindPlugin extends MaterialPluginBase {
  time = 0;
  force = 1;
  constructor(material: Material) {
    super(material, "AshfallWind", 200, {}, true, true);
  }
  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL;
  }
  override getUniforms() {
    return {
      ubo: [
        { name: "ashWindTime", size: 1, type: "float" },
        { name: "ashWindForce", size: 1, type: "float" },
      ],
      vertex: "uniform float ashWindTime; uniform float ashWindForce;",
    };
  }
  override bindForSubMesh(buffer: UniformBuffer) {
    buffer.updateFloat("ashWindTime", this.time);
    buffer.updateFloat("ashWindForce", this.force);
  }
  override getCustomCode(type: string) {
    return type === "vertex"
      ? {
          CUSTOM_VERTEX_UPDATE_WORLDPOS:
            "float windH = clamp(positionUpdated.y * 0.16, 0.0, 1.0); worldPos.x += sin(ashWindTime * 1.1 + worldPos.x * 0.13 + worldPos.z * 0.07) * windH * 0.24 * ashWindForce; worldPos.z += cos(ashWindTime * 0.8 + worldPos.z * 0.17) * windH * 0.10 * ashWindForce;",
        }
      : null;
  }
}
export class MaterialFactory {
  readonly cache = new Map<string, PBRMaterial>();
  private winds: WindPlugin[] = [];
  readonly textures: DynamicTexture[] = [];
  private photos = new Map<
    string,
    { albedo: Texture; normal: Texture; orm: Texture }
  >();
  constructor(readonly scene: Scene) {}
  surface(kind: Surface, tint?: string): PBRMaterial {
    const key = kind + ":" + (tint ?? "");
    const existing = this.cache.get(key);
    if (existing) return existing;
    const mat = new PBRMaterial(key, this.scene);
    mat.albedoColor = tint ? Color3.FromHexString(tint) : Color3.White();
    mat.roughness = kind === "metal" ? 0.42 : kind === "plastic" ? 0.65 : 0.92;
    mat.metallic = kind === "metal" ? 0.82 : kind === "rust" ? 0.45 : 0;
    const size = 256;
    const albedo = new DynamicTexture(
      key + ":albedo",
      { width: size, height: size },
      this.scene,
      true,
    );
    const normal = new DynamicTexture(
      key + ":normal",
      { width: size, height: size },
      this.scene,
      true,
    );
    const orm = new DynamicTexture(
      key + ":orm",
      { width: size, height: size },
      this.scene,
      true,
    );
    const ctx = albedo.getContext() as CanvasRenderingContext2D,
      nc = normal.getContext() as CanvasRenderingContext2D,
      oc = orm.getContext() as CanvasRenderingContext2D;
    const pixels = ctx.createImageData(size, size),
      np = nc.createImageData(size, size),
      op = oc.createImageData(size, size),
      height = new Float32Array(size * size);
    const rng = random(key);
    const base = colors[kind];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const big = noise(x / 43, y / 43, 13),
          small = noise(x / 6, y / 6, 61),
          fine = rng();
        let v = (big - 0.5) * 34 + (small - 0.5) * 22 + (fine - 0.5) * 16;
        let h = small * 0.55 + fine * 0.15;
        if (kind === "wood" || kind === "bark") {
          const streak = Math.sin(
            (x + Math.sin(y * 0.03) * 3) * 0.33 + noise(x / 12, y / 70, 3) * 7,
          );
          v += streak * 18;
          h += streak * 0.2;
          if (x % 64 < 3) {
            v -= 25;
            h -= 0.3;
          }
        }
        if (kind === "brick") {
          const row = Math.floor(y / 32),
            offset = (row % 2) * 32;
          const mortar = y % 32 < 3 || (x + offset) % 64 < 3;
          if (mortar) {
            v = 27;
            h = 0.05;
          } else {
            v += Math.sin(row * 41 + Math.floor((x + offset) / 64) * 12) * 11;
            h += 0.3;
          }
        }
        if (kind === "rust") v += (big > 0.47 ? 1 : -1) * 17;
        if (kind === "road") {
          if (fine > 0.985) v += 55;
          h = fine * 0.3;
        }
        if (kind === "cloth") {
          v += ((x % 3 === 0 ? 1 : 0) + (y % 3 === 0 ? 1 : 0)) * 9;
          h += x % 3 === 0 ? 0.15 : 0;
        }
        if (kind === "plaster" || kind === "concrete") {
          if (big < 0.28) v -= 25;
          const crack = Math.abs(
            Math.sin(x * 0.027 + y * 0.013 + noise(x / 50, y / 50, 16) * 3),
          );
          if (crack < 0.014) {
            v -= 55;
            h -= 0.4;
          }
        }
        const i = (y * size + x) * 4;
        pixels.data[i] = Math.max(0, base[0] + v);
        pixels.data[i + 1] = Math.max(0, base[1] + v);
        pixels.data[i + 2] = Math.max(0, base[2] + v * 0.8);
        pixels.data[i + 3] = 255;
        height[y * size + x] = h;
        op.data[i] = Math.max(100, 210 + h * 40);
        op.data[i + 1] = Math.max(20, mat.roughness * 220 + fine * 30);
        op.data[i + 2] = mat.metallic * 255;
        op.data[i + 3] = 255;
      }
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx =
            height[y * size + ((x + 1) % size)]! -
            height[y * size + ((x + size - 1) % size)]!,
          dy =
            height[((y + 1) % size) * size + x]! -
            height[((y + size - 1) % size) * size + x]!;
        const i = (y * size + x) * 4;
        np.data[i] = 128 - dx * 80;
        np.data[i + 1] = 128 - dy * 80;
        np.data[i + 2] = 245;
        np.data[i + 3] = 255;
      }
    ctx.putImageData(pixels, 0, 0);
    nc.putImageData(np, 0, 0);
    oc.putImageData(op, 0, 0);
    albedo.update();
    normal.update();
    orm.update();
    for (const tex of [albedo, normal, orm]) {
      tex.wrapU = Texture.WRAP_ADDRESSMODE;
      tex.wrapV = Texture.WRAP_ADDRESSMODE;
      tex.anisotropicFilteringLevel = 8;
      this.textures.push(tex);
    }
    normal.gammaSpace = false;
    orm.gammaSpace = false;
    mat.albedoTexture = albedo;
    mat.bumpTexture = normal;
    mat.bumpTexture.level = kind === "bark" ? 0.8 : 0.35;
    mat.metallicTexture = orm;
    mat.useRoughnessFromMetallicTextureGreen = true;
    mat.useMetallnessFromMetallicTextureBlue = true;
    mat.useAmbientOcclusionFromMetallicTextureRed = true;
    mat.useRoughnessFromMetallicTextureAlpha = false;
    mat.environmentIntensity = 0.7;
    mat.maxSimultaneousLights = 6;
    this.cache.set(key, mat);
    this.applyPhoto(kind, mat);
    return mat;
  }
  simple(name: string, color: string, emissive = 0, alpha = 1): PBRMaterial {
    const existing = this.cache.get(name);
    if (existing) return existing;
    const mat = new PBRMaterial(name, this.scene);
    mat.albedoColor = Color3.FromHexString(color);
    mat.roughness = 0.8;
    mat.metallic = 0;
    mat.alpha = alpha;
    if (emissive) {
      mat.emissiveColor = Color3.FromHexString(color).scale(emissive);
    }
    mat.maxSimultaneousLights = 6;
    this.cache.set(name, mat);
    return mat;
  }
  foliage(kind: "pine" | "leaf" | "grass" | "fern"): PBRMaterial {
    const key = "foliage-" + kind,
      existing = this.cache.get(key);
    if (existing) return existing;
    const mat = new PBRMaterial(key, this.scene, true);
    const tex = new DynamicTexture(
      key,
      { width: 512, height: 512 },
      this.scene,
      true,
    );
    const c = tex.getContext() as CanvasRenderingContext2D;
    c.clearRect(0, 0, 512, 512);
    const rng = random(key);
    if (kind === "pine") {
      c.strokeStyle = "#574d38";
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(256, 490);
      c.lineTo(250, 30);
      c.stroke();
      for (let n = 0; n < 34; n++) {
        const y = 50 + n * 12,
          l = 30 + (n / 34) * 180;
        for (const side of [-1, 1]) {
          const ex = 256 + side * l,
            ey = y + 40;
          c.strokeStyle = "#57543b";
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(256, y);
          c.lineTo(ex, ey);
          c.stroke();
          for (let k = 0; k < 22; k++) {
            const t = k / 22,
              px = 256 + side * l * t,
              py = y + 40 * t;
            for (let a = 0; a < 3; a++) {
              const v = Math.floor(55 + rng() * 44);
              c.strokeStyle = `rgb(${v * 0.8},${v},${v * 0.55})`;
              c.lineWidth = 1.6;
              c.beginPath();
              c.moveTo(px, py);
              c.lineTo(px + side * (10 + rng() * 17), py - 15 + rng() * 14);
              c.stroke();
            }
          }
        }
      }
    } else if (kind === "grass") {
      for (let n = 0; n < 90; n++) {
        const x = rng() * 512,
          y = 512,
          h = 80 + rng() * 380,
          w = 1 + rng() * 5,
          tilt = (rng() - 0.5) * 140;
        const v = 60 + rng() * 80;
        c.fillStyle = `rgb(${v * 0.83},${v},${v * 0.44})`;
        c.beginPath();
        c.moveTo(x - w, y);
        c.quadraticCurveTo(x + tilt * 0.25, y - h * 0.65, x + tilt, y - h);
        c.quadraticCurveTo(x + tilt * 0.2 + w, y - h * 0.45, x + w, y);
        c.fill();
        if (n % 10 === 0) {
          c.fillStyle = "#afa58c";
          for (let k = 0; k < 4; k++)
            c.fillRect(x + tilt - 2, y - h + k * 8, 4, 3);
        }
      }
    } else if (kind === "fern") {
      for (let f = 0; f < 9; f++) {
        const a = (f - 4) * 0.28;
        c.save();
        c.translate(256, 490);
        c.rotate(a);
        c.strokeStyle = "#798955";
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(12, -220, 35, -400);
        c.stroke();
        for (let j = 0; j < 19; j++) {
          const yy = -j * 20,
            ll = Math.sin((j / 19) * Math.PI) * 75;
          for (const side of [-1, 1]) {
            c.fillStyle = `rgb(${55 + rng() * 20},${78 + rng() * 25},${35 + rng() * 15})`;
            c.beginPath();
            c.moveTo((20 * j) / 19, yy);
            c.quadraticCurveTo(side * ll, yy - 22, side * ll, yy - 35);
            c.quadraticCurveTo(side * ll * 0.55, yy - 6, (20 * j) / 19, yy);
            c.fill();
          }
        }
        c.restore();
      }
    } else {
      for (let n = 0; n < 230; n++) {
        const x = 256 + (rng() - 0.5) * 420,
          y = 256 + (rng() - 0.5) * 420;
        if (Math.hypot(x - 256, y - 256) > 215) continue;
        const v = 70 + rng() * 45;
        c.fillStyle = `rgb(${v * 0.82},${v},${v * 0.49})`;
        c.beginPath();
        c.ellipse(
          x,
          y,
          12 + rng() * 16,
          6 + rng() * 10,
          rng() * Math.PI,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    }
    tex.update();
    tex.hasAlpha = true;
    tex.anisotropicFilteringLevel = 8;
    mat.albedoTexture = tex;
    if (kind === "pine") {
      const photo = new Texture(
        "/textures/generated/pine-bough.png",
        this.scene,
        false,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
        () => {
          photo.hasAlpha = true;
          photo.anisotropicFilteringLevel = 8;
          mat.albedoTexture = photo;
        },
      );
      photo.hasAlpha = true;
    }
    mat.useAlphaFromAlbedoTexture = true;
    mat.transparencyMode = Material.MATERIAL_ALPHATEST;
    mat.alphaCutOff = 0.38;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    mat.roughness = 0.95;
    mat.metallic = 0;
    mat.environmentIntensity = 1;
    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.16;
    const wind = new WindPlugin(mat);
    this.winds.push(wind);
    this.cache.set(key, mat);
    this.textures.push(tex);
    return mat;
  }
  private applyPhoto(kind: Surface, mat: PBRMaterial): void {
    const mapping: Partial<Record<Surface, string>> = {
      soil: "forest_ground_04",
      bark: "bark_brown_02",
      road: "asphalt_02",
      concrete: "concrete_wall_003",
      plaster: "concrete_wall_003",
    };
    const asset = mapping[kind];
    if (!asset) return;
    let textures = this.photos.get(asset);
    if (!textures) {
      const make = (name: string) =>
        new Texture(
          "/textures/" + asset + "/" + name + ".jpg",
          this.scene,
          false,
          false,
          Texture.TRILINEAR_SAMPLINGMODE,
        );
      textures = {
        albedo: make("albedo"),
        normal: make("normal"),
        orm: make("orm"),
      };
      textures.normal.gammaSpace = false;
      textures.orm.gammaSpace = false;
      for (const t of Object.values(textures)) t.anisotropicFilteringLevel = 8;
      this.photos.set(asset, textures);
    }
    const apply = () => {
      if (
        !textures!.albedo.isReady() ||
        !textures!.normal.isReady() ||
        !textures!.orm.isReady()
      )
        return;
      mat.albedoTexture = textures!.albedo;
      mat.bumpTexture = textures!.normal;
      mat.metallicTexture = textures!.orm;
      mat.bumpTexture.level = kind === "bark" ? 0.8 : 0.55;
      mat.roughness = 1;
      mat.metallic = 0;
    };
    for (const t of Object.values(textures)) t.onLoadObservable.addOnce(apply);
    apply();
  }
  update(time: number, wetness: number): void {
    for (const w of this.winds) {
      w.time = time;
      w.force = 1 + wetness * 1.3;
    }
    for (const [key, m] of this.cache)
      if (
        key.startsWith("road") ||
        key.startsWith("stone") ||
        key.startsWith("concrete")
      ) {
        m.roughness = 0.9 - wetness * 0.65;
        m.clearCoat.isEnabled = wetness > 0.1;
        m.clearCoat.intensity = wetness * 0.5;
        m.clearCoat.roughness = 0.18;
      }
  }
  environment(): RawCubeTexture {
    const size = 32;
    const data: Float32Array[] = [];
    for (let face = 0; face < 6; face++) {
      const pixels = new Float32Array(size * size * 4);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const f =
            face === 2 ? 1 : face === 3 ? 0.16 : 0.35 + (1 - y / size) * 0.45;
          pixels[i] = f * 0.62;
          pixels[i + 1] = f * 0.72;
          pixels[i + 2] = f * 0.82;
          pixels[i + 3] = 1;
          if (face === 0 && x > 19 && x < 24 && y > 5 && y < 10) {
            pixels[i] = 3.8;
            pixels[i + 1] = 3.3;
            pixels[i + 2] = 2.5;
          }
        }
      data.push(pixels);
    }
    const cube = new RawCubeTexture(
      this.scene,
      data.map((face) => new Uint16Array(Array.from(face, ToHalfFloat))),
      size,
      Constants.TEXTUREFORMAT_RGBA,
      Constants.TEXTURETYPE_HALF_FLOAT,
      true,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    cube.gammaSpace = false;
    cube.coordinatesMode = Texture.CUBIC_MODE;
    return cube;
  }
}
