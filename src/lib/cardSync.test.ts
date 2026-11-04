import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CARD_SYNC_FIELDS,
  getCardSyncState,
  RANK_FIELD_DASH,
  rankCardFields,
  rankCardFieldsFromRank,
  readCardSyncSent,
  sendCardSync,
  setCardComms,
} from './cardSync.ts';
import { buildCoachRankUpdate } from './coachRankUpdate.ts';
import { addStudent, getRoster, linkRosterCard, type Student } from './rosterStore.ts';
import type { InboxDelivery } from './studentInboxClient.ts';
import { everyTestPacket, testMemory } from './testPackets.ts';

function card(partial: Partial<Student> & { id: string }): Student {
  return {
    name: 'Alex', belt: 'Blue', division: '', gym: '', photo: '', lastPromotion: '', lastPromotionDetail: '',
    note: '', checkedIn: false, rosterList: 'student', ...partial,
  } as Student;
}

const linked = card({ id: 'card-1', linkedStudentId: 'stu-alex', stripes: 2, lastPromotion: '2026-10-01' });
const guest = card({ id: 'card-g', guestId: 'guest-1', rosterList: undefined });
const unlinked = card({ id: 'card-u' });

test('rank fields: belt achieved is the current belt’s first promotion; last stripe is the newest stripe', () => {
  const fields = rankCardFields('Blue', [
    { belt: 'White', stripe: 4, awardedOn: '2025-01-01' },
    { belt: 'Blue', stripe: 0, awardedOn: '2025-06-01' },
    { belt: 'Blue', stripe: 1, awardedOn: '2025-12-01' },
    { belt: 'blue', stripe: 2, awardedOn: '2026-05-01' },
  ]);
  assert.deepEqual(fields, { beltAchieved: '2025-06-01', lastStripeAwarded: '2026-05-01' });
  assert.deepEqual(rankCardFields('Blue', [{ belt: 'Blue', stripe: 0, awardedOn: '2025-06-01' }]), {
    beltAchieved: '2025-06-01',
    lastStripeAwarded: RANK_FIELD_DASH,
  });
  // A stripe from an earlier belt never shows on the new belt.
  assert.equal(rankCardFields('Purple', [{ belt: 'Blue', stripe: 4, awardedOn: '2026-01-01' }]).lastStripeAwarded, RANK_FIELD_DASH);
  assert.deepEqual(rankCardFields('Blue', []), { beltAchieved: RANK_FIELD_DASH, lastStripeAwarded: RANK_FIELD_DASH });
});

test('rank fields from a student report rank: awardedOn and the newest tape date', () => {
  const fields = rankCardFieldsFromRank('blue', {
    awardedOn: '2025-06-01',
    tapeDates: ['2025-09-01', '2026-02-01', '', ''],
  });
  assert.deepEqual(fields, { beltAchieved: '2025-06-01', lastStripeAwarded: '2026-02-01' });
  assert.deepEqual(rankCardFieldsFromRank('blue', { awardedOn: '', tapeDates: ['', '', '', ''] }), {
    beltAchieved: RANK_FIELD_DASH,
    lastStripeAwarded: RANK_FIELD_DASH,
  });
});

test('getCardSyncState: eligibility, comms, gate and lookup by either id', () => {
  const roster = [linked, guest, unlinked];
  const storage = testMemory();
  const state = getCardSyncState('card-1', { roster, actor: 'owner', storage });
  assert.ok(state);
  assert.equal(state.eligible, true);
  assert.equal(state.comms, 'on');
  assert.equal(state.gate, 'send');
  assert.equal(state.gateText, null);
  assert.deepEqual(state.fields, CARD_SYNC_FIELDS);
  assert.deepEqual(state.rank, { belt: 'Blue', stripes: 2, beltAchieved: RANK_FIELD_DASH, lastStripeAwarded: '2026-10-01' });
  assert.equal(getCardSyncState('stu-alex', { roster, actor: 'owner', storage })?.cardId, 'card-1');
  assert.equal(getCardSyncState('nope', { roster, actor: 'owner', storage }), null);
  const guestState = getCardSyncState('card-g', { roster, actor: 'owner', storage });
  assert.equal(guestState?.eligible, false);
  assert.equal(guestState?.gate, 'guest');
  assert.equal(getCardSyncState('card-u', { roster, actor: 'owner', storage })?.gate, 'unlinked');
  assert.equal(getCardSyncState('card-1', { roster, actor: 'assistant', storage })?.gate, 'assistant');
  // Off on the student's other card turns comms off here too.
  const both = [linked, card({ id: 'card-2', linkedStudentId: 'stu-alex', coachSync: 'off', rosterList: undefined })];
  const off = getCardSyncState('card-1', { roster: both, actor: 'owner', storage });
  assert.equal(off?.comms, 'off');
  assert.equal(off?.gate, 'sync-off');
});

test('sendCardSync: comms off, guest, assistant and wrong student send nothing and log nothing', async () => {
  const log = testMemory();
  let calls = 0;
  const deliver = async (): Promise<InboxDelivery> => {
    calls += 1;
    return { mode: 'cloud', studentPass: 'p' };
  };
  const [rank] = everyTestPacket('stu-alex');
  const offCard = { ...linked, coachSync: 'off' as const };
  assert.equal((await sendCardSync('card-1', rank, { roster: [offCard], actor: 'owner', deliver, log })).mode, 'blocked');
  assert.equal((await sendCardSync('card-1', rank, { roster: [linked], actor: 'assistant', deliver, log })).mode, 'blocked');
  assert.equal((await sendCardSync('card-g', rank, { roster: [guest], actor: 'owner', deliver, log })).mode, 'blocked');
  const [otherRank] = everyTestPacket('stu-other');
  assert.equal((await sendCardSync('card-1', otherRank, { roster: [linked], actor: 'owner', deliver, log })).mode, 'blocked');
  assert.equal((await sendCardSync('missing', rank, { roster: [linked], actor: 'owner', deliver, log })).mode, 'blocked');
  assert.equal(calls, 0);
  assert.equal(readCardSyncSent(log).length, 0);
});

test('sendCardSync logs sends; the card shows last sent per field and the sent rank dates', async () => {
  const log = testMemory();
  const roster = [linked];
  const cloud = async (): Promise<InboxDelivery> => ({ mode: 'cloud', studentPass: 'p' });
  const file = async (packet: { updateId: string }): Promise<InboxDelivery> => ({
    mode: 'file', name: `${packet.updateId}.json`, json: '{}', reason: 'offline',
  });
  const beltDay = buildCoachRankUpdate({
    studentId: 'stu-alex', belt: 'Blue', stripeCount: 0, promotionDate: '2025-06-01', note: '', now: 1, updateId: 'rank-belt',
  });
  if (!beltDay.ok) throw new Error(beltDay.error);
  assert.equal((await sendCardSync('card-1', beltDay.packet, { roster, actor: 'owner', deliver: cloud, log, now: 10 })).mode, 'cloud');
  const packets = everyTestPacket('stu-alex');
  const belt = packets.find((packet) => packet.kind === 'coach-belt-progress-update')!;
  assert.equal((await sendCardSync('card-1', belt, { roster, actor: 'head', deliver: file, log, now: 20 })).mode, 'file');
  const state = getCardSyncState('card-1', { roster, actor: 'owner', storage: log });
  assert.equal(state?.lastSent.rank?.updateId, 'rank-belt');
  assert.equal(state?.lastSent.rank?.mode, 'cloud');
  assert.equal(state?.lastSent['belt-progress']?.mode, 'file');
  assert.equal(state?.lastSent.assessment, undefined);
  assert.deepEqual(
    { a: state?.rank.beltAchieved, s: state?.rank.lastStripeAwarded },
    { a: '2025-06-01', s: '2026-10-01' },
  );
});

test('setCardComms turns every card of the student off and back on', () => {
  const a = addStudent({ name: 'Comms One', belt: 'Blue', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' } as never, { rosterList: 'student' });
  const b = addStudent({ name: 'Comms One', belt: 'Blue', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' } as never);
  assert.ok(a && b);
  linkRosterCard(a.id, 'stu-comms');
  linkRosterCard(b.id, 'stu-comms');
  assert.equal(setCardComms(a.id, false), true);
  const cards = () => getRoster().students.filter((row) => row.linkedStudentId === 'stu-comms');
  assert.equal(cards().length, 2);
  assert.ok(cards().every((row) => row.coachSync === 'off'));
  assert.equal(getCardSyncState(b.id, { actor: 'owner', storage: null })?.gate, 'sync-off');
  setCardComms('stu-comms', true);
  assert.ok(cards().every((row) => row.coachSync === undefined));
  assert.equal(setCardComms('missing', false), false);
});
