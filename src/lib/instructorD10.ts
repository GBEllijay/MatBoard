/**
 * Instructor D10: ten teaching faces, scored 1–5 like the student D8.
 *
 * Mapping follows the static D8 diamond. Even-index faces meet at the near
 * pole (front). Odd-index faces meet at the far pole (back). The back is
 * drawn turned over left-to-right, so a face that shares an equatorial edge
 * with a front face still lines up in the mirrored sector. Five kites around
 * each pole take the place of the D8's four triangles.
 *
 * Class growth is a sub-metric of Student retention, not an 11th face.
 * Nothing here reads or writes storage. Student D8 types and scores are untouched.
 */
import { isAssessmentScore, type AssessmentScore } from './studentAssessment.ts';

export type InstructorD10Score = AssessmentScore;

export const INSTRUCTOR_D10_FACES = [
  { id: 'public-speaking', label: 'Public speaking' },
  { id: 'preparation', label: 'Preparation' },
  { id: 'energy', label: 'Energy' },
  { id: 'technical-demonstration', label: 'Technical demonstration' },
  { id: 'safety', label: 'Safety' },
  { id: 'class-building', label: 'Class building' },
  { id: 'mentor', label: 'Mentor' },
  { id: 'on-mat-presence', label: 'On-mat presence' },
  { id: 'off-mat-presence', label: 'Off-mat presence' },
  { id: 'student-retention', label: 'Student retention' },
] as const;

export const INSTRUCTOR_D10_FACE_IDS = INSTRUCTOR_D10_FACES.map((face) => face.id);

export type InstructorD10FaceId = (typeof INSTRUCTOR_D10_FACES)[number]['id'];

/** Sub-metrics hang off a face. They are not themselves faces of the die. */
export const INSTRUCTOR_D10_SUBMETRICS = [
  { id: 'class-growth', label: 'Class growth', faceId: 'student-retention' },
] as const;

export type InstructorD10SubmetricId = (typeof INSTRUCTOR_D10_SUBMETRICS)[number]['id'];

export type InstructorD10Scores = {
  [K in InstructorD10FaceId]?: InstructorD10Score | null;
} & {
  /** Sub-metric of Student retention. Not drawn as a face. */
  classGrowth?: InstructorD10Score | null;
};

export type D10Side = 'front' | 'back';
/** Five sectors, 0 at the top, then clockwise. */
export const D10_SECTORS = [0, 1, 2, 3, 4] as const;
export type D10Sector = (typeof D10_SECTORS)[number];

/**
 * Index into INSTRUCTOR_D10_FACE_IDS for each side and sector.
 * Front looks down the near pole: even faces clockwise from the top.
 * Back is turned over left-to-right, so the pair of a front sector appears
 * in the mirrored sector (top stays top; 1 ↔ 4, 2 ↔ 3).
 */
export const D10_LAYOUT: Record<D10Side, Record<D10Sector, number>> = {
  front: { 0: 0, 1: 2, 2: 4, 3: 6, 4: 8 },
  back: { 0: 1, 1: 9, 2: 7, 3: 5, 4: 3 },
};

export type D10AxisReading = {
  id: InstructorD10FaceId;
  label: string;
  /** Null means not yet rated. Never a made-up number. */
  value: number | null;
};

export type D10Face = {
  side: D10Side;
  sector: D10Sector;
  axis: D10AxisReading;
};

export type D10SubmetricReading = {
  id: InstructorD10SubmetricId;
  label: string;
  faceId: InstructorD10FaceId;
  value: number | null;
};

export function d10AxesFromScores(scores: InstructorD10Scores | null | undefined): D10AxisReading[] {
  return INSTRUCTOR_D10_FACES.map((face) => {
    const raw = scores?.[face.id];
    return { id: face.id, label: face.label, value: isAssessmentScore(raw) ? raw : null };
  });
}

export function d10Faces(scores: InstructorD10Scores | null | undefined): D10Face[] {
  const axes = d10AxesFromScores(scores);
  const faces: D10Face[] = [];
  for (const side of ['front', 'back'] as const) {
    for (const sector of D10_SECTORS) {
      const axis = axes[D10_LAYOUT[side][sector]];
      if (axis) faces.push({ side, sector, axis });
    }
  }
  return faces;
}

export function d10Submetrics(scores: InstructorD10Scores | null | undefined): D10SubmetricReading[] {
  return INSTRUCTOR_D10_SUBMETRICS.map((row) => {
    const raw = row.id === 'class-growth' ? scores?.classGrowth : undefined;
    return { id: row.id, label: row.label, faceId: row.faceId, value: isAssessmentScore(raw) ? raw : null };
  });
}

export function d10SubmetricsForFace(
  faceId: InstructorD10FaceId,
  scores: InstructorD10Scores | null | undefined,
): D10SubmetricReading[] {
  return d10Submetrics(scores).filter((row) => row.faceId === faceId);
}

type Point = { x: number; y: number };

/** Angle 0 is the top, then clockwise. Screen y grows downward. */
export function d10Polar(center: Point, radius: number, degrees: number): Point {
  const rad = (degrees * Math.PI) / 180;
  return { x: center.x + radius * Math.sin(rad), y: center.y - radius * Math.cos(rad) };
}

/**
 * Kite for one sector of a pentagonal trapezohedron, flattened:
 * pole, first shoulder, outer tip, second shoulder.
 * Shoulders sit on the inner pentagon; the tip is farther out on the sector midline.
 */
export function d10Kite(center: Point, radius: number, sector: D10Sector): [Point, Point, Point, Point] {
  const mid = sector * 72;
  const outer = radius / Math.cos(Math.PI / 5);
  const shoulder = radius;
  return [
    center,
    d10Polar(center, shoulder, mid - 36),
    d10Polar(center, outer, mid),
    d10Polar(center, shoulder, mid + 36),
  ];
}

export function d10KiteCentroid(kite: readonly Point[]): Point {
  const mid = {
    x: (kite[0]!.x + kite[1]!.x + kite[2]!.x + kite[3]!.x) / 4,
    y: (kite[0]!.y + kite[1]!.y + kite[2]!.y + kite[3]!.y) / 4,
  };
  return mid;
}

/** Plain sentence for screen readers. Sub-metrics are named under their face, not as faces. */
export function d10Summary(scores: InstructorD10Scores | null | undefined): string {
  const faces = d10Faces(scores);
  if (!faces.some((face) => face.axis.value != null)) return 'Instructor D10. No ratings yet.';
  const bits = (side: D10Side) =>
    faces
      .filter((face) => face.side === side)
      .map((face) => `${face.axis.label} ${face.axis.value ?? 'not rated'}`)
      .join(', ');
  const growth = d10Submetrics(scores).find((row) => row.id === 'class-growth');
  const sub =
    growth && growth.value != null
      ? ` Under Student retention, class growth ${growth.value}.`
      : growth
        ? ' Under Student retention, class growth not rated.'
        : '';
  return `Instructor D10, front: ${bits('front')}. Back: ${bits('back')}.${sub}`;
}
