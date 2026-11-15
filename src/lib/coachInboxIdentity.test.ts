import assert from 'node:assert/strict';
import test from 'node:test';
import { packetForJournal, packetsForStudent, studentIdsFor } from './coachInboxIdentity.ts';
import { assessmentReplyText } from './coachReplyOutcome.ts';

// Production shape (Nov 15): the coach reply sits in the inbox under the free
// Student license id from the pass, while the journal uses a stu- id.
const PASS_ID = 'dbdae78e-5b1c-4af4-aee7-1f03b3d8dabb';
const JOURNAL_ID = 'stu-mwf84f3y-x4mg';
const reply = { kind: 'coach-assessment-update', studentId: PASS_ID, updateId: 'assess-mwhyod8a-ie458u' };

test('a reply addressed to the inbox pass id shows in From your coach', () => {
  const ids = { reportStudentId: JOURNAL_ID, stableStudentId: JOURNAL_ID, passStudentId: PASS_ID };
  assert.deepEqual(packetsForStudent([reply], ids), [reply]);
});

test('regression: without the pass id the reply was hidden', () => {
  const ids = { reportStudentId: JOURNAL_ID, stableStudentId: JOURNAL_ID, passStudentId: null };
  assert.deepEqual(packetsForStudent([reply], ids), []);
});

test('packets for another student stay hidden', () => {
  const ids = { reportStudentId: JOURNAL_ID, stableStudentId: JOURNAL_ID, passStudentId: PASS_ID };
  assert.deepEqual(packetsForStudent([{ ...reply, studentId: '87732937-52f7-4efe-9c8e-593d883f3567' }], ids), []);
});

test('placeholder journal id never matches anything', () => {
  const ids = { reportStudentId: 'student-local', stableStudentId: null, passStudentId: null };
  assert.equal(studentIdsFor(ids).size, 0);
  assert.deepEqual(packetsForStudent([{ ...reply, studentId: 'student-local' }], ids), []);
});

test('accept rebases a pass-addressed reply onto the journal id', () => {
  const ids = { reportStudentId: JOURNAL_ID, stableStudentId: JOURNAL_ID, passStudentId: PASS_ID };
  const target = packetForJournal(reply, JOURNAL_ID, ids);
  assert.equal(target?.studentId, JOURNAL_ID);
  assert.equal(target?.updateId, reply.updateId);
  assert.equal(packetForJournal({ ...reply, studentId: 'someone-else' }, JOURNAL_ID, ids), null);
  const same = { ...reply, studentId: JOURNAL_ID };
  assert.equal(packetForJournal(same, JOURNAL_ID, ids), same);
});

test('reply status only claims the inbox for a cloud delivery', () => {
  const ok = { ok: true } as const;
  const cloud = assessmentReplyText({ mode: 'cloud', studentPass: 'x.y.z' }, 'Haven', ok);
  assert.match(cloud.text, /^Delivered to Haven's From your coach inbox/);
  assert.equal(cloud.error, false);
  const file = assessmentReplyText(
    { mode: 'file', name: 'a.json', json: '{}', reason: 'This seat cannot write a student inbox. A file was saved for the student to import.' },
    'Haven',
    ok,
  );
  assert.match(file.text, /^Not delivered to Haven's inbox\. This seat cannot write/);
  assert.doesNotMatch(file.text, /From your coach inbox/);
  assert.equal(file.error, true);
  const folder = assessmentReplyText({ mode: 'folder', name: 'a.json' }, 'Marty', { ok: false, error: 'offline' });
  assert.match(folder.text, /gym folder for Marty/);
  assert.match(folder.text, /Marking it answered did not save: offline/);
});
