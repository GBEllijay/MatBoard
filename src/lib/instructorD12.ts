/**
 * Instructor D12: a regular dodecahedron with twelve pentagonal faces,
 * scored 1–5 like the student D8.
 *
 * All twelve faces are named teaching factors. Class Growth and Student
 * Retention are each their own face. Neither has a sub-score.
 * Student D8 types and scores are untouched. Saved teaching-shape ratings live in
 * localStorage under INSTRUCTOR_D12_STORAGE_KEY, keyed by instructor seat.
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

/** Per-browser teaching-shape ratings. Never seeded with sample scores. */
export const INSTRUCTOR_D12_STORAGE_KEY = 'matboard.instructor.d12.v1';

type InstructorD12File = {
  v: 1;
  scoresBySeat: Record<string, InstructorD12Scores>;
};

export function instructorD12SeatKey(seatId: string | null | undefined): string {
  const id = seatId?.trim();
  return id && id !== 'owner' ? id : 'owner';
}

export function instructorD12HasRatings(scores: InstructorD12Scores | null | undefined): boolean {
  return d12AxesFromScores(scores).some((face) => face.value != null);
}

function cleanScores(raw: unknown): InstructorD12Scores {
  const scores: InstructorD12Scores = {};
  if (!raw || typeof raw !== 'object') return scores;
  const record = raw as Record<string, unknown>;
  for (const face of INSTRUCTOR_D12_FACES) {
    const value = record[face.id];
    if (isAssessmentScore(value)) scores[face.id] = value;
  }
  return scores;
}

function emptyFile(): InstructorD12File {
  return { v: 1, scoresBySeat: {} };
}

function readFile(storage: Pick<Storage, 'getItem'>): InstructorD12File {
  try {
    const raw = storage.getItem(INSTRUCTOR_D12_STORAGE_KEY);
    if (!raw) return emptyFile();
    const parsed = JSON.parse(raw) as { v?: number; scoresBySeat?: Record<string, unknown> };
    if (!parsed || parsed.v !== 1 || !parsed.scoresBySeat || typeof parsed.scoresBySeat !== 'object') {
      return emptyFile();
    }
    return {
      v: 1,
      scoresBySeat: Object.fromEntries(
        Object.entries(parsed.scoresBySeat).map(([key, value]) => [key, cleanScores(value)]),
      ),
    };
  } catch {
    return emptyFile();
  }
}

/** Null when this seat has no saved ratings. Never returns sample data. */
export function loadInstructorD12Scores(
  storage: Pick<Storage, 'getItem'> = localStorage,
  seatKey = 'owner',
): InstructorD12Scores | null {
  const scores = readFile(storage).scoresBySeat[seatKey];
  return instructorD12HasRatings(scores) ? scores! : null;
}

export function saveInstructorD12Scores(
  scores: InstructorD12Scores,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  seatKey = 'owner',
): InstructorD12Scores {
  const file = readFile(storage);
  const clean = cleanScores(scores);
  if (instructorD12HasRatings(clean)) file.scoresBySeat[seatKey] = clean;
  else delete file.scoresBySeat[seatKey];
  storage.setItem(INSTRUCTOR_D12_STORAGE_KEY, JSON.stringify(file));
  return clean;
}
