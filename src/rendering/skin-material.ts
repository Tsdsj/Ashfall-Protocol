import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";

/** UV-anchored pallor and bruising preserve the artist's normal map and anatomical detail. */
export class InfectedSkinMaterial extends MaterialPluginBase {
  constructor(material: PBRMaterial) {
    super(material, "AshfallInfectedSkin", 190, {}, true, true);
  }
  override isCompatible(_language: ShaderLanguage) {
    return true;
  }
  override getCustomCode(type: string, language = ShaderLanguage.GLSL) {
    if (type !== "fragment") return null;
    if (language === ShaderLanguage.WGSL)
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `fn ashSkinHash(p: vec2f)->f32 { return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453); }
fn ashSkinNoise(p: vec2f)->f32 { let i=floor(p);let f=fract(p);let u=f*f*(vec2f(3.0)-2.0*f);return mix(mix(ashSkinHash(i),ashSkinHash(i+vec2f(1.0,0.0)),u.x),mix(ashSkinHash(i+vec2f(0.0,1.0)),ashSkinHash(i+vec2f(1.0)),u.x),u.y); }`,
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: `#ifdef ALBEDO
let ashUV=fragmentInputs.vAlbedoUV;
let ashLuma=dot(surfaceAlbedo,vec3f(0.299,0.587,0.114));
let ashPale=mix(surfaceAlbedo,vec3f(ashLuma),0.78)*vec3f(1.02,1.07,0.94);
let ashBruise=smoothstep(0.54,0.85,ashSkinNoise(ashUV*43.0)*0.72+ashSkinNoise(ashUV*127.0)*0.28);
surfaceAlbedo=mix(ashPale,ashPale*vec3f(0.47,0.29,0.32),ashBruise*0.68);
#endif`,
      };
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `float ashSkinHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float ashSkinNoise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);return mix(mix(ashSkinHash(i),ashSkinHash(i+vec2(1.0,0.0)),u.x),mix(ashSkinHash(i+vec2(0.0,1.0)),ashSkinHash(i+vec2(1.0)),u.x),u.y);}`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `#ifdef ALBEDO
vec2 ashUV=vAlbedoUV;
float ashLuma=dot(surfaceAlbedo,vec3(0.299,0.587,0.114));
vec3 ashPale=mix(surfaceAlbedo,vec3(ashLuma),0.78)*vec3(1.02,1.07,0.94);
float ashBruise=smoothstep(0.54,0.85,ashSkinNoise(ashUV*43.0)*0.72+ashSkinNoise(ashUV*127.0)*0.28);
surfaceAlbedo=mix(ashPale,ashPale*vec3(0.47,0.29,0.32),ashBruise*0.68);
#endif`,
    };
  }
}
