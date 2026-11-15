/**
 * Kids-to-Blue promotions are no longer sent from the coach to the student
 * (rankSendOffer is always noop). If an older packet is still in the queue,
 * confirm consumes it without changing My rank. A typed birth year may still
 * be saved. No cheer fires from a coach packet, because the promotion is not
 * applied. The cheer and confetti fire when the student updates their own belt
 * from a kids belt to adult Blue on My rank.
 */

import { acceptCoachRankUpdate, buildCoachRankUpdate, type UpdateLedger } from './coachRankUpdate.ts';
import { blankStudentReport } from './studentEdition.ts';
import { beltModeOf, currentKidsBelt, ibjjfAge, setBeltMode, setBirthYear, setKidsBelt } from './studentRank.ts';
import { canonicalBelt, KIDS_BELTS } from './rosterStore.ts';
import { IBJJF_KIDS_TEMPLATE } from './beltTemplates.ts';
import type { CoachRankUpdatePacket, ProgressBelt, StudentProgressReport } from './progress/types.ts';

export const BLUE_BELT_CHEER_KEY = 'matboard.studentEdition.blueBeltCheer.v1';
export const BLUE_BELT_CHEER_LINES = ['Parabéns, Coach!', 'Good job. The blue belt is yours.'] as const;
export const STUDENT_BLUE_CHEER_LINES = ['Congratulations, Coach!', 'The blue belt is yours.'] as const;
export const STUDENT_BLUE_CHEER_ID = 'self-kids-to-blue';
export const ADULT_BELT_AGE = 16;

const KIDS_PROGRESS_BELTS: readonly ProgressBelt[] = ['grey', 'yellow', 'orange', 'green'];
const KIDS_SELF_BELT_IDS = new Set(IBJJF_KIDS_TEMPLATE.belts.map((belt) => belt.id));
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

/** IBJJF kids belts on My rank: white, grey/yellow/orange/green, and their white/black variants. */
export function isKidsSelfBeltId(beltId: string | null | undefined): boolean {
  return Boolean(beltId && KIDS_SELF_BELT_IDS.has(beltId));
}

/**
 * True when the file is still on a kids belt the student wears, or just switched
 * to the adult ladder without already being Blue. An unused default kids-white
 * slot on an adult file does not count, so adult White to Blue does not cheer.
 */
export function studentWearingKidsBelt(report: StudentProgressReport): boolean {
  if (beltModeOf(report) === 'kids') return isKidsSelfBeltId(currentKidsBelt(report).beltId);
  if (report.profile.belt === 'blue') return false;
  const kids = report.beltBook?.kids;
  if (!kids || !isKidsSelfBeltId(kids.beltId)) return false;
  if (kids.beltId !== 'white') return true;
  return Boolean((kids.history?.length ?? 0) > 0 || (kids.classCount ?? 0) > 0 || (kids.tapeCount ?? 0) > 0 || kids.awardedOn);
}

/** The student just moved their own file from a kids belt onto adult Blue. */
export function studentKidsToBlue(before: StudentProgressReport, after: StudentProgressReport): boolean {
  if (after.profile.belt !== 'blue') return false;
  if (beltModeOf(before) === 'kids') return isKidsSelfBeltId(currentKidsBelt(before).beltId);
  if (before.profile.belt === 'blue') return false;
  return studentWearingKidsBelt(before);
}

/** True the first time this profile moves from a kids belt to Blue. A reload or Blue re-save does not replay. */
export function claimStudentKidsToBlueCheer(
  storage: MemoryStore,
  before: StudentProgressReport,
  after: StudentProgressReport,
): boolean {
  if (!studentKidsToBlue(before, after)) return false;
  return claimBlueCheer(storage, after.studentId, STUDENT_BLUE_CHEER_ID);
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
 * A leftover kids-to-Blue packet is consumed without changing My rank. Birth year
 * may still be saved if the student typed one. No cheer, because the promotion
 * is not applied. Any other update is the plain accept.
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
  const result = acceptCoachRankUpdate(next, packet, ledger, now);
  return { ...result, cheer: false };
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
