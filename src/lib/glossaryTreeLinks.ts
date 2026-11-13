/**
 * Flat D8 Shape used on the Technique Tree page.
 *
 * Front and back match the printable self-assessment diamond so the eight faces
 * sit in the same places. Catalog links are drawn from a source card's face to
 * its target card's face. This module only reads the glossary catalog; it never
 * touches assessment scores or the student Live D8.
 */

import {
  findBaseCard,
  glossaryBaseFaceLabel,
  isGlossaryBaseFace,
  type GlossaryBaseCatalog,
  type GlossaryBaseFaceId,
} from './glossaryBaseCards.ts';
import { DIAMOND_LAYOUT, DIAMOND_QUADRANTS, quadrantTriangle, triangleCentroid, type DiamondQuadrant, type DiamondSide } from './staticDiamond.ts';
import { SHEET_AXIS_IDS, type AxisId } from '../preview/assessmentRadar/model.ts';

export const TREE_D8_MIN_ZOOM = 0.55;
export const TREE_D8_MAX_ZOOM = 5;
export const TREE_D8_RADIUS = 62;
export const TREE_D8_VIEW_WIDTH = 400;
export const TREE_D8_VIEW_HEIGHT = 230;

const FRONT_CENTER = { x: 100, y: 124 };
const BACK_CENTER = { x: 300, y: 124 };

export type TreeD8FaceAnchor = {
  id: AxisId;
  label: string;
  side: DiamondSide;
  quadrant: DiamondQuadrant;
  center: { x: number; y: number };
  triangle: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  hasGlossaryCards: boolean;
};

function sideCenter(side: DiamondSide): { x: number; y: number } {
  return side === 'front' ? FRONT_CENTER : BACK_CENTER;
}

export function treeD8FaceAnchors(): TreeD8FaceAnchor[] {
  const anchors: TreeD8FaceAnchor[] = [];
  for (const side of ['front', 'back'] as const) {
    const origin = sideCenter(side);
    for (const quadrant of DIAMOND_QUADRANTS) {
      const axisId = SHEET_AXIS_IDS[DIAMOND_LAYOUT[side][quadrant]];
      const triangle = quadrantTriangle(origin, TREE_D8_RADIUS, quadrant);
      anchors.push({
        id: axisId,
        label: glossaryBaseFaceLabel(axisId),
        side,
        quadrant,
        center: triangleCentroid(triangle),
        triangle,
        hasGlossaryCards: isGlossaryBaseFace(axisId),
      });
    }
  }
  return anchors;
}

export function treeD8AnchorFor(faceId: string): TreeD8FaceAnchor | null {
  return treeD8FaceAnchors().find((face) => face.id === faceId) ?? null;
}

/** Put the face name just outside the triangle so neighboring labels do not collide. */
export function treeD8LabelPoint(face: TreeD8FaceAnchor): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const origin = face.side === 'front' ? FRONT_CENTER : BACK_CENTER;
  const mid = {
    x: (face.triangle[1].x + face.triangle[2].x) / 2,
    y: (face.triangle[1].y + face.triangle[2].y) / 2,
  };
  const dx = mid.x - origin.x;
  const dy = mid.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  const nudge = 18;
  return {
    x: mid.x + (dx / length) * nudge,
    y: mid.y + (dy / length) * nudge + 3,
    anchor: 'middle',
  };
}

export function treeD8LabelLines(label: string): string[] {
  if (label.includes('/')) return label.split('/').map((part) => part.trim());
  if (label === 'Escapes/Defense' || label === 'Guard/Control') return label.split('/');
  return [label];
}


export type CatalogLinkSegment = {
  id: string;
  fromFaceId: string;
  toFaceId: string;
  fromCardId: string | null;
  toCardId: string;
  fromTitle: string;
  toTitle: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/**
 * Card-to-card catalog links, placed from the source face to the target face.
 * Tree-step sources have no D8 face, so they are left off the diamond.
 * Same-face pairs still get a short curve so the link is visible.
 */
export function catalogLinkSegments(catalog: GlossaryBaseCatalog): CatalogLinkSegment[] {
  const anchors = new Map(treeD8FaceAnchors().map((face) => [face.id, face]));
  const pairCounts = new Map<string, number>();
  const segments: CatalogLinkSegment[] = [];

  for (const link of catalog.links) {
    if (link.from.type !== 'card') continue;
    const from = findBaseCard(catalog, link.from.cardId);
    const to = findBaseCard(catalog, link.toCardId);
    if (!from || !to) continue;
    const start = anchors.get(from.faceId);
    const end = anchors.get(to.faceId);
    if (!start || !end) continue;
    const pairKey = `${from.faceId}=>${to.faceId}`;
    const index = pairCounts.get(pairKey) ?? 0;
    pairCounts.set(pairKey, index + 1);
    const offset = linkOffset(start.center, end.center, index);
    segments.push({
      id: link.id,
      fromFaceId: from.faceId,
      toFaceId: to.faceId,
      fromCardId: from.id,
      toCardId: to.id,
      fromTitle: from.title,
      toTitle: to.title,
      x1: start.center.x + offset.x,
      y1: start.center.y + offset.y,
      x2: end.center.x + offset.x,
      y2: end.center.y + offset.y,
    });
  }

  return segments;
}

function linkOffset(from: { x: number; y: number }, to: { x: number; y: number }, index: number): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const step = ((index % 2 === 0 ? 1 : -1) * Math.ceil((index + 1) / 2)) * 6;
  if (length < 1) {
    return { x: 0, y: step };
  }
  return { x: (-dy / length) * step, y: (dx / length) * step };
}

/** Lines to draw when the technique-tree toggle is on. Off is an empty list. */
export function visibleCatalogLinkSegments(catalog: GlossaryBaseCatalog, enabled: boolean): CatalogLinkSegment[] {
  return enabled ? catalogLinkSegments(catalog) : [];
}

export function countCardToCardLinks(catalog: GlossaryBaseCatalog): number {
  return catalog.links.filter((link) => link.from.type === 'card' && findBaseCard(catalog, link.toCardId) && findBaseCard(catalog, link.from.type === 'card' ? link.from.cardId : '')).length;
}

export type TreeD8View = {
  scale: number;
  x: number;
  y: number;
};

export function resetTreeD8View(): TreeD8View {
  return { scale: 1, x: 0, y: 0 };
}

export function clampTreeD8Zoom(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(TREE_D8_MAX_ZOOM, Math.max(TREE_D8_MIN_ZOOM, scale));
}

/** Zoom around a focal point in the viewport, keeping that point on the same content pixel. */
export function zoomTreeD8View(view: TreeD8View, nextScale: number, focusX: number, focusY: number): TreeD8View {
  const scale = clampTreeD8Zoom(nextScale);
  if (scale === view.scale) return view;
  const contentX = (focusX - view.x) / view.scale;
  const contentY = (focusY - view.y) / view.scale;
  return {
    scale,
    x: focusX - contentX * scale,
    y: focusY - contentY * scale,
  };
}

export function panTreeD8View(view: TreeD8View, dx: number, dy: number): TreeD8View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

export function wheelTreeD8View(view: TreeD8View, deltaY: number, focusX: number, focusY: number): TreeD8View {
  const factor = Math.exp(-deltaY * 0.0015);
  return zoomTreeD8View(view, view.scale * factor, focusX, focusY);
}

export function pinchTreeD8View(
  view: TreeD8View,
  startScale: number,
  startDistance: number,
  distance: number,
  focusX: number,
  focusY: number,
): TreeD8View {
  if (startDistance <= 0) return view;
  return zoomTreeD8View(view, startScale * (distance / startDistance), focusX, focusY);
}

export function isGlossaryTreeFace(faceId: string): faceId is GlossaryBaseFaceId {
  return isGlossaryBaseFace(faceId);
}
