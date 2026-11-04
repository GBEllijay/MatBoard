/**
 * Student device: the two narrow student → coach sends.
 *
 * Tournament registration: fires only when a tournament is saved as entered
 * (new, or switched from considering). Considering, edits that stay entered,
 * and coach-imported results never send. Only a gym-account phone (inbox pass
 * or academy link) queues anything. Advantage Cloud when the phone has a pass;
 * otherwise it waits in the outbox for "Save file for my coach".
 *
 * Student card share: built after the academy QR sign-up, only when the gym
 * has Pro, Plus Cloud, or a gym Drive. With the parent gate on (minor), the
 * parent PIN approves it before it can send.
 */
import { loadAcademyLink } from './academyPathway.ts';
import { parentGateOn, readParentGate } from './parentGate.ts';
import type { StudentProgressReport } from './progress/types.ts';
import {
  cardShareReadyToSend,
  createStudentCardShare,
  parentApproveCardShare,
  studentCardShareFile,
  type CardShareDraft,
  type StudentCardShare,
} from './studentCardShare.ts';
import {
  markStudentEventSent,
  newTournamentRegistrations,
  queueStudentEvents,
  readStudentOutbox,
  type TournamentRegistrationEvent,
} from './studentEvents.ts';
import {
  readAcademyLicense,
  readInboxPass,
  studentIdFromInboxPass,
  submitStudentCardShare,
  submitStudentEvent,
} from './studentInboxClient.ts';

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** A phone tied to a gym account: a coach-issued inbox pass, or an academy folder link. */
export function gymAccountPhone(storage: Pick<Store, 'getItem'>): boolean {
  return Boolean(readInboxPass(storage)) || Boolean(loadAcademyLink(storage));
}

function senderId(storage: Pick<Store, 'getItem'>, report: StudentProgressReport): string {
  const pass = readInboxPass(storage);
  return (pass && studentIdFromInboxPass(pass)) || report.studentId;
}

/**
 * Call after the student saves a tournament from their journal or calendar.
 * Returns the registrations that were queued (empty for anything not newly entered).
 */
export async function recordTournamentSave(
  storage: Store,
  before: StudentProgressReport,
  after: StudentProgressReport,
  options: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<TournamentRegistrationEvent[]> {
  if (!gymAccountPhone(storage)) return [];
  const id = senderId(storage, after);
  const events = newTournamentRegistrations(before, { ...after, studentId: id }, options.now);
  if (!events.length) return [];
  queueStudentEvents(storage, events);
  await sendStudentOutbox(storage, options.fetchImpl);
  return events;
}

/** Try Advantage Cloud for anything unsent. Without a pass, items stay for the file fallback. */
export async function sendStudentOutbox(storage: Store, fetchImpl: typeof fetch = fetch): Promise<number> {
  const pass = readInboxPass(storage);
  if (!pass) return 0;
  let sent = 0;
  for (const item of readStudentOutbox(storage)) {
    if (item.sent) continue;
    const result = await submitStudentEvent(pass, item.event, fetchImpl);
    if (result.ok) {
      markStudentEventSent(storage, item.event.eventId);
      sent += 1;
    }
  }
  return sent;
}

/* ------------------------------- card share ------------------------------- */

export function studentCardShareDraft(
  storage: Pick<Store, 'getItem'>,
  report: StudentProgressReport,
  input: { photo?: string | null; division?: string; now?: number } = {},
): CardShareDraft {
  const link = loadAcademyLink(storage);
  const license = readAcademyLicense(storage);
  return createStudentCardShare({
    studentId: senderId(storage, report),
    gym: { gymDrive: Boolean(link), plusCloud: Boolean(license) },
    card: {
      name: report.profile.displayName,
      belt: report.profile.belt,
      stripes: report.rank?.tapeCount ?? 0,
      division: input.division ?? '',
      gym: link?.gymName || report.profile.gymName,
    },
    photo: input.photo ?? null,
    parentRequired: parentGateOn(storage),
    now: input.now,
  });
}

export async function parentApproveStudentCardShare(storage: Pick<Store, 'getItem'>, share: StudentCardShare, pin: string) {
  return parentApproveCardShare(share, pin, readParentGate(storage).pinHash ?? '');
}

export type CardShareSend =
  | { ok: true; via: 'cloud' }
  | { ok: true; via: 'file'; file: { name: string; json: string } }
  | { ok: false; reason: 'awaiting-parent' | 'refused' };

/** Advantage Cloud when the QR carried a Plus Cloud license; otherwise a file for the gym folder. */
export async function sendStudentCardShare(
  storage: Pick<Store, 'getItem'>,
  share: StudentCardShare,
  fetchImpl: typeof fetch = fetch,
): Promise<CardShareSend> {
  if (!cardShareReadyToSend(share)) return { ok: false, reason: 'awaiting-parent' };
  const license = readAcademyLicense(storage);
  if (license) {
    const result = await submitStudentCardShare(license, share, fetchImpl);
    if (result.ok) return { ok: true, via: 'cloud' };
    if (result.reason === 'refused') return { ok: false, reason: 'refused' };
  }
  return { ok: true, via: 'file', file: studentCardShareFile(share) };
}
