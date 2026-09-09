import type { GameSettings } from "./types";

export const DEFAULT_VERTICAL_FOV = 60;

export function cameraPreferences(data?: Partial<GameSettings> | null) {
  const legacyDefault =
    !data?.cameraProfile && (data?.fov === undefined || data.fov === 80);
  return {
    fov: legacyDefault
      ? DEFAULT_VERTICAL_FOV
      : (data?.fov ?? DEFAULT_VERTICAL_FOV),
    cameraProfile: 1,
  };
}

export function zoomFov(verticalDegrees: number, magnification: number) {
  return (
    (Math.atan(Math.tan((verticalDegrees * Math.PI) / 360) / magnification) *
      360) /
    Math.PI
  );
}
