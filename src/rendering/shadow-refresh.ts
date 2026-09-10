import type { Vec3 } from "../core/types";
/** Shadow textures keep their matching cascade matrices until the next update. */
export class ShadowRefreshBudget {
  private elapsed = 0;
  private previous: {
    position: Vec3;
    direction: Vec3;
    fov: number;
    aspect: number;
  } | null = null;
  shouldRefresh(
    dt: number,
    position: Vec3,
    direction: Vec3,
    fov: number,
    aspect: number,
    force = false,
  ): boolean {
    this.elapsed += Math.max(0, dt);
    const last = this.previous;
    const changed =
      !last ||
      Math.hypot(
        position.x - last.position.x,
        position.y - last.position.y,
        position.z - last.position.z,
      ) > 1 ||
      direction.x * last.direction.x +
        direction.y * last.direction.y +
        direction.z * last.direction.z <
        Math.cos(Math.PI / 60) ||
      Math.abs(fov - last.fov) > 0.025 ||
      Math.abs(aspect - last.aspect) > 0.001;
    const interval = 1 / 60;
    if (!force && !changed && this.elapsed + 1e-6 < interval) return false;
    this.elapsed =
      force || changed
        ? 0
        : Math.max(
            0,
            this.elapsed -
              Math.floor((this.elapsed + 1e-6) / interval) * interval,
          );
    this.previous = {
      position: { x: position.x, y: position.y, z: position.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      fov,
      aspect,
    };
    return true;
  }
}
