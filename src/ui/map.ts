import { REGIONS } from "../world/generator";
import type { Simulation } from "../simulation/simulation";
import {
  exploredCells,
  explorationCell,
  recordExploration,
} from "../simulation/exploration";

export interface MapView {
  zoom: number;
  panX: number;
  panY: number;
}
export const MAP_SIZE = 960;
export const defaultMapView = (): MapView => ({ zoom: 1, panX: 0, panY: 0 });
export function clampMapView(view: MapView): MapView {
  const zoom = Math.max(1, Math.min(8, view.zoom));
  const limit = MAP_SIZE * (zoom - 1);
  return {
    zoom,
    panX: Math.max(-limit, Math.min(0, view.panX)),
    panY: Math.max(-limit, Math.min(0, view.panY)),
  };
}
export function worldToMap(
  x: number,
  z: number,
  view: MapView = defaultMapView(),
) {
  return {
    x: (x / 4096 + 0.5) * MAP_SIZE * view.zoom + view.panX,
    y: (0.5 - z / 4096) * MAP_SIZE * view.zoom + view.panY,
  };
}
export function mapToWorld(
  x: number,
  y: number,
  view: MapView = defaultMapView(),
) {
  return {
    x: ((x - view.panX) / (MAP_SIZE * view.zoom) - 0.5) * 4096,
    z: (0.5 - (y - view.panY) / (MAP_SIZE * view.zoom)) * 4096,
  };
}
export function zoomMapAt(
  view: MapView,
  factor: number,
  x: number,
  y: number,
): MapView {
  const zoom = Math.max(1, Math.min(8, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return clampMapView({
    zoom,
    panX: x - (x - view.panX) * ratio,
    panY: y - (y - view.panY) * ratio,
  });
}
export function clientToMap(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
) {
  const side = Math.min(rect.width, rect.height);
  return {
    x: ((clientX - rect.left - (rect.width - side) / 2) / side) * MAP_SIZE,
    y: ((clientY - rect.top - (rect.height - side) / 2) / side) * MAP_SIZE,
  };
}
const terrainCache = new WeakMap<Simulation["gen"], HTMLCanvasElement>();
function drawTerrain(canvas: HTMLCanvasElement, sim: Simulation): void {
  const size = 960;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const toMap = (n: number) => (n / 4096 + 0.5) * size;
  ctx.fillStyle = "#28362c";
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 5)
    for (let x = 0; x < size; x += 5) {
      const wx = (x / size - 0.5) * 4096,
        wz = (0.5 - y / size) * 4096;
      const h = sim.gen.baseHeight(wx, wz);
      const level = 36 + h * 0.55;
      ctx.fillStyle = `rgb(${level + 3},${level + 12},${level + 1})`;
      ctx.fillRect(x, y, 5, 5);
      if (Math.abs(h % 3) < 0.3) {
        ctx.fillStyle = "rgba(161,178,140,.13)";
        ctx.fillRect(x, y, 5, 5);
      }
    }
  const mz = (z: number) => size - toMap(z);
  ctx.fillStyle = "#375e5b";
  ctx.beginPath();
  ctx.ellipse(
    toMap(-570),
    mz(-615),
    (170 / 4096) * size,
    (115 / 4096) * size,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.strokeStyle = "#99957b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let z = -2048; z <= 2048; z += 16) {
    const x = -9 + Math.sin(z * 0.003) * 12;
    if (z === -2048) ctx.moveTo(toMap(x), mz(z));
    else ctx.lineTo(toMap(x), mz(z));
  }
  ctx.stroke();
  for (const z of [225, -420]) {
    ctx.beginPath();
    ctx.moveTo(0, mz(z));
    ctx.lineTo(size, mz(z));
    ctx.stroke();
  }
  for (let n = 0; n <= 16; n++) {
    const t = (n / 16) * size;
    ctx.strokeStyle = "rgba(190,205,169,.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(t, 0);
    ctx.lineTo(t, size);
    ctx.moveTo(0, t);
    ctx.lineTo(size, t);
    ctx.stroke();
    if (n < 16) {
      ctx.fillStyle = "#7d9079";
      ctx.font = "11px monospace";
      ctx.fillText(String.fromCharCode(65 + n), t + 8, 16);
      ctx.fillText(String(n + 1).padStart(2, "0"), 8, t + 34);
    }
  }
  for (const region of REGIONS) {
    ctx.fillStyle = region.color;
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(region.name, toMap(region.x) + 10, mz(region.z) - 25);
    ctx.fillStyle = "#8e9b83";
    ctx.font = "9px monospace";
    ctx.fillText(region.english, toMap(region.x) + 10, mz(region.z) - 11);
  }
}
export function drawMap(
  canvas: HTMLCanvasElement,
  sim: Simulation,
  view: MapView = defaultMapView(),
): void {
  const size = MAP_SIZE;
  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  let terrain = terrainCache.get(sim.gen);
  if (!terrain) {
    terrain = document.createElement("canvas");
    drawTerrain(terrain, sim);
    terrainCache.set(sim.gen, terrain);
  }
  const toMap = (n: number) => (n / 4096 + 0.5) * size;
  const mz = (z: number) => size - toMap(z);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.zoom, view.zoom);
  ctx.drawImage(terrain, 0, 0);
  recordExploration(sim.state);
  const explored = exploredCells(sim.state, sim.gen.pois);
  ctx.fillStyle = "#18251f";
  for (let z = 0; z < 64; z++)
    for (let x = 0; x < 64; x++)
      if (!explored.has(z * 64 + x))
        ctx.fillRect(x * 15, (63 - z) * 15, 15, 15);
  for (const poi of sim.gen.pois) {
    if (!explored.has(explorationCell(poi.x, poi.z))) continue;
    const discovered = sim.state.discovered.includes(poi.id);
    ctx.fillStyle = discovered ? "#c9c6a0" : "#56664f";
    const x = toMap(poi.x),
      y = mz(poi.z);
    ctx.fillRect(x - 3, y - 3, 6, 6);
    if (discovered && poi.story) {
      ctx.strokeStyle = "#c9c6a0";
      ctx.strokeRect(x - 5, y - 5, 10, 10);
    }
  }
  for (const route of sim.narrative.unlockedRoutes) {
    ctx.strokeStyle = "#a8c3a0";
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    route.anchors.forEach((anchor, index) => {
      const p = sim.narrative.resolveAnchor(anchor);
      if (index) ctx.lineTo(toMap(p.x), mz(p.z));
      else ctx.moveTo(toMap(p.x), mz(p.z));
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const e of sim.state.events)
    if (e.expires > sim.state.elapsed && !e.resolved) {
      ctx.strokeStyle = "#d79962";
      const x = toMap(e.position.x),
        y = mz(e.position.z);
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#d9b18a";
      ctx.font = "11px sans-serif";
      ctx.fillText(e.name, x + 13, y + 4);
    }
  for (const b of sim.state.structures)
    if (b.kind === "bed") {
      ctx.fillStyle = "#a4c598";
      ctx.fillRect(toMap(b.position.x) - 4, mz(b.position.z) - 4, 8, 8);
    }
  const waypoint = sim.state.waypoint;
  if (waypoint) {
    const x = toMap(waypoint.x),
      y = mz(waypoint.z),
      player = sim.state.player.position;
    ctx.strokeStyle = "#ddb374";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(toMap(player.x), mz(player.z));
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x - 6, y);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "#e0c9a3";
    ctx.font = "12px sans-serif";
    ctx.fillText(
      "标记 " +
        Math.round(Math.hypot(waypoint.x - player.x, waypoint.z - player.z)) +
        " m",
      x + 12,
      y + 4,
    );
  }
  const p = sim.state.player;
  ctx.save();
  ctx.translate(toMap(p.position.x), mz(p.position.z));
  ctx.rotate(p.yaw);
  ctx.fillStyle = "#e7e4c8";
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(-5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(232,232,194,.2)";
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = "#b7bca2";
  ctx.font = "13px monospace";
  ctx.fillText("N", size - 35, 33);
  ctx.beginPath();
  ctx.moveTo(size - 30, 45);
  ctx.lineTo(size - 30, 72);
  ctx.strokeStyle = "#b7bca2";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size - 34, 51);
  ctx.lineTo(size - 30, 43);
  ctx.lineTo(size - 26, 51);
  ctx.stroke();
}

export type InteractiveMap = (() => void) & {
  centerPlayer(): void;
  reset(): void;
  zoomBy(factor: number): void;
};
/** The return value disposes listeners and also exposes toolbar actions. */
export function bindInteractiveMap(
  canvas: HTMLCanvasElement,
  sim: Simulation,
): InteractiveMap {
  let view = defaultMapView();
  let frame = 0;
  let disposed = false;
  let drag: {
    id: number;
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null = null;
  const oldCursor = canvas.style.cursor,
    oldTouchAction = canvas.style.touchAction;
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";
  const redraw = () => {
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      drawMap(canvas, sim, view);
    });
  };
  const point = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return clientToMap(e.clientX, e.clientY, r);
  };
  const wheel = (e: WheelEvent) => {
    const p = point(e);
    if (p.x < 0 || p.x > MAP_SIZE || p.y < 0 || p.y > MAP_SIZE) return;
    e.preventDefault();
    const delta =
      e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 480 : 1);
    view = zoomMapAt(
      view,
      Math.exp(-Math.max(-400, Math.min(400, delta)) * 0.002),
      p.x,
      p.y,
    );
    redraw();
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || drag) return;
    const p = point(e);
    if (p.x < 0 || p.x > MAP_SIZE || p.y < 0 || p.y > MAP_SIZE) return;
    e.preventDefault();
    drag = {
      id: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      panX: view.panX,
      panY: view.panY,
      moved: false,
    };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.clientX,
      dy = e.clientY - drag.clientY;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const rect = canvas.getBoundingClientRect();
    const side = Math.min(rect.width, rect.height);
    view = clampMapView({
      zoom: view.zoom,
      panX: drag.panX + (dx / side) * MAP_SIZE,
      panY: drag.panY + (dy / side) * MAP_SIZE,
    });
    redraw();
  };
  const release = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const clicked =
      e.type === "pointerup" &&
      !drag.moved &&
      Math.hypot(e.clientX - drag.clientX, e.clientY - drag.clientY) <= 4;
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = "grab";
    if (clicked) {
      const p = point(e),
        world = mapToWorld(p.x, p.y, view);
      if (Math.abs(world.x) <= 2048 && Math.abs(world.z) <= 2048) {
        sim.narrative.stopTrackingMainLead();
        const old = sim.state.waypoint;
        sim.state.waypoint =
          old && Math.hypot(old.x - world.x, old.z - world.z) < 40 / view.zoom
            ? null
            : { ...world, y: sim.gen.height(world.x, world.z) };
      }
    }
    redraw();
  };
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", release);
  drawMap(canvas, sim, view);
  const dispose = () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    canvas.removeEventListener("wheel", wheel);
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", release);
    canvas.removeEventListener("pointercancel", release);
    canvas.removeEventListener("lostpointercapture", release);
    if (drag && canvas.hasPointerCapture(drag.id))
      canvas.releasePointerCapture(drag.id);
    drag = null;
    canvas.style.cursor = oldCursor;
    canvas.style.touchAction = oldTouchAction;
  };
  return Object.assign(dispose, {
    centerPlayer() {
      const p = worldToMap(
        sim.state.player.position.x,
        sim.state.player.position.z,
      );
      view = clampMapView({
        zoom: Math.max(2, view.zoom),
        panX: MAP_SIZE / 2 - p.x * Math.max(2, view.zoom),
        panY: MAP_SIZE / 2 - p.y * Math.max(2, view.zoom),
      });
      redraw();
    },
    reset() {
      view = defaultMapView();
      redraw();
    },
    zoomBy(factor: number) {
      view = zoomMapAt(view, factor, MAP_SIZE / 2, MAP_SIZE / 2);
      redraw();
    },
  });
}
