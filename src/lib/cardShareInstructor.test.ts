/**
 * Accepting a card share puts the student on the instructor whose code they scanned
 * (fill blank only), keeps one linkedStudentId so attendance has one person key,
 * and hands the card to the academy master roster.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptCardShare } from './cardSync.ts';
import { receiveCardShare } from './coachStudentInbox.ts';
import { addStudent, getRoster, setAssignedInstructor, type Student } from './rosterStore.ts';
import { testMemory } from './testPackets.ts';

function share(shareId: string, studentId: string, viaInstructorId?: string) {
  return {
    kind: 'student-card-share', v: 1, shareId, studentId,
    card: { name: `Student ${shareId}`, belt: 'Blue', stripes: 0, division: '', gym: '' },
    photo: null, parent: { required: false }, sentAt: 1,
    ...(viaInstructorId ? { viaInstructorId } : {}),
  };
}

test('accept as new: assigned to the instructor who showed the code, same linked id, pushed to the master roster', async () => {
  const storage = testMemory();
  receiveCardShare(storage, share('share-1', 'stu-paige', 'seat-paige'));
  const pushed: Student[] = [];
  const result = await acceptCardShare('share-1', { mode: 'new' }, {
    actor: 'head',
    storage,
    token: '',
    fetchImpl: (async () => new Response('{}', { status: 404 })) as typeof fetch,
    pushMaster: async (card) => {
      pushed.push(card);
      return 'pending';
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.assignedInstructorId, 'seat-paige');
  assert.equal(result.card.linkedStudentId, 'stu-paige');
  assert.equal(result.master, 'pending');
  assert.equal(pushed[0].assignedInstructorId, 'seat-paige');
  assert.equal(pushed[0].linkedStudentId, 'stu-paige');
});

test('merge into a card already assigned keeps that instructor; only the owner reassigns', async () => {
  const storage = testMemory();
  const card = addStudent({ name: 'Marco', belt: 'Purple', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '' } as never, { rosterList: 'student' })!;
  setAssignedInstructor(card.id, 'seat-marco');
  receiveCardShare(storage, share('share-2', 'stu-marco', 'seat-other'));
  const result = await acceptCardShare('share-2', { mode: 'merge', cardId: card.id }, { actor: 'head', storage, token: '', pushMaster: async () => 'skipped' });
  assert.equal(result.ok, true);
  const now = getRoster().students.find((row) => row.id === card.id)!;
  assert.equal(now.assignedInstructorId, 'seat-marco');
  assert.equal(setAssignedInstructor(card.id, 'seat-other')?.assignedInstructorId, 'seat-marco', 'a seat fill never moves a student');
  assert.equal(setAssignedInstructor(card.id, 'seat-other', { reassign: true })?.assignedInstructorId, 'seat-other');
});

test('no code, no assignment: the share without via stays unassigned (routes to the owner)', async () => {
  const storage = testMemory();
  receiveCardShare(storage, share('share-3', 'stu-new'));
  const result = await acceptCardShare('share-3', { mode: 'new' }, { actor: 'owner', storage, token: '', pushMaster: async () => 'applied' });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.assignedInstructorId, null);
});
