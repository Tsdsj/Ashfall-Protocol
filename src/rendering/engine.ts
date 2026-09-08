import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { type AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
export interface EngineInfo {
  canvas: HTMLCanvasElement;
  engine: AbstractEngine;
  backend: "WebGPU" | "WebGL2";
  recommended: "low" | "medium" | "high" | "ultra";
  maxTexture: number;
}
export async function createEngine(
  canvas: HTMLCanvasElement,
  forceWebGL = false,
): Promise<EngineInfo> {
  let engine: AbstractEngine;
  let backend: "WebGPU" | "WebGL2" = "WebGL2";
  if (!forceWebGL && (await WebGPUEngine.IsSupportedAsync)) {
    let candidate: WebGPUEngine | null = null;
    try {
      candidate = new WebGPUEngine(canvas, {
        antialias: true,
        adaptToDeviceRatio: false,
        powerPreference: "high-performance",
        enableAllFeatures: true,
        setMaximumLimits: true,
      });
      await candidate.initAsync(
        { jsPath: "/vendor/glslang.js", wasmPath: "/vendor/glslang.wasm" },
        { jsPath: "/vendor/twgsl.js", wasmPath: "/vendor/twgsl.wasm" },
      );
      engine = candidate;
      backend = "WebGPU";
    } catch {
      candidate?.dispose();
      const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
      canvas.replaceWith(replacement);
      canvas = replacement;
      engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        powerPreference: "high-performance",
        disableWebGL2Support: false,
      });
    }
  } else
    engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      powerPreference: "high-performance",
      disableWebGL2Support: false,
    });
  if (engine instanceof Engine && engine.webGLVersion < 2) {
    engine.dispose();
    throw new Error(
      "此设备未提供 WebGL2。请使用支持硬件加速的现代桌面浏览器。",
    );
  }
  const maxTexture = engine.getCaps().maxTextureSize;
  return {
    canvas,
    engine,
    backend,
    recommended:
      maxTexture < 8192 ? "low" : backend === "WebGPU" ? "high" : "medium",
    maxTexture,
  };
}
