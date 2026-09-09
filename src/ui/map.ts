import { REGIONS } from "../world/generator";
import type { Simulation } from "../simulation/simulation";
export function drawMap(canvas: HTMLCanvasElement, sim: Simulation): void {
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
  for (const poi of sim.gen.pois) {
    const explored = sim.state.discovered.includes(poi.id);
    ctx.fillStyle = explored ? "#c9c6a0" : "#56664f";
    const x = toMap(poi.x),
      y = mz(poi.z);
    ctx.fillRect(x - 3, y - 3, 6, 6);
    if (explored && poi.story) {
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
