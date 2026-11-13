/**
 * Student Edition alerts: what is new from the coach, in-app only.
 *
 * - Unread count for the badge (coach updates, card updates, photo decisions,
 *   instructor files). "Seen" is stored per profile, because Student Edition
 *   scopes localStorage to the open profile, so each kid profile on one phone
 *   keeps its own count.
 * - A short toast when something new arrives or a coach update is saved.
 * - The photo decision notice (approved or not used), shown once, dismissible.
 * - "Your coach updated your card" lines for updates that carry no message.
 * - A gentle inbox poller: on focus/visible, and every few minutes while the
 *   page is visible, with backoff after errors. Never while hidden.
 *
 * No web push, no new service. Nothing here touches Stripe, entitlements, or gates.
 */

import { rankBeltLabel } from './studentRank.ts';
import { shortPromotionDate, type CoachInboxPacket } from './coachRankUpdate.ts';
import type { PhotoDecision } from './studentInboxClient.ts';

export const ALERTS_SEEN_KEY = 'matboard.studentEdition.alertsSeen.v1';
export const ALERTS_ANNOUNCED_KEY = 'matboard.studentEdition.alertsAnnounced.v1';
export const PHOTO_SENT_KEY = 'matboard.studentEdition.photoSent.v1';
export const PHOTO_NOTICE_DISMISSED_KEY = 'matboard.studentEdition.photoNoticeDismissed.v1';
export const STUDENT_TOAST_EVENT = 'matboard-student-toast';

const ID_SET_MAX = 300;
/** A decision on a photo this phone did not record sending still shows if it is this recent. */
export const PHOTO_NOTICE_RECENT_MS = 14 * 24 * 60 * 60 * 1000;

type Store = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

export function readIdSet(storage: Pick<Store, 'getItem'>, key: string): Set<string> {
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeIdSet(storage: Store, key: string, ids: Set<string>): void {
  const list = [...ids];
  try {
    storage.setItem(key, JSON.stringify(list.slice(Math.max(0, list.length - ID_SET_MAX))));
  } catch {
    /* storage full or blocked: alerts still work for this session */
  }
}

function addIds(storage: Store, key: string, ids: readonly string[]): void {
  if (!ids.length) return;
  const set = readIdSet(storage, key);
  let changed = false;
  for (const id of ids) {
    if (set.has(id)) continue;
    set.add(id);
    changed = true;
  }
  if (changed) writeIdSet(storage, key, set);
}

/* --------------------------------- unread --------------------------------- */

export type AlertSources = {
  packets: readonly { updateId: string }[];
  photoNotices: readonly { photoId: string }[];
  files: readonly { path: string }[];
};

/** One id per thing waiting for the student. */
export function alertIds(sources: AlertSources): string[] {
  return [
    ...sources.packets.map((packet) => packet.updateId),
    ...sources.photoNotices.map((notice) => `photo:${notice.photoId}`),
    ...sources.files.map((file) => `file:${file.path}`),
  ];
}

export function unreadCount(ids: readonly string[], seen: ReadonlySet<string>): number {
  return new Set(ids.filter((id) => !seen.has(id))).size;
}

export function markAlertsSeen(storage: Store, ids: readonly string[]): void {
  addIds(storage, ALERTS_SEEN_KEY, ids);
}

/** Ids not toasted before on this profile. Records them so each arrival toasts once. */
export function takeFreshArrivals(storage: Store, ids: readonly string[]): string[] {
  const announced = readIdSet(storage, ALERTS_ANNOUNCED_KEY);
  const seen = readIdSet(storage, ALERTS_SEEN_KEY);
  const fresh = [...new Set(ids)].filter((id) => !announced.has(id) && !seen.has(id));
  addIds(storage, ALERTS_ANNOUNCED_KEY, fresh);
  return fresh;
}

export function badgeLabel(count: number): string {
  return count === 1 ? '1 new' : `${count} new`;
}

export function arrivalToast(count: number): string {
  return count === 1 ? 'New from your coach' : `${count} new from your coach`;
}

/* ---------------------------------- toast --------------------------------- */

let lastToast: { text: string; at: number } | null = null;

/** Ask the Student Edition toast to show a short line. */
export function showStudentToast(text: string): void {
  lastToast = { text, at: Date.now() };
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(STUDENT_TOAST_EVENT, { detail: { text } }));
}

/**
 * A toast raised in the same render pass, before the toast listener mounted
 * (first open of the app). Returned once, only if it is very recent.
 */
export function takeRecentToast(now = Date.now(), withinMs = 1500): string | null {
  const recent = lastToast && now - lastToast.at <= withinMs ? lastToast.text : null;
  lastToast = null;
  return recent;
}

/* ------------------------------ photo decision ----------------------------- */

export function recordPhotoSent(storage: Store, photoId: string): void {
  addIds(storage, PHOTO_SENT_KEY, [photoId]);
}

export type PhotoNotice = PhotoDecision & { title: string; body: string };

export function photoNoticeCopy(decision: PhotoDecision['decision']): { title: string; body: string } {
  return decision === 'approve'
    ? { title: 'Photo approved', body: 'Your coach approved your profile photo.' }
    : { title: 'Photo not used', body: 'Your coach didn’t use this photo. You can send a different one.' };
}

/**
 * The one photo decision to show: newest, not dismissed, and either a photo
 * this profile sent or decided recently. The server only returns this
 * student's own decisions (student pass), so nothing here sees another student.
 */
export function photoNoticeToShow(
  decisions: readonly PhotoDecision[],
  input: { sent: ReadonlySet<string>; dismissed: ReadonlySet<string>; now: number },
): PhotoNotice | null {
  const open = decisions
    .filter((row) => !input.dismissed.has(row.photoId))
    .filter((row) => input.sent.has(row.photoId) || input.now - row.decidedAt <= PHOTO_NOTICE_RECENT_MS)
    .sort((a, b) => b.decidedAt - a.decidedAt);
  const top = open[0];
  return top ? { ...top, ...photoNoticeCopy(top.decision) } : null;
}

/** Dismiss this notice and every older decision with it, so it shows once. */
export function dismissPhotoNotices(storage: Store, decisions: readonly PhotoDecision[], notice: PhotoDecision): void {
  addIds(
    storage,
    PHOTO_NOTICE_DISMISSED_KEY,
    decisions.filter((row) => row.decidedAt <= notice.decidedAt).map((row) => row.photoId).concat(notice.photoId),
  );
}

/* ------------------------------ card updates ------------------------------ */

/** True when the coach wrote words to the student on this update. */
export function packetHasNote(packet: CoachInboxPacket): boolean {
  switch (packet.kind) {
    case 'coach-rank-update':
      return packet.rankUpdate.note.trim().length > 0;
    case 'coach-assessment-update':
      return packet.assessment.note.trim().length > 0;
    case 'coach-belt-progress-update':
      return (
        packet.beltProgress.note.trim().length > 0 || packet.beltProgress.benchmarks.some((mark) => mark.note.trim().length > 0)
      );
    case 'coach-competition-update':
      return packet.competitionUpdate.matches.some((match) => match.note.trim().length > 0);
    case 'coach-note-update':
      return true;
  }
}

/** Heading for the update card. No message means it reads as a card change. */
export function coachUpdateHeading(packet: CoachInboxPacket): string {
  return packetHasNote(packet) ? 'From your coach' : 'Your coach updated your card';
}

/** Short "what changed" lines, one per field. */
export function cardChangeLines(packet: CoachInboxPacket): string[] {
  switch (packet.kind) {
    case 'coach-rank-update': {
      const { belt, stripeCount, promotionDate } = packet.rankUpdate;
      const mark = belt === 'black' ? 'degree' : 'stripe';
      const marks = stripeCount > 0 ? `, ${stripeCount} ${mark}${stripeCount === 1 ? '' : 's'}` : '';
      return [`Rank: ${rankBeltLabel(belt)} belt${marks}`, `Date: ${shortPromotionDate(promotionDate)}`];
    }
    case 'coach-belt-progress-update': {
      const marks = packet.beltProgress.benchmarks;
      const ready = marks.filter((mark) => mark.coachStatus === 'ready').length;
      const working = marks.filter((mark) => mark.coachStatus === 'working').length;
      return [
        `Belt progress: ${ready} of ${marks.length} ready`,
        ...(working ? [`Working on: ${working}`] : []),
      ];
    }
    case 'coach-assessment-update': {
      const scored = Object.keys(packet.assessment.scores).length;
      return [
        `Assessment: ${shortPromotionDate(packet.assessment.date)}`,
        ...(scored ? [`${scored} area${scored === 1 ? '' : 's'} scored`] : []),
      ];
    }
    case 'coach-competition-update': {
      const count = packet.competitionUpdate.matches.length;
      const name = packet.competitionUpdate.tournamentName.trim() || 'Tournament';
      return [`Results: ${name}`, `${count} match${count === 1 ? '' : 'es'}`];
    }
    case 'coach-note-update':
      return [`Coach note for ${shortPromotionDate(packet.coachNote.journalDate || packet.coachNote.issuedOn)}`];
  }
}

/* --------------------------------- poller --------------------------------- */

export type PullOutcome = 'ok' | 'error' | 'stop';

export type PollerDeps = {
  pull: () => Promise<PullOutcome>;
  isVisible: () => boolean;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Steady interval while visible. Default 3 minutes. */
  intervalMs?: number;
  /** Longest wait after repeated errors. Default 30 minutes. */
  maxDelayMs?: number;
  /** Focus/visible never pulls more often than this. Default 30 seconds. */
  minGapMs?: number;
};

export const POLL_INTERVAL_MS = 3 * 60 * 1000;
export const POLL_MAX_DELAY_MS = 30 * 60 * 1000;
export const POLL_MIN_GAP_MS = 30 * 1000;

export function pollDelay(failures: number, intervalMs = POLL_INTERVAL_MS, maxDelayMs = POLL_MAX_DELAY_MS): number {
  return Math.min(maxDelayMs, intervalMs * 2 ** Math.max(0, Math.min(failures, 10)));
}

/**
 * Pulls once on start, then on a timer while visible, and when the app comes
 * back to the front. Errors double the wait (capped). A hidden page never pulls;
 * coming back visible pulls if the last pull is old enough and backoff allows.
 * 'stop' (pass refused) ends polling until the next start.
 */
export function createInboxPoller(deps: PollerDeps) {
  const intervalMs = deps.intervalMs ?? POLL_INTERVAL_MS;
  const maxDelayMs = deps.maxDelayMs ?? POLL_MAX_DELAY_MS;
  const minGapMs = deps.minGapMs ?? POLL_MIN_GAP_MS;
  let timer: unknown = null;
  let running = false;
  let inFlight = false;
  let failures = 0;
  let lastPullAt = -Infinity;
  let nextAllowedAt = -Infinity;
  let pulls = 0;

  const clear = () => {
    if (timer != null) deps.clearTimer(timer);
    timer = null;
  };
  const schedule = () => {
    clear();
    if (!running) return;
    const wait = pollDelay(failures, intervalMs, maxDelayMs);
    nextAllowedAt = lastPullAt + (failures ? wait : minGapMs);
    timer = deps.setTimer(() => {
      timer = null;
      void tick();
    }, wait);
  };
  const tick = async () => {
    if (!running || inFlight) return;
    if (!deps.isVisible()) return; // Wait for the next visible nudge.
    inFlight = true;
    lastPullAt = deps.now();
    pulls += 1;
    let outcome: PullOutcome = 'error';
    try {
      outcome = await deps.pull();
    } catch {
      outcome = 'error';
    }
    inFlight = false;
    if (!running) return;
    if (outcome === 'stop') {
      running = false;
      clear();
      return;
    }
    failures = outcome === 'ok' ? 0 : failures + 1;
    schedule();
  };

  return {
    start() {
      if (running) return;
      running = true;
      void tick();
    },
    stop() {
      running = false;
      clear();
    },
    /** Focus or visibility came back. */
    nudge() {
      if (!running || inFlight || !deps.isVisible()) return;
      const at = deps.now();
      if (at < nextAllowedAt || at - lastPullAt < minGapMs) {
        if (timer == null) schedule();
        return;
      }
      void tick();
    },
    /** For tests and debugging. */
    state() {
      return { running, failures, pulls, inFlight, scheduled: timer != null, nextDelayMs: pollDelay(failures, intervalMs, maxDelayMs) };
    },
  };
}
