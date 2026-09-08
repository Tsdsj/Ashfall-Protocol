// Babylon's modular build needs these scene extensions registered once before construction.
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Rendering/boundingBoxRenderer";
import "@babylonjs/core/Particles/particleSystemComponent";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/core/Meshes/instancedMesh";

import "@babylonjs/core/Engines/Extensions/engine.dynamicTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture";
import "@babylonjs/core/Engines/Extensions/engine.multiRender";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender";
import "./shader-registry";
