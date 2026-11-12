/**
 * Private body scan: injury marks from journal cards and from the injury list,
 * grouped by fixed body zone, with a recovery trend. Never leaves the device
 * (no coach file, card share, or export). Adding from the list does not create a journal card.
 *
 * Rules
 * - A zone's newest mark starts its clock. A new mark on the same zone resets it to Hurt (red).
 * - Status set by the student wins: hurt = red, healing = amber easing to green, healed = green.
 * - No status set: the zone drifts from red to green over 28 days from the mark, then reads Healed.
 * - Healed zones glow green for 14 days (from markedOn, or from the day 28 drift), then drop off
 *   the scan; the marks stay in the journal and in history.
 */
import type { InjurySource, JournalEntry, StandaloneInjury, StudentProgressReport } from './progress/types.ts';
import { INJURY_SOURCES, PROGRESS_NAME_MAX } from './progress/types.ts';

export const BODY_ZONES = [
  { id: 'neck', label: 'Neck', side: 'front' },
  { id: 'shoulderL', label: 'Left shoulder', side: 'front' },
  { id: 'shoulderR', label: 'Right shoulder', side: 'front' },
  { id: 'elbowL', label: 'Left elbow', side: 'front' },
  { id: 'elbowR', label: 'Right elbow', side: 'front' },
  { id: 'wristL', label: 'Left wrist / hand', side: 'front' },
  { id: 'wristR', label: 'Right wrist / hand', side: 'front' },
  { id: 'ribs', label: 'Ribs', side: 'front' },
  { id: 'hips', label: 'Hips', side: 'front' },
  { id: 'kneeL', label: 'Left knee', side: 'front' },
  { id: 'kneeR', label: 'Right knee', side: 'front' },
  { id: 'ankleL', label: 'Left ankle / foot', side: 'front' },
  { id: 'ankleR', label: 'Right ankle / foot', side: 'front' },
  { id: 'upperBack', label: 'Upper back', side: 'back' },
  { id: 'lowerBack', label: 'Lower back', side: 'back' },
] as const;
export type BodyZone = (typeof BODY_ZONES)[number]['id'];
export type InjuryStatus = 'hurt' | 'healing' | 'healed';
export const INJURY_STATUSES: readonly InjuryStatus[] = ['hurt', 'healing', 'healed'];
export const STATUS_LABEL: Record<InjuryStatus, string> = { hurt: 'Hurt', healing: 'Healing', healed: 'Healed' };
export { INJURY_SOURCES };
export type { InjurySource, StandaloneInjury };
export const INJURY_SOURCE_LABEL: Record<InjurySource, string> = { training: 'In class', outside: 'Outside of training' };
export const HEAL_DAYS = 28;
export const HEALED_GLOW_DAYS = 14;
export const BODY_SCAN_KEY = 'advantage.student.bodyScan.v1';

export function zoneLabel(zone: string): string {
  return BODY_ZONES.find((z) => z.id === zone)?.label ?? 'Other';
}
export function isBodyZone(zone: string): zone is BodyZone {
  return BODY_ZONES.some((z) => z.id === zone);
}

/** Saved per device. Off unless the student turns it on (private health info). */
export function readBodyScanOn(storage: Pick<Storage, 'getItem'> | null): boolean {
  return storage?.getItem(BODY_SCAN_KEY) === 'on';
}
export function saveBodyScanOn(storage: Pick<Storage, 'setItem'>, on: boolean): void {
  storage.setItem(BODY_SCAN_KEY, on ? 'on' : 'off');
}

/** Old free-text areas → a zone, by keyword. Unmatched → '' (legend "Other"). */
export function zoneFromText(text: string): BodyZone | '' {
  const t = ` ${text.toLowerCase().replace(/[^a-z ]/g, ' ')} `;
  const left = /\b(left|l|lt)\b/.test(t);
  const right = /\b(right|r|rt)\b/.test(t);
  const sided = (l: BodyZone, r: BodyZone): BodyZone => (right && !left ? r : l);
  if (/\b(neck|cervical|trap)/.test(t)) return 'neck';
  if (/\b(lower back|low back|lumbar)\b/.test(t)) return 'lowerBack';
  if (/\b(upper back|back|spine|thoracic)\b/.test(t)) return /\blower\b/.test(t) ? 'lowerBack' : 'upperBack';
  if (/\b(rib|ribs|chest|sternum)\b/.test(t)) return 'ribs';
  if (/\b(shoulder|rotator|collarbone|clavicle)/.test(t)) return sided('shoulderL', 'shoulderR');
  if (/\b(elbow|forearm|tennis)/.test(t)) return sided('elbowL', 'elbowR');
  if (/\b(wrist|hand|finger|thumb|knuckle)/.test(t)) return sided('wristL', 'wristR');
  if (/\b(hip|groin|glute)/.test(t)) return 'hips';
  if (/\b(knee|mcl|acl|meniscus)/.test(t)) return sided('kneeL', 'kneeR');
  if (/\b(ankle|foot|feet|toe|heel)/.test(t)) return sided('ankleL', 'ankleR');
  return '';
}

export type InjuryMark = {
  entryId: string;
  /** The journal card's date, or the date entered on a list injury. */
  date: string;
  area: string;
  note: string;
  zone: BodyZone | '';
  status: InjuryStatus | null;
  markedOn: string;
  /** True when this mark came from a journal card. */
  fromJournal: boolean;
  /** How it happened. Absent on older journal marks. */
  source?: InjurySource;
};

export type ZoneScan = {
  zone: BodyZone | '';
  label: string;
  status: InjuryStatus;
  /** 0 = red (hurt) … 1 = green (healed). */
  heal: number;
  /** Days since the newest mark. */
  day: number;
  color: string;
  /** Newest first. */
  marks: InjuryMark[];
};

function days(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : 0;
}

function markZone(area: string, zone?: string): BodyZone | '' {
  return zone && isBodyZone(zone) ? zone : zoneFromText(`${area} ${zone ?? ''}`);
}

function markFromJournal(e: JournalEntry): InjuryMark {
  const inj = e.injury!;
  return {
    entryId: e.id,
    date: e.date,
    area: inj.area,
    note: inj.note,
    zone: markZone(inj.area, inj.zone),
    status: inj.status ?? null,
    markedOn: inj.markedOn ?? '',
    fromJournal: true,
  };
}

function markFromList(inj: StandaloneInjury): InjuryMark {
  return {
    entryId: inj.id,
    date: inj.date,
    area: inj.area,
    note: inj.note,
    zone: markZone(inj.area, inj.zone),
    status: inj.status ?? null,
    markedOn: inj.markedOn ?? '',
    fromJournal: false,
    ...(inj.source ? { source: inj.source } : {}),
  };
}

function sortMarks(marks: InjuryMark[]): InjuryMark[] {
  return marks.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

/** Journal marks, plus optional injuries added from the list. Existing journal-only callers stay unchanged. */
export function injuryMarks(journal: readonly JournalEntry[], extras: readonly StandaloneInjury[] = []): InjuryMark[] {
  return sortMarks([
    ...journal.filter((e) => e.injury).map(markFromJournal),
    ...extras.map(markFromList),
  ]);
}

export function reportInjuryMarks(report: Pick<StudentProgressReport, 'journal' | 'injuries'>): InjuryMark[] {
  return injuryMarks(report.journal, report.injuries ?? []);
}

/** Red (0) → amber (0.5) → green (1). */
export function healColor(heal: number): string {
  const h = Math.max(0, Math.min(1, heal));
  const stops = [
    [0xff, 0x4d, 0x3a],
    [0xff, 0xb0, 0x20],
    [0x3d, 0xe0, 0x8a],
  ];
  const [a, b, t] = h <= 0.5 ? [stops[0], stops[1], h * 2] : [stops[1], stops[2], (h - 0.5) * 2];
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** One zone's trend from its marks (newest first). Null once healed for more than 14 days. */
export function zoneTrend(marks: readonly InjuryMark[], today: string): Omit<ZoneScan, 'zone' | 'label' | 'marks'> | null {
  const newest = marks[0];
  if (!newest) return null;
  const day = Math.max(0, days(newest.date, today));
  const since = newest.markedOn || newest.date;
  let status: InjuryStatus;
  let heal: number;
  let healedOn = '';
  if (newest.status === 'hurt') {
    status = 'hurt';
    heal = 0;
  } else if (newest.status === 'healed') {
    status = 'healed';
    heal = 1;
    healedOn = since;
  } else if (newest.status === 'healing') {
    status = 'healing';
    heal = Math.min(0.95, 0.5 + (0.45 * Math.max(0, days(since, today))) / HEAL_DAYS);
  } else if (day >= HEAL_DAYS) {
    status = 'healed';
    heal = 1;
    const d = new Date(`${newest.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + HEAL_DAYS);
    healedOn = d.toISOString().slice(0, 10);
  } else {
    heal = day / HEAL_DAYS;
    // Unmarked: Hurt for the first half, then Healing as it drifts toward green.
    status = heal < 0.5 ? 'hurt' : 'healing';
  }
  if (status === 'healed' && days(healedOn, today) > HEALED_GLOW_DAYS) return null;
  return { status, heal, day, color: healColor(heal) };
}

export type BodyScanView = { zones: ZoneScan[]; other: ZoneScan[] };

export function bodyScan(journal: readonly JournalEntry[], today: string, extras: readonly StandaloneInjury[] = []): BodyScanView {
  const marks = injuryMarks(journal, extras);
  const byZone = new Map<string, InjuryMark[]>();
  const other: ZoneScan[] = [];
  for (const mark of marks) {
    if (!mark.zone) {
      const trend = zoneTrend([mark], today);
      if (trend) other.push({ zone: '', label: mark.area || 'Other', marks: [mark], ...trend });
      continue;
    }
    byZone.set(mark.zone, [...(byZone.get(mark.zone) ?? []), mark]);
  }
  const zones: ZoneScan[] = [];
  for (const z of BODY_ZONES) {
    const list = byZone.get(z.id);
    if (!list) continue;
    const trend = zoneTrend(list, today);
    if (trend) zones.push({ zone: z.id, label: z.label, marks: list, ...trend });
  }
  return { zones, other };
}

/** All marks for a zone (newest first), including ones that dropped off the scan. */
export function zoneMarks(journal: readonly JournalEntry[], zone: string, extras: readonly StandaloneInjury[] = []): InjuryMark[] {
  return injuryMarks(journal, extras).filter((m) => (zone === 'other' ? !m.zone : m.zone === zone));
}

export function reportZoneMarks(report: Pick<StudentProgressReport, 'journal' | 'injuries'>, zone: string): InjuryMark[] {
  return zoneMarks(report.journal, zone, report.injuries ?? []);
}

/** Set a journal mark's status; stamps markedOn. Returns a new journal. */
export function setInjuryStatus(journal: readonly JournalEntry[], entryId: string, status: InjuryStatus, today: string): JournalEntry[] {
  return journal.map((e) => (e.id === entryId && e.injury ? { ...e, injury: { ...e.injury, status, markedOn: today } } : e));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type InjuryDraft = {
  date: string;
  area: string;
  note?: string;
  zone?: string;
  status?: InjuryStatus;
  source?: InjurySource;
};

function newInjuryId(now: number): string {
  return `inj.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

/** Add an injury on the list. Does not create a journal card. */
export function addInjury(report: StudentProgressReport, draft: InjuryDraft, now = Date.now()): StudentProgressReport {
  if (!DATE_RE.test(draft.date)) throw new Error('Date must be YYYY-MM-DD.');
  const zone = draft.zone && isBodyZone(draft.zone) ? draft.zone : undefined;
  const area = draft.area.trim().slice(0, PROGRESS_NAME_MAX) || (zone ? zoneLabel(zone) : '');
  if (!area) throw new Error('Choose a body area or zone.');
  const status: InjuryStatus = draft.status && INJURY_STATUSES.includes(draft.status) ? draft.status : 'hurt';
  const source: InjurySource = draft.source === 'training' ? 'training' : 'outside';
  const record: StandaloneInjury = {
    id: newInjuryId(now),
    date: draft.date,
    area,
    note: (draft.note ?? '').trim().slice(0, PROGRESS_NAME_MAX * 4),
    status,
    markedOn: draft.date,
    source,
    createdAt: now,
    updatedAt: now,
  };
  if (zone) record.zone = zone;
  return { ...report, updatedAt: now, injuries: [...(report.injuries ?? []), record] };
}

/** Set status on a journal mark or a list injury. Journal cards stay as they are when the id is a list injury. */
export function setReportInjuryStatus(report: StudentProgressReport, entryId: string, status: InjuryStatus, today: string, now = Date.now()): StudentProgressReport {
  if (report.journal.some((e) => e.id === entryId && e.injury)) {
    return { ...report, updatedAt: now, journal: setInjuryStatus(report.journal, entryId, status, today) };
  }
  const list = report.injuries ?? [];
  if (!list.some((row) => row.id === entryId)) return report;
  return {
    ...report,
    updatedAt: now,
    injuries: list.map((row) => (row.id === entryId ? { ...row, status, markedOn: today, updatedAt: now } : row)),
  };
}

export function trendLine(scan: ZoneScan): string {
  return `${scan.label} · ${STATUS_LABEL[scan.status]} · day ${scan.day}`;
}

export function journalEntryHref(entryId: string): string {
  return `/student/cards/${encodeURIComponent(entryId)}#injury`;
}
export function bodyScanHref(zone: string): string {
  return `/student?zone=${encodeURIComponent(zone || 'other')}&scan=1#body-scan`;
}

/**
 * Hologram V2 silhouette (approved mockup), one androgynous body with the type-2 frame:
 * shoulders pulled in, hips a touch wider, softer waist. Coordinates are the mockup's
 * 200×400 figure box (center x = 100); the floor rings sit at y = 410.
 */
export const BODY_FRAME = { shoulder: 23, hip: 21 } as const;
const V2_HALF: readonly (readonly [number, number])[] = [
  [9, 56], [10, 66], [25, 72], [39, 78], [46, 90], [50, 118], [53, 148], [54, 160], [56, 188], [58, 212], [57, 222], [61, 234], [55, 250], [47, 249], [44, 233], [46, 221], [42, 192], [38, 163], [36, 132], [33, 114],
  [35, 140], [33, 176], [41, 198], [42, 238], [36, 288], [32, 304], [34, 330], [27, 368], [22, 382], [28, 394], [11, 397], [12, 383], [12, 368], [10, 330], [12, 300], [8, 252], [0, 214],
];
export function bodyOutlinePath(cx = 100): string {
  const right = V2_HALF.map(([x, y]) => [cx + x, y]);
  const left = [...V2_HALF.slice(0, -1)].reverse().map(([x, y]) => [cx - x, y]);
  return 'M' + [...right, ...left].map(([x, y]) => `${x} ${y}`).join(' L') + 'Z';
}
const ZONE_V2: Record<BodyZone, [number, number]> = {
  neck: [0, 62], shoulderR: [-38, 86], shoulderL: [38, 86], elbowR: [-50, 160], elbowL: [50, 160], wristR: [-55, 214], wristL: [55, 214],
  ribs: [0, 130], hips: [0, 204], kneeR: [-22, 304], kneeL: [22, 304], ankleR: [-18, 374], ankleL: [18, 374], upperBack: [0, 96], lowerBack: [0, 182],
};
/** Zone center on the V2 figure. Viewer's left = student's right on the front view. */
export function zonePoint(zone: BodyZone): { x: number; y: number } {
  const [dx, y] = ZONE_V2[zone];
  return { x: 100 + dx, y };
}

/** Color meanings for the "What the colors mean" sheet. */
export const COLOR_MEANINGS = [
  { id: 'hurt', color: '#ff4d3a', name: 'Red · Hurt', text: 'A fresh or recurring injury mark. A new mark on the same zone turns it red again.' },
  { id: 'watch', color: '#ffb020', name: 'Amber · Watch out', text: 'Older or healing. Train around it and keep an eye on it.' },
  { id: 'healing', color: '#3de08a', name: 'Green · Healing / healed', text: 'Getting better or healed. Healed zones glow green for 14 days, then leave the scan. Marks stay in your journal.' },
  { id: 'working', color: '#3d8bff', name: 'Blue · Working on', text: 'An area you are working on.' },
] as const;
