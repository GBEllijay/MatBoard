/**
 * Private body scan: injury marks from journal cards, grouped by fixed body zone,
 * with a recovery trend. Never leaves the device (no coach file, card share, or export).
 *
 * Rules
 * - A zone's newest mark starts its clock. A new mark on the same zone resets it to Hurt (red).
 * - Status set by the student wins: hurt = red, healing = amber easing to green, healed = green.
 * - No status set: the zone drifts from red to green over 28 days from the mark, then reads Healed.
 * - Healed zones glow green for 14 days (from markedOn, or from the day 28 drift), then drop off
 *   the scan; the marks stay in the journal and in history.
 */
import type { JournalEntry } from './progress/types.ts';

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
  /** The journal card's date. */
  date: string;
  area: string;
  note: string;
  zone: BodyZone | '';
  status: InjuryStatus | null;
  markedOn: string;
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

export function injuryMarks(journal: readonly JournalEntry[]): InjuryMark[] {
  return journal
    .filter((e) => e.injury)
    .map((e) => {
      const inj = e.injury!;
      const zone = inj.zone && isBodyZone(inj.zone) ? inj.zone : zoneFromText(`${inj.area} ${inj.zone ?? ''}`);
      return { entryId: e.id, date: e.date, area: inj.area, note: inj.note, zone, status: inj.status ?? null, markedOn: inj.markedOn ?? '' };
    })
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
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

export function bodyScan(journal: readonly JournalEntry[], today: string): BodyScanView {
  const marks = injuryMarks(journal);
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
export function zoneMarks(journal: readonly JournalEntry[], zone: string): InjuryMark[] {
  return injuryMarks(journal).filter((m) => (zone === 'other' ? !m.zone : m.zone === zone));
}

/** Set a mark's status; stamps markedOn. Returns a new journal. */
export function setInjuryStatus(journal: readonly JournalEntry[], entryId: string, status: InjuryStatus, today: string): JournalEntry[] {
  return journal.map((e) => (e.id === entryId && e.injury ? { ...e, injury: { ...e.injury, status, markedOn: today } } : e));
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
