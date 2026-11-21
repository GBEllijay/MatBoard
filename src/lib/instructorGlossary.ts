/**
 * Instructor glossary for the D12. Short, plain definitions for the twelve
 * teaching faces and the starter cards. Separate from the BJJ technique
 * glossary in glossary.ts, which the student D8 uses. Generic content only.
 */
import { INSTRUCTOR_D12_FACES, type InstructorD12FaceId } from './instructorD12.ts';

export type InstructorGlossaryTerm = {
  key: string;
  term: string;
  /** Face the term belongs to. Face entries point at themselves. */
  faceId: InstructorD12FaceId;
  kind: 'face' | 'card';
  definition: string;
};

export function instructorGlossaryKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

const FACE_DEFINITIONS: Record<InstructorD12FaceId, string> = {
  'public-speaking': 'Talking to a room so people hear, follow, and remember what you said.',
  preparation: 'Getting yourself, the mat, and the lesson ready before class starts.',
  energy: 'The pace and mood you bring, and how it lifts or settles the room.',
  'technical-demonstration': 'Showing a move clearly enough that students can copy it on the first try.',
  safety: 'Keeping training partners healthy: spacing, tapping, intensity, and clean mats.',
  'class-growth': 'Helping the class get bigger and stronger over months, not just one night.',
  'student-leadership-development': 'Giving senior students small jobs that turn them into helpers and future coaches.',
  'on-mat-presence': 'How you carry yourself during class: attention, posture, and voice.',
  'off-mat-presence': 'How you show up outside class: front desk, messages, events, and parents.',
  'student-retention': 'Keeping students coming back by noticing them and their progress.',
  'personal-development': 'Your own training, study, and habits as a coach.',
  'time-management': 'Starting and ending on time and giving each part of class the right share.',
};

const CARD_TERMS: { term: string; faceId: InstructorD12FaceId; definition: string }[] = [
  {
    term: 'Intro / end-of-class message',
    faceId: 'public-speaking',
    definition: 'A short opening and closing talk: what we are working on today, and one thing to remember.',
  },
  {
    term: 'Speaking in front of class and keeping attention',
    faceId: 'public-speaking',
    definition: 'Clear voice, short points, and checking that the back row is still with you.',
  },
  {
    term: 'Communicating with parents off the mat',
    faceId: 'public-speaking',
    definition: 'Brief, friendly updates for parents about progress, behavior, and schedule.',
  },
  {
    term: 'Clean uniform / laundry',
    faceId: 'preparation',
    definition: 'Arriving in a clean, dry uniform and setting the standard for students.',
  },
  {
    term: 'Mat inspection',
    faceId: 'preparation',
    definition: 'Checking the mats for gaps, damage, and cleanliness before anyone trains.',
  },
  {
    term: 'Lesson plan / video review',
    faceId: 'preparation',
    definition: 'Knowing tonight\u2019s plan and reviewing any reference video before class.',
  },
];

export const INSTRUCTOR_GLOSSARY: readonly InstructorGlossaryTerm[] = [
  ...INSTRUCTOR_D12_FACES.map((face) => ({
    key: instructorGlossaryKey(face.label),
    term: face.label,
    faceId: face.id,
    kind: 'face' as const,
    definition: FACE_DEFINITIONS[face.id],
  })),
  ...CARD_TERMS.map((row) => ({ key: instructorGlossaryKey(row.term), kind: 'card' as const, ...row })),
];

const BY_KEY = new Map(INSTRUCTOR_GLOSSARY.map((term) => [term.key, term]));

export function instructorGlossaryTerm(name: string): InstructorGlossaryTerm | null {
  return BY_KEY.get(instructorGlossaryKey(name)) ?? null;
}

export function instructorFaceDefinition(faceId: InstructorD12FaceId): string {
  return FACE_DEFINITIONS[faceId];
}
