/**
 * Fictional instructor character-sheet preview.
 * Teaching fields come from the existing instructor profile sample.
 * The instructor D10 is a fictional teaching sample. The student D8 is read
 * from a linked student-profile sample, not copied or saved.
 */
import type { InstructorD10Scores } from '../../lib/instructorD10';
import type { AssessmentScores } from '../../lib/studentAssessment';
import { ASSESSMENT_FORM_AREAS } from '../../lib/studentAssessment';
import { INSTRUCTOR, PREVIEW_YEAR, teachingYears } from '../instructorProfile/model';

export const INSTRUCTOR_SHEET_PATH = '/preview/instructor-sheet';

export const INSTRUCTOR_SHEET_BANNER =
  'Fictional instructor character sheet. Nothing on this page is saved, sent, or written to a profile.';

/** Fictional instructor D10 check-in. Not written to storage. */
export const INSTRUCTOR_D10_SAMPLE: InstructorD10Scores = {
  'public-speaking': 4,
  preparation: 5,
  energy: 4,
  'technical-demonstration': 5,
  safety: 5,
  'class-building': 3,
  mentor: 4,
  'on-mat-presence': 5,
  'off-mat-presence': 3,
  'student-retention': 4,
  classGrowth: 3,
};

export const STUDENT_PROFILE_D8: {
  hasStudentProfile: true;
  date: string;
  source: string;
  scores: AssessmentScores;
} = {
  hasStudentProfile: true,
  date: '2026-11-08',
  source: 'Latest check-in on the linked student profile for this same person. Shown here, not copied onto the instructor record.',
  scores: {
    guard: 4,
    passing: 4,
    sweeps: 3,
    takedowns: 3,
    escapes: 4,
    submissions: 4,
    conditioning: 3,
    mindset: 5,
  },
};

export function d8FaceRows(scores: AssessmentScores) {
  return ASSESSMENT_FORM_AREAS.map((face) => ({
    id: face.id,
    label: face.label,
    value: face.id === 'sweeps' ? scores.sweeps ?? null : scores[face.id],
  }));
}

export function teachingLengthLabel(previewYear = PREVIEW_YEAR): string {
  const years = teachingYears(INSTRUCTOR.teachingAroundYear, previewYear);
  return `${years} years (c. ${INSTRUCTOR.teachingAroundYear}–${previewYear})`;
}
