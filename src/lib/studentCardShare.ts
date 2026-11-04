/**
 * Student → coach "student card share". The second (and last) narrow
 * student-to-coach kind. Sent from Student Edition right after a QR sign-up,
 * only when the gym has Pro, Plus Cloud, or a gym Drive folder.
 *
 * Payload: profile and card fields only (name, belt, stripes, division, gym)
 * and an optional photo. No journal, notes, goals, or tournament data. The
 * photo is always flagged pending: it goes to head-coach photo review and is
 * never put on a card by accepting the share.
 *
 * A minor with the parent toggle on needs the parent PIN before it can send.
 * On the coach side the share waits as pending until an Instructor or Coach
 * seat (or the owner) accepts it as a new card or merges it into an existing
 * card. A merge fills only empty coach fields and never overwrites one.
 */
import { hashGatePin } from './parentGate.ts';
import { photoImageFits } from './rosterPhotoApproval.ts';

export const CARD_SHARE_KIND = 'student-card-share';
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHARE_KEYS = new Set(['kind', 'v', 'shareId', 'studentId', 'card', 'photo', 'parent', 'sentAt']);
const CARD_KEYS = new Set(['name', 'belt', 'stripes', 'division', 'gym']);
export const CARD_SHARE_TEXT_MAX = 80;

export type CardShareFields = { name: string; belt: string; stripes: number; division: string; gym: string };
export type CardSharePhoto = { image: string; status: 'pending-head-coach' };
export type CardShareParent = { required: boolean; approvedAt?: number };

export type StudentCardShare = {
  kind: typeof CARD_SHARE_KIND;
  v: 1;
  shareId: string;
  studentId: string;
  card: CardShareFields;
  photo: CardSharePhoto | null;
  parent: CardShareParent;
  sentAt: number;
};

function text(value: unknown, required = false): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length > CARD_SHARE_TEXT_MAX) return null;
  if (required && !trimmed) return null;
  return trimmed;
}

/** Strict reader for the server and coach. Unknown keys (journal, notes, …) are refused. */
export function readStudentCardShare(value: unknown): StudentCardShare | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !SHARE_KEYS.has(key))) return null;
  if (row.kind !== CARD_SHARE_KIND || row.v !== 1) return null;
  if (typeof row.shareId !== 'string' || !ID_RE.test(row.shareId)) return null;
  if (typeof row.studentId !== 'string' || !ID_RE.test(row.studentId)) return null;
  if (typeof row.sentAt !== 'number' || !Number.isFinite(row.sentAt) || row.sentAt < 0) return null;
  const rawCard = row.card as Record<string, unknown> | null;
  if (!rawCard || typeof rawCard !== 'object' || Array.isArray(rawCard)) return null;
  if (Object.keys(rawCard).some((key) => !CARD_KEYS.has(key))) return null;
  const name = text(rawCard.name, true);
  const belt = text(rawCard.belt);
  const division = text(rawCard.division ?? '');
  const gym = text(rawCard.gym ?? '');
  const stripes = rawCard.stripes ?? 0;
  if (name == null || belt == null || division == null || gym == null) return null;
  if (typeof stripes !== 'number' || !Number.isInteger(stripes) || stripes < 0 || stripes > 4) return null;
  let photo: CardSharePhoto | null = null;
  if (row.photo != null) {
    const rawPhoto = row.photo as Record<string, unknown>;
    if (typeof rawPhoto !== 'object' || Object.keys(rawPhoto).some((key) => key !== 'image' && key !== 'status')) return null;
    if (!photoImageFits(rawPhoto.image) || rawPhoto.status !== 'pending-head-coach') return null;
    photo = { image: rawPhoto.image, status: 'pending-head-coach' };
  }
  const rawParent = row.parent as Record<string, unknown> | null;
  if (!rawParent || typeof rawParent !== 'object' || typeof rawParent.required !== 'boolean') return null;
  const parent: CardShareParent = { required: rawParent.required };
  if (typeof rawParent.approvedAt === 'number' && Number.isFinite(rawParent.approvedAt)) parent.approvedAt = rawParent.approvedAt;
  return { kind: CARD_SHARE_KIND, v: 1, shareId: row.shareId, studentId: row.studentId, card: { name, belt, stripes, division, gym }, photo, parent, sentAt: row.sentAt };
}

/* ------------------------------ student device ----------------------------- */

/** What the gym has, as the QR sign-up saw it. */
export type GymShareCapability = { pro?: boolean; plusCloud?: boolean; gymDrive?: boolean };

/** Only a gym with Pro, Plus Cloud, or a gym Drive folder receives card shares. */
export function cardShareAllowed(gym: GymShareCapability): boolean {
  return gym.pro === true || gym.plusCloud === true || gym.gymDrive === true;
}

export type CardShareDraft =
  | { ok: true; share: StudentCardShare; state: 'awaiting-parent' | 'ready-to-send' }
  | { ok: false; error: 'not-eligible' | 'invalid' };

/**
 * Build the share after a QR sign-up. `parentRequired` is true for a minor
 * whose parent toggle is on; the share then waits for `parentApproveCardShare`.
 */
export function createStudentCardShare(input: {
  studentId: string;
  gym: GymShareCapability;
  card: Partial<CardShareFields> & { name: string };
  photo?: string | null;
  parentRequired: boolean;
  now?: number;
  shareId?: string;
}): CardShareDraft {
  if (!cardShareAllowed(input.gym)) return { ok: false, error: 'not-eligible' };
  const now = input.now ?? Date.now();
  const share = readStudentCardShare({
    kind: CARD_SHARE_KIND,
    v: 1,
    shareId: input.shareId ?? `share-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    studentId: input.studentId,
    card: {
      name: input.card.name,
      belt: input.card.belt ?? '',
      stripes: input.card.stripes ?? 0,
      division: input.card.division ?? '',
      gym: input.card.gym ?? '',
    },
    photo: input.photo ? { image: input.photo, status: 'pending-head-coach' } : null,
    parent: { required: input.parentRequired },
    sentAt: now,
  });
  if (!share) return { ok: false, error: 'invalid' };
  return { ok: true, share, state: input.parentRequired ? 'awaiting-parent' : 'ready-to-send' };
}

export function cardShareReadyToSend(share: StudentCardShare): boolean {
  return !share.parent.required || typeof share.parent.approvedAt === 'number';
}

/** Parent approval with the same parent PIN as Parent approvals. */
export async function parentApproveCardShare(
  share: StudentCardShare,
  pin: string,
  pinHash: string,
  now = Date.now(),
): Promise<{ ok: true; share: StudentCardShare } | { ok: false; error: string }> {
  if (!share.parent.required) return { ok: true, share };
  if (!pin || !pinHash || (await hashGatePin(pin)) !== pinHash) return { ok: false, error: 'Parent PIN did not match.' };
  return { ok: true, share: { ...share, parent: { required: true, approvedAt: now } } };
}

export function studentCardShareFile(share: StudentCardShare): { name: string; json: string } {
  return { name: `advantage-handoff-${CARD_SHARE_KIND}-${share.shareId}.json`, json: JSON.stringify(share) };
}
