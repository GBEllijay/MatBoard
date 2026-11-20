/**
 * Public no-login preview data for the academy Identity card.
 * Academy and founder names are fictional. Historical teachers may appear
 * in the example teaching line, clearly badged, with no franchise name or URL.
 */

import type { FoundersStyle, LineageStyle, SuggestedMaster } from '../../lib/academyIdentity.ts';

export const ACADEMY_IDENTITY_PATH = '/preview/academy-identity';

export const PREVIEW_BANNER =
  'Preview data. This page does not load or save an academy profile.';

export const PREVIEW_ACADEMY = 'Valley Ridge Jiu-Jitsu';
export const PREVIEW_FOUNDERS = 'Marcus Reid, Elena Vance';
export const PREVIEW_FOUNDED = '2019-09-01';
export const PREVIEW_SYNC_LABEL = 'Advantage Cloud';

/** Root-at-the-top example teaching line. Professor is fictional. */
export const PREVIEW_SHORT_LINEAGE =
  'Grand Master Carlos Gracie Sr.,\nGrand Master Helio Gracie,\nMaster Carlos Gracie Jr.,\nProfessor Daniel Souza';

/** 17 fictional teachers so the middle collapses to +14 more. */
export const PREVIEW_LONG_TEACHERS = [
  'Master Elias Varela',
  'Professor Tomas Varela',
  'Master Julian Rocha',
  'Professor Henrique Duarte',
  'Master Paolo Nunes',
  'Professor Diego Faria',
  'Master Andres Calderon',
  'Professor Nico Belmonte',
  'Master Lucas Penha',
  'Professor Omar Vieira',
  'Master Bruno Castilho',
  'Professor Felix Amaral',
  'Master Renan Pacheco',
  'Professor Ivo Barreto',
  'Master Sergio Lobato',
  'Professor Caio Mendonca',
  'Professor Elena Vasquez',
] as const;

export const PREVIEW_LONG_LINEAGE = PREVIEW_LONG_TEACHERS.join(',\n');

export const PREVIEW_EDIT_LINEAGE = 'Professor Daniel Souza';

export const PREVIEW_SUGGESTIONS: readonly SuggestedMaster[] = [
  { name: 'Carlos Gracie Sr.', title: 'Grand Master', teacher: 'Mitsuyo Maeda', teacherNote: 'student of Mitsuyo Maeda' },
  { name: 'Helio Gracie', title: 'Grand Master', teacher: 'Carlos Gracie Sr.', teacherNote: 'student of Carlos Gracie Sr.' },
  { name: 'Carlos Gracie Jr.', title: 'Master', teacher: 'Helio Gracie', teacherNote: 'student of Helio Gracie' },
];

export type LineageDemo = 'short' | 'long' | 'edit' | 'off';

export const FOUNDERS_STYLE_OPTIONS: readonly { id: FoundersStyle; label: string }[] = [
  { id: 'nameplates', label: 'Nameplate badges' },
  { id: 'plaque', label: 'Engraved plaque' },
  { id: 'crest', label: 'Crest strip' },
];

export const LINEAGE_STYLE_OPTIONS: readonly { id: LineageStyle; label: string }[] = [
  { id: 'rail', label: 'Classic rail' },
  { id: 'cards', label: 'Belt cards' },
  { id: 'ribbon', label: 'Heritage ribbon' },
];

export const LINEAGE_DEMO_OPTIONS: readonly { id: LineageDemo; label: string }[] = [
  { id: 'short', label: '4-step chain' },
  { id: 'long', label: 'Long chain (+14 more)' },
  { id: 'edit', label: 'Edit + Suggested auto-fill' },
  { id: 'off', label: 'Lineage off' },
];

export function previewLineageText(demo: LineageDemo): string {
  if (demo === 'long') return PREVIEW_LONG_LINEAGE;
  if (demo === 'edit') return PREVIEW_EDIT_LINEAGE;
  if (demo === 'off') return PREVIEW_SHORT_LINEAGE;
  return PREVIEW_SHORT_LINEAGE;
}
