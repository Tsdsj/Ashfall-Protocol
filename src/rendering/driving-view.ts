import type { VehicleData } from "../core/types";
export const DRIVER_EYE = { x: -0.4, y: 1.6, z: 0.34 };
export function vehicleVisualY(vehicle: VehicleData, time: number): number {
  return (
    vehicle.position.y + Math.sin(time * 8) * Math.abs(vehicle.speed) * 0.0005
  );
}
export function driverEye(vehicle: VehicleData, time: number) {
  const c = Math.cos(vehicle.yaw),
    s = Math.sin(vehicle.yaw);
  return {
    x: vehicle.position.x + c * DRIVER_EYE.x + s * DRIVER_EYE.z,
    y: vehicleVisualY(vehicle, time) + DRIVER_EYE.y,
    z: vehicle.position.z - s * DRIVER_EYE.x + c * DRIVER_EYE.z,
  };
}
