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
