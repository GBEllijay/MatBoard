import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCoachRankUpdate, type CoachInboxPacket } from './coachRankUpdate.ts';
import { buildCoachBeltProgressUpdate } from './coachSync.ts';
import {
  ALERTS_SEEN_KEY,
  alertIds,
  arrivalToast,
  cardChangeLines,
  coachUpdateHeading,
  createInboxPoller,
  dismissPhotoNotices,
  markAlertsSeen,
  packetHasNote,
  PHOTO_NOTICE_DISMISSED_KEY,
  PHOTO_NOTICE_RECENT_MS,
  photoNoticeToShow,
  pollDelay,
  readIdSet,
  takeFreshArrivals,
  unreadCount,
  type PullOutcome,
} from './studentAlerts.ts';
import { readPhotoDecisions } from './studentInboxClient.ts';

function memory(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function rank(note = '', updateId = 'rank-1'): CoachInboxPacket {
  const built = buildCoachRankUpdate({ studentId: 'stu-a', belt: 'Blue', stripeCount: 2, promotionDate: '2026-11-12', note, now: 5, updateId });
  if (!built.ok) throw new Error(built.error);
  return built.packet;
}

test('unread count: every waiting item counts once until seen, per profile store', () => {
  const kidA = memory();
  const kidB = memory();
  const ids = alertIds({
    packets: [{ updateId: 'rank-1' }, { updateId: 'note-2' }],
    photoNotices: [{ photoId: 'p1' }],
    files: [{ path: 'students/stu-a/from-instructor/2026-11-12/plan.pdf' }],
  });
  assert.deepEqual(ids, ['rank-1', 'note-2', 'photo:p1', 'file:students/stu-a/from-instructor/2026-11-12/plan.pdf']);
  assert.equal(unreadCount(ids, readIdSet(kidA, ALERTS_SEEN_KEY)), 4);
  markAlertsSeen(kidA, ['rank-1', 'photo:p1']);
  assert.equal(unreadCount(ids, readIdSet(kidA, ALERTS_SEEN_KEY)), 2);
  // Another kid profile on the same phone keeps its own count.
  assert.equal(unreadCount(ids, readIdSet(kidB, ALERTS_SEEN_KEY)), 4);
  assert.equal(unreadCount([...ids, 'rank-1'], readIdSet(kidB, ALERTS_SEEN_KEY)), 4);
});

test('arrival toast fires once per new item and never for seen items', () => {
  const store = memory();
  assert.deepEqual(takeFreshArrivals(store, ['a', 'b']), ['a', 'b']);
  assert.deepEqual(takeFreshArrivals(store, ['a', 'b']), []);
  markAlertsSeen(store, ['c']);
  assert.deepEqual(takeFreshArrivals(store, ['a', 'b', 'c', 'd']), ['d']);
  assert.equal(arrivalToast(1), 'New from your coach');
  assert.equal(arrivalToast(3), '3 new from your coach');
});

test('no-note card update still surfaces as "Your coach updated your card" with what changed', () => {
  const plain = rank('');
  assert.equal(packetHasNote(plain), false);
  assert.equal(coachUpdateHeading(plain), 'Your coach updated your card');
  assert.deepEqual(cardChangeLines(plain), ['Rank: Blue belt, 2 stripes', 'Date: Nov 12']);
  const noted = rank('Great week');
  assert.equal(packetHasNote(noted), true);
  assert.equal(coachUpdateHeading(noted), 'From your coach');

  const belt = buildCoachBeltProgressUpdate({
    studentId: 'stu-a',
    belt: 'Blue',
    issuedOn: '2026-11-12',
    benchmarks: [
      { targetId: 't1', name: 'Guard pass', coachStatus: 'ready' },
      { targetId: 't2', name: 'Sweep', coachStatus: 'working' },
      { targetId: 't3', name: 'Escape', coachStatus: 'not-yet' },
    ],
    now: 9,
    updateId: 'belt-1',
  });
  if (!belt.ok) throw new Error(belt.error);
  assert.equal(coachUpdateHeading(belt.packet), 'Your coach updated your card');
  assert.deepEqual(cardChangeLines(belt.packet), ['Belt progress: 1 of 3 ready', 'Working on: 1']);

  const assessment = {
    ...plain,
    kind: 'coach-assessment-update',
    assessment: { date: '2026-11-10', note: '', scores: { guard: 3, passing: 4 }, strengths: '', weaknesses: '' },
  } as unknown as CoachInboxPacket;
  assert.equal(coachUpdateHeading(assessment), 'Your coach updated your card');
  assert.deepEqual(cardChangeLines(assessment), ['Assessment: Nov 10', '2 areas scored']);
});

test('photo decision: newest open decision shows once, then Got it hides it and older ones', () => {
  const store = memory();
  const now = Date.UTC(2026, 10, 12);
  const decisions = readPhotoDecisions([
    { photoId: 'p-old', decision: 'decline', decidedAt: now - 1000 },
    { photoId: 'p-new', decision: 'approve', decidedAt: now - 10 },
    { photoId: '../bad', decision: 'approve', decidedAt: now },
    { photoId: 'p-x', decision: 'maybe', decidedAt: now },
  ]);
  assert.equal(decisions.length, 2);
  const shown = photoNoticeToShow(decisions, { sent: new Set(), dismissed: readIdSet(store, PHOTO_NOTICE_DISMISSED_KEY), now });
  assert.equal(shown?.photoId, 'p-new');
  assert.equal(shown?.title, 'Photo approved');
  assert.ok(shown);
  dismissPhotoNotices(store, decisions, shown);
  assert.equal(photoNoticeToShow(decisions, { sent: new Set(), dismissed: readIdSet(store, PHOTO_NOTICE_DISMISSED_KEY), now }), null);

  // An old decision shows only when this profile sent that photo.
  const stale = [{ photoId: 'p-sent', decision: 'decline' as const, decidedAt: now - PHOTO_NOTICE_RECENT_MS - 1 }];
  assert.equal(photoNoticeToShow(stale, { sent: new Set(), dismissed: new Set(), now }), null);
  assert.equal(photoNoticeToShow(stale, { sent: new Set(['p-sent']), dismissed: new Set(), now })?.title, 'Photo not used');
});

function fakeClock() {
  let at = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let next = 1;
  return {
    now: () => at,
    setTimer: (fn: () => void, ms: number) => {
      const id = next++;
      timers.push({ at: at + ms, fn, id });
      return id;
    },
    clearTimer: (id: unknown) => {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    pending: () => timers.map((timer) => timer.at - at),
    async advance(ms: number) {
      at += ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const due = timers[0];
        if (!due || due.at > at) break;
        timers.shift();
        due.fn();
        await Promise.resolve();
        await Promise.resolve();
      }
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

test('poller: pulls on start, every interval while visible, never while hidden, focus pulls if not too soon', async () => {
  const clock = fakeClock();
  let visible = true;
  let calls = 0;
  const poller = createInboxPoller({
    pull: async () => {
      calls += 1;
      return 'ok';
    },
    isVisible: () => visible,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    intervalMs: 180_000,
    minGapMs: 30_000,
  });
  poller.start();
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(clock.pending(), [180_000]);
  // Focus right away does not hammer.
  poller.nudge();
  await flush();
  assert.equal(calls, 1);
  await clock.advance(180_000);
  await flush();
  assert.equal(calls, 2);
  // Hidden: the timer fires but no request goes out, and nothing new is scheduled.
  visible = false;
  await clock.advance(180_000);
  await flush();
  assert.equal(calls, 2);
  assert.deepEqual(clock.pending(), []);
  // Back to the front: pulls once right away.
  visible = true;
  poller.nudge();
  await flush();
  assert.equal(calls, 3);
  poller.stop();
  assert.deepEqual(clock.pending(), []);
});

test('poller: errors back off (doubling, capped) and focus respects the backoff; stop ends polling', async () => {
  assert.equal(pollDelay(0, 1000, 8000), 1000);
  assert.equal(pollDelay(1, 1000, 8000), 2000);
  assert.equal(pollDelay(3, 1000, 8000), 8000);
  assert.equal(pollDelay(9, 1000, 8000), 8000);

  const clock = fakeClock();
  let outcome: PullOutcome = 'error';
  let calls = 0;
  const poller = createInboxPoller({
    pull: async () => {
      calls += 1;
      return outcome;
    },
    isVisible: () => true,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    intervalMs: 1000,
    maxDelayMs: 8000,
    minGapMs: 100,
  });
  poller.start();
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(clock.pending(), [2000]);
  // Focus during backoff does not pull.
  await clock.advance(500);
  poller.nudge();
  await flush();
  assert.equal(calls, 1);
  await clock.advance(1500);
  await flush();
  assert.equal(calls, 2);
  assert.deepEqual(clock.pending(), [4000]);
  await clock.advance(4000);
  await flush();
  assert.deepEqual(clock.pending(), [8000]);
  await clock.advance(8000);
  await flush();
  assert.deepEqual(clock.pending(), [8000]);
  outcome = 'ok';
  await clock.advance(8000);
  await flush();
  assert.deepEqual(clock.pending(), [1000]);
  assert.equal(poller.state().failures, 0);
  outcome = 'stop';
  await clock.advance(1000);
  await flush();
  assert.equal(poller.state().running, false);
  assert.deepEqual(clock.pending(), []);
  const before = calls;
  poller.nudge();
  await flush();
  assert.equal(calls, before);
});
