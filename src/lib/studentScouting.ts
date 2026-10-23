/**
 * Opponent scouting cards. They stay on this phone, like the coach roster.
 * CSV import and export use the coach roster columns, plus Style, Class,
 * the seven rating columns, and optional Strengths and Weaknesses.
 * A file without the rating columns still imports.
 */

import type { CompetitionResult } from './progress/types.ts';
import { ASSESSMENT_AREAS } from './studentAssessment.ts';
import { cleanRatings, type AreaRatings } from './opponentAssessment.ts';
import {
  COMPETITOR_GYM_LABEL,
} from './coachCopy.ts';
import {
  csvField,
  detectCsvDelimiter,
  formatRosterCsvSummary,
  importRosterCsv,
  importRosterCsvFile,
  isSpreadsheetWorkbook,
  parseCsv,
  ROSTER_CSV_HEADERS,
  withUtf8Bom,
} from './rosterCsv.ts';
import { DIVISION_MAX, GYM_MAX, NAME_MAX, NOTE_MAX, canonicalBelt, clipName } from './rosterStore.ts';

export const SCOUTING_STORAGE_KEY = 'matboard.studentEdition.scouting.v1';
export const SCOUT_GROUPS = ['weight', 'open'] as const;
export type ScoutGroup = (typeof SCOUT_GROUPS)[number];

export type ScoutingCard = {
  id: string;
  name: string;
  gym: string;
  belt: string;
  weightClass: string;
  group: ScoutGroup;
  style: string;
  notes: string;
  /** Absent on cards saved before opponent ratings. Empty when nothing is rated. */
  ratings: AreaRatings;
  strengths: string;
  weaknesses: string;
};

export type ScoutingDraft = {
  name: string;
  gym: string;
  belt: string;
  weightClass: string;
  group: ScoutGroup;
  style: string;
  notes: string;
  ratings?: AreaRatings;
  strengths?: string;
  weaknesses?: string;
};

export type ScoutingImport = {
  cards: ScoutingCard[];
  imported: number;
  skipped: number;
  error?: string;
  skippedDetail?: string;
};

const SCOUT_EXTRA_HEADERS = ['Style', 'Class'] as const;
const SCOUT_NOTE_HEADERS = ['Strengths', 'Weaknesses'] as const;

function scoutingCsvHeader(): string[] {
  return [...ROSTER_CSV_HEADERS, ...SCOUT_EXTRA_HEADERS, ...ASSESSMENT_AREAS.map((area) => area.label), ...SCOUT_NOTE_HEADERS];
}

function clip(value: string, max: number): string {
  return value.normalize('NFC').trim().slice(0, max);
}

function newId(now: number): string {
  return `scout.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyScoutingDraft(): ScoutingDraft {
  return {
    name: '',
    gym: '',
    belt: '',
    weightClass: '',
    group: 'weight',
    style: '',
    notes: '',
    ratings: {},
    strengths: '',
    weaknesses: '',
  };
}

export function scoutGroupLabel(group: ScoutGroup): string {
  return group === 'open' ? 'Open class' : 'Weight class';
}

export function readScoutGroup(value: string): ScoutGroup {
  const text = value.trim().toLowerCase();
  if (text === 'open' || text === 'open class' || text === 'absolute') return 'open';
  return 'weight';
}

function cardFromDraft(draft: ScoutingDraft, id: string, prior?: ScoutingCard): ScoutingCard | null {
  const name = clipName(draft.name);
  const belt = canonicalBelt(draft.belt);
  if (!name || !belt) return null;
  return {
    id,
    name,
    gym: clip(draft.gym, GYM_MAX),
    belt,
    weightClass: clip(draft.weightClass, DIVISION_MAX),
    group: draft.group === 'open' ? 'open' : 'weight',
    style: clip(draft.style, NOTE_MAX),
    notes: clip(draft.notes, NOTE_MAX),
    ratings: draft.ratings === undefined ? (prior?.ratings ?? {}) : cleanRatings(draft.ratings),
    strengths: draft.strengths === undefined ? (prior?.strengths ?? '') : clip(draft.strengths, NOTE_MAX),
    weaknesses: draft.weaknesses === undefined ? (prior?.weaknesses ?? '') : clip(draft.weaknesses, NOTE_MAX),
  };
}

export function addScoutingCard(cards: readonly ScoutingCard[], draft: ScoutingDraft, now = Date.now()): ScoutingCard[] {
  const card = cardFromDraft(draft, newId(now));
  if (!card) throw new Error('Add a name and a belt.');
  return [...cards, card];
}

export function updateScoutingCard(
  cards: readonly ScoutingCard[],
  id: string,
  draft: ScoutingDraft,
): ScoutingCard[] {
  const current = cards.find((card) => card.id === id);
  if (!current) return [...cards];
  const card = cardFromDraft(draft, id, current);
  if (!card) throw new Error('Add a name and a belt.');
  return cards.map((item) => (item.id === id ? card : item));
}

export function removeScoutingCard(cards: readonly ScoutingCard[], id: string): ScoutingCard[] {
  return cards.filter((card) => card.id !== id);
}

export function searchScoutingCards(
  cards: readonly ScoutingCard[],
  results: readonly CompetitionResult[],
  query: string,
): ScoutingCard[] {
  const needle = query.trim().toLowerCase();
  const sorted = [...cards].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  if (!needle) return sorted;
  return sorted.filter((card) => scoutingHaystack(card, results).includes(needle));
}

export function scoutingHaystack(card: ScoutingCard, results: readonly CompetitionResult[]): string {
  const matches = pastMatchesFor(card.name, results).flatMap((hit) => [
    hit.result.tournamentName,
    hit.result.division,
    hit.match.opponent,
    hit.match.result,
    hit.match.method,
    hit.match.note,
  ]);
  return [
    card.name,
    card.gym,
    card.belt,
    card.weightClass,
    scoutGroupLabel(card.group),
    card.style,
    card.notes,
    card.strengths,
    card.weaknesses,
    ...matches,
  ]
    .join('\n')
    .toLowerCase();
}

export type PastMatchHit = {
  result: CompetitionResult;
  match: CompetitionResult['matches'][number];
};

/** Recorded results whose opponent name matches this card. */
export function pastMatchesFor(name: string, results: readonly CompetitionResult[]): PastMatchHit[] {
  const key = name.trim().toLowerCase();
  if (!key) return [];
  const hits: PastMatchHit[] = [];
  for (const result of results) {
    for (const match of result.matches) {
      if (match.opponent.trim().toLowerCase() === key) hits.push({ result, match });
    }
  }
  return hits;
}

export function loadScouting(storage: Pick<Storage, 'getItem'>): ScoutingCard[] {
  const raw = storage.getItem(SCOUTING_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { cards?: unknown };
    if (!Array.isArray(parsed.cards)) return [];
    return parsed.cards.map(normalizeCard).filter((card): card is ScoutingCard => card != null);
  } catch {
    return [];
  }
}

export function saveScouting(storage: Pick<Storage, 'setItem'>, cards: readonly ScoutingCard[]): ScoutingCard[] {
  const next = cards.map(normalizeCard).filter((card): card is ScoutingCard => card != null);
  storage.setItem(SCOUTING_STORAGE_KEY, JSON.stringify({ version: 1, cards: next }));
  return next;
}

function normalizeCard(value: unknown): ScoutingCard | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ScoutingCard>;
  return cardFromDraft(
    {
      name: typeof row.name === 'string' ? row.name : '',
      gym: typeof row.gym === 'string' ? row.gym : '',
      belt: typeof row.belt === 'string' ? row.belt : '',
      weightClass: typeof row.weightClass === 'string' ? row.weightClass : '',
      group: row.group === 'open' ? 'open' : 'weight',
      style: typeof row.style === 'string' ? row.style : '',
      notes: typeof row.notes === 'string' ? row.notes : '',
      ratings: cleanRatings(row.ratings),
      strengths: typeof row.strengths === 'string' ? row.strengths : '',
      weaknesses: typeof row.weaknesses === 'string' ? row.weaknesses : '',
    },
    typeof row.id === 'string' && row.id.trim() ? row.id.trim().slice(0, NAME_MAX) : newId(Date.now()),
  );
}

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

type ScoutExtra = {
  style: string;
  group: ScoutGroup;
  ratings: AreaRatings;
  strengths: string;
  weaknesses: string;
};

function columnAt(header: string[], ...keys: string[]): number {
  return header.findIndex((cell) => keys.includes(cell));
}

function extraByRow(text: string): ScoutExtra[] {
  const table = parseCsv(text.replace(/^\uFEFF/, ''), detectCsvDelimiter(text));
  const headerRow = table.findIndex((row) => row.some((cell) => headerKey(cell) === 'name' || headerKey(cell) === 'belt'));
  if (headerRow < 0) return [];
  const header = table[headerRow].map(headerKey);
  const styleAt = columnAt(header, 'style', 'tendencies', 'style tendencies');
  const classAt = columnAt(header, 'class', 'opponent class');
  const nameAt = columnAt(header, 'name', 'competitor', 'competitor name');
  const beltAt = columnAt(header, 'belt', 'rank');
  const strengthsAt = columnAt(header, 'strengths', 'strength');
  const weaknessesAt = columnAt(header, 'weaknesses', 'weakness');
  const ratingAt = ASSESSMENT_AREAS.map((area) => columnAt(header, headerKey(area.label), headerKey(`${area.label} rating`)));
  const extras: ScoutExtra[] = [];
  for (const row of table.slice(headerRow + 1)) {
    const name = nameAt >= 0 ? row[nameAt] ?? '' : '';
    const belt = beltAt >= 0 ? row[beltAt] ?? '' : '';
    if (!name.trim() || !belt.trim()) continue;
    const rawRatings: Record<string, string> = {};
    ASSESSMENT_AREAS.forEach((area, index) => {
      const at = ratingAt[index] ?? -1;
      if (at < 0) return;
      rawRatings[area.id] = row[at] ?? '';
    });
    extras.push({
      style: styleAt >= 0 ? (row[styleAt] ?? '').trim() : '',
      group: readScoutGroup(classAt >= 0 ? (row[classAt] ?? '') : ''),
      ratings: cleanRatings(rawRatings),
      strengths: strengthsAt >= 0 ? (row[strengthsAt] ?? '').trim() : '',
      weaknesses: weaknessesAt >= 0 ? (row[weaknessesAt] ?? '').trim() : '',
    });
  }
  return extras;
}

export function importScoutingCsv(text: string): ScoutingImport {
  const result = importRosterCsv(text);
  if (result.error) {
    return { cards: [], imported: 0, skipped: result.skipped, error: result.error, skippedDetail: result.skippedDetail };
  }
  const extras = extraByRow(text);
  const cards = result.students.map((student, index) => {
    const extra = extras.length === result.students.length ? extras[index] : undefined;
    return {
      id: student.id,
      name: student.name,
      gym: student.gym,
      belt: student.belt,
      weightClass: student.division,
      group: extra?.group ?? 'weight',
      style: clip(extra?.style ?? '', NOTE_MAX),
      notes: student.note,
      ratings: extra?.ratings ?? {},
      strengths: clip(extra?.strengths ?? '', NOTE_MAX),
      weaknesses: clip(extra?.weaknesses ?? '', NOTE_MAX),
    } satisfies ScoutingCard;
  });
  return {
    cards,
    imported: result.imported,
    skipped: result.skipped,
    skippedDetail: result.skippedDetail,
  };
}

export async function importScoutingCsvFile(file: {
  name?: string;
  type?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<ScoutingImport> {
  if (isSpreadsheetWorkbook(file)) {
    return { cards: [], imported: 0, skipped: 0, error: 'That looks like an Excel workbook. Save it as a CSV, then import.' };
  }
  const roster = await importRosterCsvFile(file);
  if (roster.error) {
    return { cards: [], imported: 0, skipped: roster.skipped, error: roster.error, skippedDetail: roster.skippedDetail };
  }
  const text = new TextDecoder().decode(await file.arrayBuffer());
  return importScoutingCsv(text);
}

export function exportScoutingCsv(cards: readonly ScoutingCard[]): string {
  const header = scoutingCsvHeader();
  const lines = [
    header.join(','),
    ...cards.map((card) =>
      [
        card.name,
        card.belt,
        card.weightClass,
        card.gym,
        '',
        '',
        card.notes,
        '',
        card.style,
        scoutGroupLabel(card.group),
        ...ASSESSMENT_AREAS.map((area) => (card.ratings[area.id] ? String(card.ratings[area.id]) : '')),
        card.strengths,
        card.weaknesses,
      ]
        .map(csvField)
        .join(','),
    ),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function scoutingCsvTemplate(): string {
  const header = scoutingCsvHeader();
  const blank = header.map(() => '').join(',');
  return `${[header.join(','), blank, blank, blank].join('\r\n')}\r\n`;
}

/** Same columns as exportScoutingCsv. Older templates that say Notes, or omit Style, Class, and ratings, still import. */
export function scoutingCsvHeaders(): readonly string[] {
  return scoutingCsvHeader();
}

export function scoutingExportFileName(day: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : 'scouting';
  return `advantage-student-scouting-${date}.csv`;
}

export function scoutingTemplateFileName(): string {
  return 'advantage-student-scouting-template.csv';
}

export function scoutingDownload(filename: string, csv: string): void {
  const blob = new Blob([withUtf8Bom(csv)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function scoutingImportSummary(result: ScoutingImport): string {
  return formatRosterCsvSummary(result.imported, result.skipped, result.skippedDetail);
}

export const SCOUTING_GYM_LABEL = COMPETITOR_GYM_LABEL;
