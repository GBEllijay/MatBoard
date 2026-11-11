/**
 * Which names the crystalline diamond draws.
 * The resting view, including the small frame a factor button uses, shows the eight face names.
 * Technique names show for one face after a zoom past that frame, or after a tap drills into that face.
 * Zooming back to the frame, tapping that face again, or Reset view leaves only the face names.
 * A face keeps the technique tiles the factor map already gave it. An empty face adds none.
 */

export const REST_ZOOM = 1;
/** Factor buttons ease the camera to here. Technique names stay hidden at this frame. */
export const FOCUS_FRAME_ZOOM = 1.15;
export const MIN_CRYSTAL_ZOOM = 0.6;
export const MAX_CRYSTAL_ZOOM = 18;
export const ZOOM_STEP = 1.3;

const ZOOM_EPSILON = 1e-4;

export function clampCrystalZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return REST_ZOOM;
  return Math.min(MAX_CRYSTAL_ZOOM, Math.max(MIN_CRYSTAL_ZOOM, zoom));
}

export function zoomPastRest(zoom: number): boolean {
  return zoom > FOCUS_FRAME_ZOOM + ZOOM_EPSILON;
}

export type CrystalLabelState = {
  tier: 'faces' | 'techniques';
  /** Face index whose technique names may show. -1 when the tier is faces, or the front face is not known yet. */
  face: number;
};

/**
 * Default zoom hides every technique name.
 * Zoom past the resting frame, or a face drill, reveals one face:
 * the drilled face, otherwise the focused face, otherwise the face toward the camera.
 * Side-by-side comparison keeps those names off the DOM labels.
 * The factor overlay reveals technique names only for an open Sweeps face.
 */
export function crystalLabelState(input: {
  zoom: number;
  drilledFace: number;
  focusedFace: number;
  frontFace: number;
  comparison: boolean;
  pair: boolean;
  sweepsFace: number;
}): CrystalLabelState {
  if (input.pair) return { tier: 'faces', face: -1 };
  const zoomed = zoomPastRest(input.zoom);
  const drilled = input.drilledFace >= 0;
  if (!zoomed && !drilled) return { tier: 'faces', face: -1 };
  const face = drilled ? input.drilledFace : input.focusedFace >= 0 ? input.focusedFace : input.frontFace;
  if (input.comparison) {
    const sweepsOpen = input.sweepsFace >= 0 && input.focusedFace === input.sweepsFace;
    if (!sweepsOpen || face !== input.sweepsFace) return { tier: 'faces', face: -1 };
  }
  return { tier: 'techniques', face };
}

export function faceShowsTechniqueLabels(
  state: CrystalLabelState,
  faceIndex: number,
  moveCount: number,
  selected: boolean,
): boolean {
  return state.tier === 'techniques' && state.face === faceIndex && moveCount > 0 && !selected;
}

export function tileShowsTechniqueLabel(
  state: CrystalLabelState,
  faceIndex: number,
  hasName: boolean,
  selected: boolean,
): boolean {
  return state.tier === 'techniques' && state.face === faceIndex && hasName && !selected;
}

/** A zoom-out that lands on the resting frame also leaves a face drill. */
export function drillAfterZoom(before: number, after: number, drilledFace: number): number {
  if (after < before - ZOOM_EPSILON && after <= FOCUS_FRAME_ZOOM + ZOOM_EPSILON) return -1;
  return drilledFace;
}

/**
 * Tap again. Drop back to the resting frame so an earlier zoom-in
 * does not leave the technique names up.
 */
export function zoomAfterClosingDrill(zoom: number): number {
  return zoomPastRest(zoom) ? FOCUS_FRAME_ZOOM : zoom;
}

/** Same camera the diamond stage uses. Zoom changes focal length, not this distance. */
export const CAMERA_Z = 5.5;
export const DIAMOND_FOV = (19 * Math.PI) / 180;
/** Octahedron vertex radius. The camera stays well in front of this. */
export const MESH_RADIUS = 1.55;
/** Closest a projected point may come. Stops the near plane from clipping or inverting. */
export const NEAR_GAP = 1.6;
/**
 * Limb diameter may reach this multiple of the stage's shorter side.
 * Past 1 the diamond overfills the stage, but the camera stays anchored on the
 * focused face (or the diamond's center), so the mesh never leaves the frame.
 * Raised from 1.12 so a 4×4 or 5×5 face can be zoomed until its names read clearly.
 */
export const DIAMOND_FILL = 3;
/** Hard ceiling for the live diamond's zoom on any stage size. Was 1.45. */
export const LIVE_ZOOM_MAX = 2.6;

export type CameraPoint = [number, number, number];

/** Diameter of the diamond's limb, as a fraction of stage height, at zoom 1. */
export function diamondHeightFraction(radius = MESH_RADIUS): number {
  return radius / (Math.tan(DIAMOND_FOV) * CAMERA_Z);
}

/**
 * Highest zoom for the live diamond. The diamond may overfill the stage up to
 * DIAMOND_FILL × its shorter side, never past LIVE_ZOOM_MAX, and never below the resting view.
 * The anchored camera keeps the focused face (or the diamond's center) in the middle,
 * so the body cannot leave the frame.
 */
export function diamondZoomCap(width: number, height: number, radius = MESH_RADIUS): number {
  const h = Math.max(height, 1);
  const w = Math.max(width, 1);
  const shorter = Math.min(w, h);
  const diameterAtRest = diamondHeightFraction(radius) * h;
  const fillZoom = (shorter * DIAMOND_FILL) / Math.max(diameterAtRest, 1e-6);
  if (!Number.isFinite(fillZoom)) return 1.25;
  return Math.min(LIVE_ZOOM_MAX, Math.max(REST_ZOOM, fillZoom));
}

/** Clamp used by the live diamond's +, −, pinch, and wheel. */
export function clampLiveZoom(zoom: number, width: number, height: number): number {
  if (!Number.isFinite(zoom)) return REST_ZOOM;
  const cap = width >= 8 && height >= 8 ? diamondZoomCap(width, height) : 1.25;
  return Math.min(cap, Math.max(MIN_CRYSTAL_ZOOM, zoom));
}

/**
 * Perspective around `anchor`, which stays on the container center at every zoom.
 * Depth is kept in front of the near plane so a point cannot flip or clip the camera.
 */
export function projectFit(
  point: CameraPoint,
  anchor: CameraPoint,
  zoom: number,
  width: number,
  height: number,
): { x: number; y: number; depth: number } {
  const safeZoom = Number.isFinite(zoom) ? zoom : REST_ZOOM;
  const focal = (height / 2 / Math.tan(DIAMOND_FOV)) * safeZoom;
  const depthOf = (z: number) => {
    const raw = CAMERA_Z - z;
    if (!Number.isFinite(raw)) return NEAR_GAP;
    return Math.max(NEAR_GAP, raw);
  };
  const depth = depthOf(point[2]);
  const anchorDepth = depthOf(anchor[2]);
  const panX = (anchor[0] * focal) / anchorDepth;
  const panY = (anchor[1] * focal) / anchorDepth;
  return {
    x: width / 2 + (point[0] * focal) / depth - panX,
    y: height / 2 - (point[1] * focal) / depth + panY,
    depth,
  };
}

/** Faces more edge-on than this hide their names. 1 faces the camera. */
export const LABEL_EDGE = 0.42;

export type DiamondLabel = {
  id: string;
  kind: 'face' | 'technique';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Dot of the face normal with the view. Negative faces away. */
  facing: number;
};

export type PlacedDiamondLabel = DiamondLabel & { hidden: boolean };

/** At least 12px, growing with the diamond box, capped so a tall stage stays calm. */
export function labelFontPx(stageHeight: number): number {
  const h = Number.isFinite(stageHeight) && stageHeight > 0 ? stageHeight : 420;
  return Math.round(Math.min(18, Math.max(12, h * 0.028)) * 10) / 10;
}

const LABEL_GAP = 6;

function labelHits(a: DiamondLabel, b: DiamondLabel): boolean {
  return a.x < b.x + b.w + LABEL_GAP && a.x + a.w + LABEL_GAP > b.x && a.y < b.y + b.h + LABEL_GAP && a.y + a.h + LABEL_GAP > b.y;
}

/**
 * Hide back-facing and edge-on names. Nudge the rest apart.
 * When two names still collide, keep the face name and drop the technique.
 */
export function placeDiamondLabels(
  input: readonly DiamondLabel[],
  bounds?: { width: number; height: number },
): PlacedDiamondLabel[] {
  const offstage = (label: DiamondLabel) => {
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
    const cx = label.x + label.w / 2;
    const cy = label.y + label.h / 2;
    return cx < -12 || cy < -12 || cx > bounds.width + 12 || cy > bounds.height + 12;
  };
  const seeded: PlacedDiamondLabel[] = input.map((label) => ({
    ...label,
    hidden: label.facing <= LABEL_EDGE || offstage(label),
  }));
  const order = seeded
    .filter((label) => !label.hidden)
    .sort((a, b) => (a.kind === b.kind ? b.facing - a.facing : a.kind === 'face' ? -1 : 1));
  const kept: PlacedDiamondLabel[] = [];
  for (const label of order) {
    let next = { ...label };
    let parked = false;
    for (let step = 0; step < 6; step += 1) {
      if (!kept.some((other) => !other.hidden && labelHits(next, other))) {
        parked = true;
        break;
      }
      const nudged = { ...next, y: next.y + Math.max(8, next.h * 0.7) };
      if (bounds && nudged.y + nudged.h > bounds.height - 4) {
        next = { ...label, x: label.x + (step + 1) * 14 };
      } else {
        next = nudged;
      }
    }
    if (!parked) {
      const blocker = kept.find((other) => !other.hidden && labelHits(next, other));
      if (blocker && next.kind === 'face' && (blocker.kind === 'technique' || blocker.facing + 0.02 < next.facing)) {
        blocker.hidden = true;
        next = { ...label, hidden: false };
        parked = true;
      } else {
        next = { ...next, hidden: true };
      }
    }
    kept.push(next);
  }
  const byId = new Map(kept.map((label) => [label.id, label]));
  return seeded.map((label) => byId.get(label.id) ?? label);
}
