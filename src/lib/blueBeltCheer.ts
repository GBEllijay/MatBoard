/**
 * Kids belt → blue belt, pushed by the coach. A rite of passage.
 *
 * Coach side: promoting a kids-belt card (Grey, Yellow, Orange, Green) to Blue
 * asks the coach to confirm the belt and the birth year before anything is sent.
 * Student side: an incoming coach rank update that moves a kids-belt file to
 * Blue asks the student to confirm the belt and birth year. Confirm moves the
 * file to the adult system (kids belts stay under Earlier belts) and the master
 * congratulates the coach, with confetti, once per promotion.
 *
 * The packet is the existing coach-rank-update (schema v2). Nothing new rides on it.
 * Adult-to-adult promotions and other belts never take this path.
 */

import { acceptCoachRankUpdate, buildCoachRankUpdate, type UpdateLedger } from './coachRankUpdate.ts';
import { blankStudentReport } from './studentEdition.ts';
import { beltModeOf, ibjjfAge, setBeltMode, setBirthYear, setKidsBelt, startAdultFromKids } from './studentRank.ts';
import { canonicalBelt, KIDS_BELTS } from './rosterStore.ts';
import type { CoachRankUpdatePacket, ProgressBelt, StudentProgressReport } from './progress/types.ts';

export const BLUE_BELT_CHEER_KEY = 'matboard.studentEdition.blueBeltCheer.v1';
export const BLUE_BELT_CHEER_LINES = ['Parabéns, Coach!', 'Good job. The blue belt is yours.'] as const;
export const ADULT_BELT_AGE = 16;

const KIDS_PROGRESS_BELTS: readonly ProgressBelt[] = ['grey', 'yellow', 'orange', 'green'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEEN_MAX = 20;

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/* --------------------------------- coach --------------------------------- */

export function isKidsRosterBelt(belt: string): boolean {
  return (KIDS_BELTS as readonly string[]).includes(canonicalBelt(belt));
}

/** The coach saved a kids-belt card as Blue. Only this asks for the blue-belt confirmation. */
export function coachKidsToBlue(previousBelt: string | null | undefined, nextBelt: string): boolean {
  if (!previousBelt) return false;
  return isKidsRosterBelt(previousBelt) && canonicalBelt(nextBelt) === 'Blue';
}

export function cleanBirthYear(value: unknown, today = new Date()): number | null {
  const year = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof year !== 'number' || !Number.isInteger(year)) return null;
  if (year < 1900 || year > today.getFullYear()) return null;
  return year;
}

/** Gentle notes only. The coach (or student) can still confirm. */
export function blueBeltNotes(
  input: { birthYear: number | null; trainingSince?: string; name?: string; self?: boolean },
  today = new Date(),
): string[] {
  const who = input.name?.trim() || 'this student';
  const notes: string[] = [];
  if (input.birthYear == null) {
    notes.push('No birth year yet. IBJJF adult belts start the year a student turns 16.');
  } else {
    const age = ibjjfAge(input.birthYear, today);
    if (age < ADULT_BELT_AGE) {
      notes.push(
        input.self
          ? `By birth year, you turn ${age} this year. IBJJF adult belts start at ${ADULT_BELT_AGE}.`
          : `By birth year, ${who} turns ${age} this year. IBJJF adult belts start at ${ADULT_BELT_AGE}.`,
      );
    }
  }
  const since = input.trainingSince ?? '';
  if (!DATE_RE.test(since)) {
    notes.push('No training start date saved, so a year of training is not checked.');
  } else {
    const yearAgo = new Date(today);
    yearAgo.setFullYear(today.getFullYear() - 1);
    const cutoff = `${yearAgo.getFullYear()}-${String(yearAgo.getMonth() + 1).padStart(2, '0')}-${String(yearAgo.getDate()).padStart(2, '0')}`;
    if (since > cutoff) notes.push(`Training since ${since}: under a year.`);
  }
  return notes;
}

/* -------------------------------- student -------------------------------- */

/** A coach rank update that moves a kids-belt file onto Blue. */
export function isKidsToBlueUpdate(
  report: StudentProgressReport,
  packet: { kind: string; rankUpdate?: { belt: ProgressBelt } },
): packet is CoachRankUpdatePacket {
  if (packet.kind !== 'coach-rank-update' || packet.rankUpdate?.belt !== 'blue') return false;
  if (beltModeOf(report) === 'kids') return true;
  return KIDS_PROGRESS_BELTS.includes(report.profile.belt);
}

/**
 * Student confirmed the blue belt and birth year. Sets the birth year, moves the
 * file to the adult system on the promotion date, then applies the coach update
 * (stripes, journal card) as before. Any other update is the plain accept.
 */
export function acceptCoachBlueBelt(
  report: StudentProgressReport,
  packet: CoachRankUpdatePacket,
  ledger: UpdateLedger,
  confirm: { birthYear: number | null },
  now = Date.now(),
): { report: StudentProgressReport; ledger: UpdateLedger; applied: boolean; cheer: boolean } {
  if (!isKidsToBlueUpdate(report, packet)) return { ...acceptCoachRankUpdate(report, packet, ledger, now), cheer: false };
  if (packet.studentId !== report.studentId || ledger.accepted.includes(packet.updateId) || ledger.dismissed.includes(packet.updateId)) {
    return { report, ledger, applied: false, cheer: false };
  }
  let next = report;
  if (confirm.birthYear != null) next = setBirthYear(next, confirm.birthYear, now);
  next = startAdultFromKids(next, 'blue', packet.rankUpdate.promotionDate, now);
  const result = acceptCoachRankUpdate(next, packet, ledger, now);
  return { ...result, cheer: result.applied };
}

function readSeen(storage: Pick<MemoryStore, 'getItem'>): Record<string, string[]> {
  try {
    const parsed = JSON.parse(storage.getItem(BLUE_BELT_CHEER_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [id, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(list)) out[id] = list.filter((item): item is string => typeof item === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

export function blueCheerSeen(storage: Pick<MemoryStore, 'getItem'>, studentId: string, updateId: string): boolean {
  return (readSeen(storage)[studentId] ?? []).includes(updateId);
}

/** True the first time for this profile and promotion. Records it so a reload never replays the cheer. */
export function claimBlueCheer(storage: MemoryStore, studentId: string, updateId: string): boolean {
  const seen = readSeen(storage);
  const list = seen[studentId] ?? [];
  if (list.includes(updateId)) return false;
  seen[studentId] = [...list, updateId].slice(-SEEN_MAX);
  try {
    storage.setItem(BLUE_BELT_CHEER_KEY, JSON.stringify(seen));
  } catch {
    // A full device still shows the cheer this once.
  }
  return true;
}

/* -------------------------------- preview -------------------------------- */

/** `?bluebelt=preview` on Student Edition. Sample only: the inbox never writes it. */
export function bluePreviewRequested(search: string): boolean {
  return new URLSearchParams(search).get('bluebelt') === 'preview';
}

/** A fictional green-belt kid turning 16, and the coach's Blue update for them. */
export function blueBeltPreviewSample(today = new Date(), now = Date.now()): { report: StudentProgressReport; packet: CoachRankUpdatePacket } {
  let report = blankStudentReport(now);
  report = { ...report, profile: { ...report.profile, displayName: 'Sample Student', startedOn: '2019-09-01' } };
  report = setBeltMode(report, 'kids', now);
  report = setBirthYear(report, today.getFullYear() - ADULT_BELT_AGE, now);
  report = setKidsBelt(report, 'green', now);
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const built = buildCoachRankUpdate({
    studentId: report.studentId,
    belt: 'Blue',
    stripeCount: 0,
    promotionDate: day,
    note: 'Sample coach note. Nothing here is saved.',
    gym: { name: 'Sample Academy' },
    now,
    updateId: 'rank-blue-belt-preview',
  });
  if (!built.ok) throw new Error(built.error);
  return { report, packet: built.packet };
}
