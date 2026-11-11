/**
 * Opponent card archive. Cards stay on this phone.
 * CSV import and export use the shared name columns, plus Style, Class,
 * eight rating columns, Strengths, Weaknesses, and Record.
 * A file without the newer columns still imports. Sweeps stays blank
 * on a card saved before that area existed.
 */

import { competitionOf } from './progress/competition.ts';
import type { CompetitionResult } from './progress/types.ts';
import { loadStudentReport } from './studentEdition.ts';
import { isAssessmentScore } from './studentAssessment.ts';
import { cleanRatings, type AreaRatings, type ScoutAreaId } from './opponentAssessment.ts';
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

export const SCOUT_RESULTS = ['win', 'loss', 'draw'] as const;
export type ScoutResult = (typeof SCOUT_RESULTS)[number];

/** One result against this opponent. Date, event, and method can be blank. */
export type ScoutBout = {
  id: string;
  result: ScoutResult;
  date: string;
  event: string;
  method: string;
};

export type ScoutBoutDraft = {
  result: ScoutResult;
  date?: string;
  event?: string;
  method?: string;
};

export type ScoutRecord = {
  wins: number;
  losses: number;
  draws: number;
  /** Wins-losses-draws, for example 3-1-0. */
  line: string;
};

export type ScoutingCard = {
  id: string;
  name: string;
  gym: string;
  belt: string;
  weightClass: string;
  group: ScoutGroup;
  style: string;
  notes: string;
  /** Absent areas are unrated. Older cards omit Sweeps. */
  ratings: AreaRatings;
  strengths: string;
  weaknesses: string;
  /** Manual results. Older cards omit this and load as an empty list. */
  bouts: ScoutBout[];
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
  bouts?: readonly ScoutBout[];
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
const SCOUT_RECORD_HEADER = 'Record';

/**
 * Export labels stay the short names an older file already uses.
 * Sweeps is the added column. Import also accepts Guard/Control and Escapes/Defense.
 */
const RATING_COLUMNS: readonly { id: ScoutAreaId; label: string; keys: readonly string[] }[] = [
  { id: 'guard', label: 'Guard', keys: ['guard', 'guard control'] },
  { id: 'passing', label: 'Passing', keys: ['passing'] },
  { id: 'sweeps', label: 'Sweeps', keys: ['sweeps'] },
  { id: 'takedowns', label: 'Takedowns', keys: ['takedowns'] },
  { id: 'escapes', label: 'Escapes', keys: ['escapes', 'escapes defense'] },
  { id: 'submissions', label: 'Submissions', keys: ['submissions'] },
  { id: 'conditioning', label: 'Conditioning', keys: ['conditioning'] },
  { id: 'mindset', label: 'Mindset', keys: ['mindset'] },
];

function scoutingCsvHeader(): string[] {
  return [
    ...ROSTER_CSV_HEADERS,
    ...SCOUT_EXTRA_HEADERS,
    ...RATING_COLUMNS.map((area) => area.label),
    ...SCOUT_NOTE_HEADERS,
    SCOUT_RECORD_HEADER,
  ];
}

function clip(value: string, max: number): string {
  return value.normalize('NFC').trim().slice(0, max);
}

function newId(now: number): string {
  return `scout.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

function boutId(now: number): string {
  return `bout.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

function cleanDate(value: string): string {
  const text = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function cleanBout(value: unknown, fallbackId?: string): ScoutBout | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ScoutBout>;
  if (row.result !== 'win' && row.result !== 'loss' && row.result !== 'draw') return null;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim().slice(0, NAME_MAX) : fallbackId;
  if (!id) return null;
  return {
    id,
    result: row.result,
    date: cleanDate(typeof row.date === 'string' ? row.date : ''),
    event: clip(typeof row.event === 'string' ? row.event : '', NOTE_MAX),
    method: clip(typeof row.method === 'string' ? row.method : '', NOTE_MAX),
  };
}

function cleanBouts(value: unknown): ScoutBout[] {
  if (!Array.isArray(value)) return [];
  const bouts: ScoutBout[] = [];
  for (const item of value) {
    const bout = cleanBout(item);
    if (bout && !bouts.some((row) => row.id === bout.id)) bouts.push(bout);
  }
  return bouts;
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
    bouts: [],
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
    bouts: draft.bouts === undefined ? (prior?.bouts ?? []) : cleanBouts(draft.bouts),
  };
}

export function addScoutBout(bouts: readonly ScoutBout[], draft: ScoutBoutDraft, now = Date.now()): ScoutBout[] {
  const bout = cleanBout({ ...draft, id: boutId(now) });
  if (!bout) throw new Error('Choose a win, loss, or draw.');
  return [...cleanBouts(bouts), bout];
}

export function updateScoutBout(bouts: readonly ScoutBout[], id: string, draft: ScoutBoutDraft): ScoutBout[] {
  const current = bouts.find((bout) => bout.id === id);
  if (!current) return cleanBouts(bouts);
  const bout = cleanBout({ ...draft, id: current.id });
  if (!bout) throw new Error('Choose a win, loss, or draw.');
  return cleanBouts(bouts).map((item) => (item.id === id ? bout : item));
}

export function removeScoutBout(bouts: readonly ScoutBout[], id: string): ScoutBout[] {
  return cleanBouts(bouts).filter((bout) => bout.id !== id);
}

/**
 * Manual results plus competition matches for this name.
 * A competition match is skipped when a manual result already has the same
 * outcome and the same event. If both dates are filled and they differ, both count.
 */
export function scoutRecordFromStorage(card: ScoutingCard, storage: Pick<Storage, 'getItem'>): ScoutRecord {
  return scoutRecord(card, competitionOf(loadStudentReport(storage)).results);
}

export function scoutRecord(card: ScoutingCard, results: readonly CompetitionResult[]): ScoutRecord {
  const hits = pastMatchesFor(card.name, results);
  const used = new Set<string>();
  for (const bout of card.bouts) {
    const hit = hits.find((item) => !used.has(item.match.id) && sameEncounter(bout, item));
    if (hit) used.add(hit.match.id);
  }
  let wins = 0;
  let losses = 0;
  let draws = 0;
  const add = (result: ScoutResult) => {
    if (result === 'win') wins += 1;
    else if (result === 'loss') losses += 1;
    else draws += 1;
  };
  for (const bout of card.bouts) add(bout.result);
  for (const hit of hits) {
    if (!used.has(hit.match.id)) add(hit.match.result);
  }
  return { wins, losses, draws, line: `${wins}-${losses}-${draws}` };
}

function sameEncounter(bout: ScoutBout, hit: PastMatchHit): boolean {
  if (bout.result !== hit.match.result) return false;
  const event = bout.event.trim().toLowerCase();
  const tournament = hit.result.tournamentName.trim().toLowerCase();
  if (!event || event !== tournament) return false;
  const boutDate = bout.date.trim();
  const matchDate = (hit.match.date ?? '').trim();
  if (boutDate && matchDate && boutDate !== matchDate) return false;
  return true;
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
    ...card.bouts.flatMap((bout) => [bout.result, bout.date, bout.event, bout.method]),
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
      bouts: cleanBouts((row as { bouts?: unknown }).bouts),
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
  bouts: ScoutBout[];
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
  const recordAt = columnAt(header, 'record', 'win loss record');
  const ratingAt = RATING_COLUMNS.map((area) => {
    const keys = area.keys.flatMap((key) => [key, `${key} rating`]);
    return columnAt(header, ...keys);
  });
  const extras: ScoutExtra[] = [];
  for (const row of table.slice(headerRow + 1)) {
    const name = nameAt >= 0 ? row[nameAt] ?? '' : '';
    const belt = beltAt >= 0 ? row[beltAt] ?? '' : '';
    if (!name.trim() || !belt.trim()) continue;
    const rawRatings: Record<string, string> = {};
    RATING_COLUMNS.forEach((area, index) => {
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
      bouts: recordAt >= 0 ? parseScoutRecord(row[recordAt] ?? '') : [],
    });
  }
  return extras;
}

export function serializeScoutRecord(bouts: readonly ScoutBout[]): string {
  if (!bouts.length) return '';
  return JSON.stringify(
    bouts.map((bout) => ({
      id: bout.id,
      result: bout.result,
      date: bout.date,
      event: bout.event,
      method: bout.method,
    })),
  );
}

export function parseScoutRecord(value: string): ScoutBout[] {
  const text = value.trim();
  if (!text) return [];
  try {
    return cleanBouts(JSON.parse(text) as unknown);
  } catch {
    return [];
  }
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
      bouts: extra?.bouts ?? [],
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
        ...RATING_COLUMNS.map((area) => (isAssessmentScore(card.ratings[area.id]) ? String(card.ratings[area.id]) : '')),
        card.strengths,
        card.weaknesses,
        serializeScoutRecord(card.bouts),
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

/** Same columns as exportScoutingCsv. Older templates that omit Style, Class, Sweeps, or Record still import. */
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

/** Stable id for the labeled sample card a preview can open. */
export const SAMPLE_OPPONENT_ID = 'sample.sam-rivera';

/**
 * Preview-only cards. Names say sample. They are written only when the
 * archive is empty and the page was opened with sample=1.
 */
export function sampleScoutingCards(): ScoutingCard[] {
  return [
    {
      id: SAMPLE_OPPONENT_ID,
      name: 'Sam Rivera (sample)',
      gym: 'Sample Gym',
      belt: 'Blue',
      weightClass: 'Middle',
      group: 'weight',
      style: 'Pressure passing',
      notes: 'Sample card. Not a real opponent.',
      ratings: {
        guard: 2,
        passing: 5,
        sweeps: 3,
        takedowns: 4,
        escapes: 4,
        submissions: 1,
        conditioning: 4,
        mindset: 5,
      },
      strengths: 'Pressure passing',
      weaknesses: 'Back takes',
      bouts: [
        { id: 'sample.bout.1', result: 'win', date: '2026-03-14', event: 'City Open (sample)', method: 'points' },
        { id: 'sample.bout.2', result: 'win', date: '2026-05-02', event: 'City Open (sample)', method: 'armbar' },
        { id: 'sample.bout.3', result: 'win', date: '2026-06-20', event: 'Summer Open (sample)', method: '' },
        { id: 'sample.bout.4', result: 'loss', date: '2026-08-01', event: 'Summer Open (sample)', method: 'points' },
      ],
    },
    {
      id: 'sample.riley-cho',
      name: 'Riley Cho (sample)',
      gym: 'Sample Gym',
      belt: 'Purple',
      weightClass: 'Light',
      group: 'open',
      style: 'Open guard',
      notes: 'Sample card. Not a real opponent.',
      ratings: { guard: 5, passing: 2, sweeps: 5, takedowns: 1, escapes: 3, submissions: 4, conditioning: 3, mindset: 2 },
      strengths: 'Open guard',
      weaknesses: 'Top pressure',
      bouts: [],
    },
  ];
}

export function seedSampleScouting(storage: Pick<Storage, 'getItem' | 'setItem'>, search: string): ScoutingCard[] {
  const saved = loadScouting(storage);
  if (saved.length > 0 || !/(?:^|[?&])sample=1(?:&|$)/.test(search)) return saved;
  return saveScouting(storage, sampleScoutingCards());
}
