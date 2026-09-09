import type { BodyPart, Vec3 } from "../core/types";

export interface HitZone {
  part: BodyPart;
  a: Vec3;
  b: Vec3;
  radius: number;
}
export function raySphere(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
  limit: number,
): number | null {
  const x = origin.x - center.x,
    y = origin.y - center.y,
    z = origin.z - center.z;
  const c = x * x + y * y + z * z - radius * radius;
  if (c <= 0) return 0;
  const b = x * direction.x + y * direction.y + z * direction.z,
    disc = b * b - c;
  if (disc < 0) return null;
  const distance = -b - Math.sqrt(disc);
  return distance >= 0 && distance <= limit ? distance : null;
}
/** Intersect a finite ray with an oriented capsule, including both round end caps. */
export function rayCapsule(
  origin: Vec3,
  direction: Vec3,
  zone: HitZone,
  limit: number,
): number | null {
  const v = {
    x: zone.b.x - zone.a.x,
    y: zone.b.y - zone.a.y,
    z: zone.b.z - zone.a.z,
  };
  const w = {
    x: origin.x - zone.a.x,
    y: origin.y - zone.a.y,
    z: origin.z - zone.a.z,
  };
  const length = v.x * v.x + v.y * v.y + v.z * v.z;
  if (length < 1e-8)
    return raySphere(origin, direction, zone.a, zone.radius, limit);
  const dv = direction.x * v.x + direction.y * v.y + direction.z * v.z,
    wv = w.x * v.x + w.y * v.y + w.z * v.z;
  const qa = 1 - (dv * dv) / length,
    qb =
      2 *
      (direction.x * w.x +
        direction.y * w.y +
        direction.z * w.z -
        (dv * wv) / length),
    qc =
      w.x * w.x +
      w.y * w.y +
      w.z * w.z -
      (wv * wv) / length -
      zone.radius * zone.radius;
  let nearest = Infinity;
  if (qc <= 0 && wv >= 0 && wv <= length) return 0;
  const discriminant = qb * qb - 4 * qa * qc;
  if (qa > 1e-8 && discriminant >= 0) {
    const t = (-qb - Math.sqrt(discriminant)) / (2 * qa),
      along = (wv + dv * t) / length;
    if (t >= 0 && t <= limit && along >= 0 && along <= 1) nearest = t;
  }
  for (const end of [zone.a, zone.b]) {
    const hit = raySphere(origin, direction, end, zone.radius, limit);
    if (hit !== null) nearest = Math.min(nearest, hit);
  }
  return nearest <= limit ? nearest : null;
}
export function rayActorZones(
  origin: Vec3,
  direction: Vec3,
  zones: HitZone[],
  limit: number,
  margin = 0,
): { distance: number; part: BodyPart } | null {
  let nearest = limit,
    result: { distance: number; part: BodyPart } | null = null;
  for (const zone of zones) {
    const distance = rayCapsule(
      origin,
      direction,
      margin ? { ...zone, radius: zone.radius + margin } : zone,
      nearest,
    );
    if (distance !== null) {
      nearest = distance;
      result = { distance, part: zone.part };
    }
  }
  return result;
}
