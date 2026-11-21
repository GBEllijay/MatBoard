import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanDisplayName,
  expectedForClass,
  linkedSendTargets,
  myRsvp,
  readClassRsvp,
  submitClassRsvp,
  whoInClassPrefill,
  type ClassRsvp,
} from './classAttendance.ts';
import type { Student } from './rosterStore.ts';

const rsvp = (over: Partial<ClassRsvp> = {}): ClassRsvp => ({
  slotId: 'slot-pm',
  date: '2026-11-23',
  studentId: 'stu-alex-preview',
  displayName: 'Alex Rivera',
  status: 'planned',
  updatedAt: 1,
  ...over,
});

test('cleanDisplayName strips email addresses', () => {
  assert.equal(cleanDisplayName('Alex Rivera <alex@example.com>'), 'Alex Rivera');
  assert.equal(cleanDisplayName('alex@example.com'), 'Student');
});

test('whoInClassPrefill lists planned and attended students, not cancelled ones', () => {
  const rows = [
    rsvp(),
    rsvp({ studentId: 'stu-jordan-preview', displayName: 'Jordan Lee', status: 'attended' }),
    rsvp({ studentId: 'stu-sam-preview', displayName: 'Sam Cole', status: 'cancelled' }),
  ];
  const prefill = whoInClassPrefill(rows, 'slot-pm', '2026-11-23');
  assert.equal(prefill.names, 'Alex Rivera, Jordan Lee');
  assert.deepEqual(prefill.ids, ['stu-alex-preview', 'stu-jordan-preview']);
  assert.equal(expectedForClass(rows, 'slot-pm', '2026-11-23').length, 2);
});

test('linkedSendTargets skips guests, unlinked cards, and comms-off students', () => {
  const roster: Student[] = [
    { id: 'c1', name: 'Alex Rivera', belt: 'Blue', division: '', gym: '', photo: '', lastPromotion: '', lastPromotionDetail: '', note: '', checkedIn: false, rosterList: 'student', linkedStudentId: 'stu-alex-preview' },
    { id: 'c2', name: 'Guest', belt: 'White', division: '', gym: '', photo: '', lastPromotion: '', lastPromotionDetail: '', note: '', checkedIn: false, guestId: 'g1' },
    { id: 'c3', name: 'Unlinked', belt: 'White', division: '', gym: '', photo: '', lastPromotion: '', lastPromotionDetail: '', note: '', checkedIn: false, rosterList: 'student' },
    { id: 'c4', name: 'Off', belt: 'White', division: '', gym: '', photo: '', lastPromotion: '', lastPromotionDetail: '', note: '', checkedIn: false, rosterList: 'student', linkedStudentId: 'stu-off', coachSync: 'off' },
  ];
  const targets = linkedSendTargets(roster, ['stu-alex-preview', 'stu-off', 'missing']);
  assert.deepEqual(targets.map((card) => card.name), ['Alex Rivera']);
});

test('submitClassRsvp writes a local mark and keeps going when the table is missing', async () => {
  const storage = {
    data: new Map<string, string>(),
    getItem(key: string) {
      return this.data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      this.data.set(key, value);
    },
  };
  const result = await submitClassRsvp(
    { slotId: 'slot-pm', date: '2026-11-23', studentId: 'stu-jordan-preview', displayName: 'Jordan Lee', status: 'planned' },
    {
      storage,
      fetchImpl: async () => new Response(JSON.stringify({ ok: false, available: false }), { status: 200 }),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.available, false);
  assert.equal(myRsvp([result.rsvp!], 'slot-pm', '2026-11-23', 'stu-jordan-preview')?.status, 'planned');
  assert.equal(readClassRsvp({ ...result.rsvp, displayName: 'Jordan Lee <jordan@example.com>' })?.displayName, 'Jordan Lee');
});
