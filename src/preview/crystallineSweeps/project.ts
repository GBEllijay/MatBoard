/**
 * One camera for both relief drawings. Fit uses the height envelope
 * so a tall point and a deep pit stay inside the face at zoom 1.
 */

import { fitEnvelope, type SweepLayout, type Vec3 } from './geometry.ts';

export const VIEW_SIZE = 360;
export const FIT_PAD = 16;
export const DEFAULT_YAW = 0.35;
export const DEFAULT_PITCH = 0.78;
export const MIN_ZOOM = 0.65;
export const MAX_ZOOM = 3.2;
const CAMERA_DISTANCE = 5.5;

export type Camera = { yaw: number; pitch: number; zoom: number };

export type PlanePoint = { x: number; y: number; z: number };

export function defaultCamera(): Camera {
  return { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, zoom: 1 };
}

export function clampZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function orient(point: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = point.x * cy - point.y * sy;
  const y1 = point.x * sy + point.y * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return {
    x: x1,
    y: y1 * cp - point.z * sp,
    z: y1 * sp + point.z * cp,
  };
}

export function toPlane(point: Vec3, camera: Camera): PlanePoint {
  const oriented = orient(point, camera.yaw, camera.pitch);
  const w = CAMERA_DISTANCE / (CAMERA_DISTANCE - oriented.z);
  return { x: oriented.x * w, y: -oriented.y * w, z: oriented.z };
}

export function fitMapper(raw: readonly { x: number; y: number }[], view: number, pad: number, zoom: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of raw) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((view - 2 * pad) / width, (view - 2 * pad) / height) * zoom;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return (point: { x: number; y: number }) => ({
    x: view / 2 + (point.x - cx) * scale,
    y: view / 2 + (point.y - cy) * scale,
  });
}

export function projectPoints(points: readonly Vec3[], camera: Camera, view = VIEW_SIZE) {
  const envelope = points.map((point) => toPlane(point, camera));
  const map = fitMapper(envelope, view, FIT_PAD, camera.zoom);
  const place = (point: Vec3) => {
    const plane = toPlane(point, camera);
    const flat = map(plane);
    return { x: flat.x, y: flat.y, z: plane.z };
  };
  return { place };
}

export function projectLayout(layout: SweepLayout, camera: Camera, view = VIEW_SIZE) {
  return projectPoints(fitEnvelope(layout), camera, view);
}

export function pointInTriangle(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): boolean {
  const sign = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  const ab = sign(point, a, b);
  const bc = sign(point, b, c);
  const ca = sign(point, c, a);
  const hasNeg = ab < 0 || bc < 0 || ca < 0;
  const hasPos = ab > 0 || bc > 0 || ca > 0;
  return !(hasNeg && hasPos);
}

/** Names stay off the crystal until there is room. The list always has them. */
export function labelTier(zoom: number): 'none' | 'short' | 'full' {
  if (zoom < 1.35) return 'none';
  if (zoom < 1.85) return 'short';
  return 'full';
}

export function shortName(name: string): string {
  const word = name.trim().split(/\s+/)[0] ?? '';
  return word.slice(0, 12);
}
