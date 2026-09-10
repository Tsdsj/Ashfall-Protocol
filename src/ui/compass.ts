import { angleDelta } from "../core/motion";
import type { Vec3 } from "../core/types";
export function targetBearing(position: Vec3, yaw: number, target: Vec3) {
  const bearing = Math.atan2(target.x - position.x, target.z - position.z);
  const relative = (angleDelta(yaw, bearing) * 180) / Math.PI;
  const heading = ((bearing * 180) / Math.PI + 360) % 360;
  return {
    relative,
    heading,
    percent: 50 + Math.max(-1, Math.min(1, relative / 90)) * 50,
    behind: Math.abs(relative) > 90,
  };
}
