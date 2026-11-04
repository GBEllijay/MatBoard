/**
 * Seam to the Coach Clipboard roster card side store.
 *
 * The roster card PR keeps per-student card data beside `matboard.roster.v1`
 * under its own keys, keyed by roster student id. This module reads and fills
 * those same keys with the same field names, so CSV and the full backup work
 * today and keep working when the card UI lands. It never removes a card,
 * never empties a field, and never changes a field that already has a value.
 *
 * When the card PR merges, `rosterCardStore.ts` owns these keys. This file can
 * then import its constants and types instead of repeating them.
 *
 * Private coach notes live under their own key. Only the coach's own full
 * backup reads that key (see `rosterBackup.ts`). CSV never does.
 */

export const ROSTER_CARD_KEY = 'matboard.rosterCard.v1';
export const ROSTER_CARD_PRIVATE_KEY = 'matboard.rosterCard.private.v1';
/** Coach inbox: student card shares, tournament registration notices, competitor info. */
export const COACH_INBOX_KEY = 'matboard.rosterCard.inbox.v1';
export const ROSTER_CARD_EVENT = 'matboard-roster-card';

export type TrainingStyleChoice = 'gi' | 'nogi' | 'both';

/** Coach copy of belt dates. Same shape as `CoachRankLog` in the card PR. */
export type CoachRankLog = { belt: string; awardedOn: string; stripeDates: string[] };

/**
 * A card record. Known fields are typed; anything else the card store adds
 * later rides along untouched.
 */
export type RosterCardRecordLike = {
  trainingStartedOn?: string;
  trainingStyle?: TrainingStyleChoice | '';
  coachRank?: CoachRankLog;
  coachAssessments?: { id: string; date: string; [key: string]: unknown }[];
  benchmarkChecks?: Record<string, boolean>;
  trainingNotes?: string;
  competitorOn?: boolean;
  competitorCardId?: string;
  [key: string]: unknown;
};

export type RosterCardFile = { cards: Record<string, RosterCardRecordLike>; settings?: Record<string, unknown>; [key: string]: unknown };

export type CoachInboxItemLike = {
  packet: { updateId: string; studentId?: string; type?: string; [key: string]: unknown };
  status: string;
  receivedAt?: number;
  rosterId?: string;
  [key: string]: unknown;
};

/** The CSV columns that live on the card. Stripes stays on the roster student. */
export type CardCsvFields = {
  beltAchievedOn: string;
  lastStripeOn: string;
  trainingStartedOn: string;
  trainingStyle: TrainingStyleChoice | '';
};

export type KeyValueStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function defaultCardStorage(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function emit(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
    window.dispatchEvent(new Event(ROSTER_CARD_EVENT));
  }
}

function parseObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function readCardFile(storage: Pick<KeyValueStore, 'getItem'> | null): RosterCardFile {
  const parsed = parseObject(storage?.getItem(ROSTER_CARD_KEY) ?? null);
  if (!parsed) return { cards: {} };
  const cards: Record<string, RosterCardRecordLike> = {};
  const raw = parsed.cards;
  if (raw && typeof raw === 'object') {
    for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
      if (row && typeof row === 'object' && !Array.isArray(row)) cards[id] = row as RosterCardRecordLike;
    }
  }
  return { ...parsed, cards };
}

export function writeCardFile(storage: KeyValueStore, file: RosterCardFile): void {
  storage.setItem(ROSTER_CARD_KEY, JSON.stringify(file));
  emit();
}

export function readPrivateNotes(storage: Pick<KeyValueStore, 'getItem'> | null): Record<string, string> {
  const parsed = parseObject(storage?.getItem(ROSTER_CARD_PRIVATE_KEY) ?? null) ?? {};
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(parsed)) if (typeof text === 'string' && text) out[id] = text;
  return out;
}

export function writePrivateNotes(storage: KeyValueStore, notes: Record<string, string>): void {
  storage.setItem(ROSTER_CARD_PRIVATE_KEY, JSON.stringify(notes));
  emit();
}

export function readInboxItems(storage: Pick<KeyValueStore, 'getItem'> | null): CoachInboxItemLike[] {
  const parsed = parseObject(storage?.getItem(COACH_INBOX_KEY) ?? null);
  const items = parsed && Array.isArray(parsed.items) ? parsed.items : [];
  return items.filter(
    (row): row is CoachInboxItemLike =>
      Boolean(row) && typeof row === 'object' && typeof (row as CoachInboxItemLike).packet?.updateId === 'string' && typeof (row as CoachInboxItemLike).status === 'string',
  );
}

export function writeInboxItems(storage: KeyValueStore, items: CoachInboxItemLike[]): void {
  const parsed = parseObject(storage.getItem(COACH_INBOX_KEY)) ?? {};
  storage.setItem(COACH_INBOX_KEY, JSON.stringify({ ...parsed, items: items.slice(-300) }));
  emit();
}

export function parseTrainingStyle(value: string): TrainingStyleChoice | '' {
  const key = value.trim().toLowerCase().replace(/[^a-z&+/]+/g, '');
  if (!key) return '';
  if (key === 'gi') return 'gi';
  if (key === 'nogi' || key === 'nog' || key === 'ng') return 'nogi';
  if (key === 'both' || key === 'gi/nogi' || key === 'gi&nogi' || key === 'gi+nogi' || key === 'giandnogi' || key === 'all') return 'both';
  return '';
}

export function formatTrainingStyle(value: TrainingStyleChoice | '' | undefined): string {
  if (value === 'gi') return 'Gi';
  if (value === 'nogi') return 'No-Gi';
  if (value === 'both') return 'Both';
  return '';
}

function date(value: unknown): string {
  return typeof value === 'string' && DATE_RE.test(value) ? value : '';
}

/** CSV view of one card. Blank strings when the card has nothing. */
export function cardCsvFields(record: RosterCardRecordLike | undefined, belt: string): CardCsvFields {
  const rank = record?.coachRank;
  const sameBelt = Boolean(rank && typeof rank.belt === 'string' && rank.belt.toLowerCase() === belt.toLowerCase());
  const stripeDates = sameBelt && Array.isArray(rank?.stripeDates) ? rank!.stripeDates.map(date).filter(Boolean) : [];
  const style = record?.trainingStyle;
  return {
    beltAchievedOn: sameBelt ? date(rank?.awardedOn) : '',
    lastStripeOn: stripeDates.length ? [...stripeDates].sort().at(-1)! : '',
    trainingStartedOn: date(record?.trainingStartedOn),
    trainingStyle: style === 'gi' || style === 'nogi' || style === 'both' ? style : '',
  };
}

export function cardFieldsBlank(fields: CardCsvFields): boolean {
  return !fields.beltAchievedOn && !fields.lastStripeOn && !fields.trainingStartedOn && !fields.trainingStyle;
}

/**
 * Fill blank card fields from a CSV row. A field that already has a value stays.
 * `coachRank` is only written when the card has none.
 */
export function fillCardFromCsv(
  record: RosterCardRecordLike | undefined,
  fields: CardCsvFields,
  rank: { belt: string; stripes?: number },
): RosterCardRecordLike {
  const next: RosterCardRecordLike = { ...(record ?? {}) };
  if (!date(next.trainingStartedOn) && fields.trainingStartedOn) next.trainingStartedOn = fields.trainingStartedOn;
  if (!next.trainingStyle && fields.trainingStyle) next.trainingStyle = fields.trainingStyle;
  if (!next.coachRank && (fields.beltAchievedOn || fields.lastStripeOn)) {
    const count = Math.max(rank.stripes ?? 0, fields.lastStripeOn ? 1 : 0);
    const stripeDates = Array.from({ length: count }, () => '');
    if (fields.lastStripeOn && count > 0) stripeDates[count - 1] = fields.lastStripeOn;
    next.coachRank = { belt: rank.belt, awardedOn: fields.beltAchievedOn, stripeDates };
  }
  return next;
}

/** Write CSV card fields for newly added roster cards. Returns how many cards changed. */
export function applyCsvCardFields(
  rows: readonly { rosterId: string; belt: string; stripes?: number; fields: CardCsvFields }[],
  storage: KeyValueStore | null = defaultCardStorage(),
  now = Date.now(),
): number {
  if (!storage) return 0;
  const file = readCardFile(storage);
  let changed = 0;
  const cards = { ...file.cards };
  for (const row of rows) {
    if (cardFieldsBlank(row.fields)) continue;
    const before = cards[row.rosterId];
    const next = fillCardFromCsv(before, row.fields, { belt: row.belt, stripes: row.stripes });
    if (JSON.stringify(next) === JSON.stringify(before ?? {})) continue;
    cards[row.rosterId] = { ...next, updatedAt: now };
    changed += 1;
  }
  if (changed) writeCardFile(storage, { ...file, cards });
  return changed;
}

/** CSV export: card fields for a roster row, read once from the card store. */
export function csvCardLookup(
  storage: Pick<KeyValueStore, 'getItem'> | null = defaultCardStorage(),
): (row: { id?: string; belt: string }) => CardCsvFields | null {
  const { cards } = readCardFile(storage);
  return (row) => (row.id ? cardCsvFields(cards[row.id], row.belt) : null);
}

/**
 * CSV import: pair the parsed rows with the cards addStudents returned (same order)
 * so card fields land on the new roster ids.
 */
export function csvCardRows(
  parsed: readonly { id: string }[],
  added: readonly { id: string; belt: string; stripes?: number }[],
  cardFields: Readonly<Record<string, CardCsvFields>> | undefined,
): { rosterId: string; belt: string; stripes?: number; fields: CardCsvFields }[] {
  if (!cardFields) return [];
  const rows: { rosterId: string; belt: string; stripes?: number; fields: CardCsvFields }[] = [];
  parsed.forEach((row, index) => {
    const fields = cardFields[row.id];
    const card = added[index];
    if (!fields || !card) return;
    rows.push({ rosterId: card.id, belt: card.belt, stripes: card.stripes, fields });
  });
  return rows;
}
