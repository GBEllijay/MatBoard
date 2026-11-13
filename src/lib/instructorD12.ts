/**
 * Instructor D12: a regular dodecahedron with twelve pentagonal faces,
 * scored 1–5 like the student D8.
 *
 * All twelve faces are named teaching factors. Class Growth and Student
 * Retention are each their own face. Neither has a sub-score.
 * Nothing here reads or writes storage. Student D8 types and scores are untouched.
 */
import { isAssessmentScore, type AssessmentScore } from './studentAssessment.ts';

export type InstructorD12Score = AssessmentScore;

export const INSTRUCTOR_D12_FACES = [
  { id: 'public-speaking', label: 'Public Speaking' },
  { id: 'preparation', label: 'Preparation' },
  { id: 'energy', label: 'Energy' },
  { id: 'technical-demonstration', label: 'Technical Demonstration' },
  { id: 'safety', label: 'Safety' },
  { id: 'class-growth', label: 'Class Growth' },
  { id: 'student-leadership-development', label: 'Student Leadership Development' },
  { id: 'on-mat-presence', label: 'On-Mat Presence' },
  { id: 'off-mat-presence', label: 'Off-Mat Presence' },
  { id: 'student-retention', label: 'Student Retention' },
  { id: 'personal-development', label: 'Personal Development' },
  { id: 'time-management', label: 'Time Management' },
] as const;

export const INSTRUCTOR_D12_FACE_IDS = INSTRUCTOR_D12_FACES.map((face) => face.id);

export type InstructorD12FaceId = (typeof INSTRUCTOR_D12_FACES)[number]['id'];

export type InstructorD12Scores = {
  [K in InstructorD12FaceId]?: InstructorD12Score | null;
};

export type D12AxisReading = {
  id: InstructorD12FaceId;
  label: string;
  /** Null means not yet rated. Never a made-up number. */
  value: number | null;
};

export type D12Face = {
  axis: D12AxisReading;
};

export function d12AxesFromScores(scores: InstructorD12Scores | null | undefined): D12AxisReading[] {
  return INSTRUCTOR_D12_FACES.map((face) => {
    const raw = scores?.[face.id];
    return { id: face.id, label: face.label, value: isAssessmentScore(raw) ? raw : null };
  });
}

export function d12Faces(scores: InstructorD12Scores | null | undefined): D12Face[] {
  return d12AxesFromScores(scores).map((axis) => ({ axis }));
}

/** Plain sentence for screen readers. */
export function d12Summary(scores: InstructorD12Scores | null | undefined): string {
  const faces = d12Faces(scores);
  if (!faces.some((face) => face.axis.value != null)) return 'Instructor D12. No ratings yet.';
  const bits = faces.map((face) => `${face.axis.label} ${face.axis.value ?? 'not rated'}`).join(', ');
  return `Instructor D12: ${bits}.`;
}
