import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  academyLinkOf,
  COACH_LINK_PARAM,
  STUDENT_CODE_FIRST_ACTIONS,
  STUDENT_CODE_FIRST_LEAD,
  STUDENT_CODE_FIRST_STEPS,
  STUDENT_CODE_FIRST_TITLE,
} from './studentCodeFirst.ts';

test('academy QR and Drive academy links are recognised; a plain /student visit is not', () => {
  assert.equal(academyLinkOf(new URLSearchParams('coach=abc.def.ghi')), 'coach');
  assert.equal(academyLinkOf(new URLSearchParams('academy=tok123')), 'academy');
  assert.equal(academyLinkOf(new URLSearchParams('')), null);
  assert.equal(academyLinkOf(new URLSearchParams('coach=')), null);
  assert.equal(academyLinkOf(new URLSearchParams('student=1')), null);
});

test('the coach param matches the one the academy QR is built with', () => {
  const source = readFileSync(new URL('./coachConnect.ts', import.meta.url), 'utf8');
  assert.match(source, new RegExp(`COACH_CONNECT_PARAM = '${COACH_LINK_PARAM}'`));
});

test('a phone without Student Edition is told it needs a code first, with a way to get one', () => {
  assert.equal(STUDENT_CODE_FIRST_TITLE, 'You need a Student Edition code first');
  assert.match(STUDENT_CODE_FIRST_LEAD, /academy/);
  assert.equal(STUDENT_CODE_FIRST_STEPS.length, 3);
  assert.match(STUDENT_CODE_FIRST_STEPS[0] ?? '', /instructor or gym owner/);
  assert.deepEqual(
    STUDENT_CODE_FIRST_ACTIONS.map((action) => action.to),
    ['/account?tab=invite', '/account', '/editions/student'],
  );
});

test('the locked Student Edition page switches to this screen only for an academy link', () => {
  const page = readFileSync(new URL('../pages/StudentEdition.tsx', import.meta.url), 'utf8');
  assert.match(page, /if \(!open\) return <StudentClosed link=\{academyLinkOf\(params\)\} \/>;/);
  assert.match(page, /STUDENT_CODE_FIRST_TITLE/);
  // A plain locked visit keeps the original line.
  assert.match(page, /Student Edition opens with a code or a purchase\./);
  const account = readFileSync(new URL('../pages/Account.tsx', import.meta.url), 'utf8');
  assert.match(account, /tab === 'invite' \|\| tab === 'code'/, '/account?tab=invite opens the invite tab');
});

test('boot keeps the academy QR token in the address (it never unlocks Coach) and still strips ?coach=1', async () => {
  const { stripsCoachParam } = await import('./proUnlock.ts');
  const { previewCoachUnlockFromSearch, applyCoachUnlockSearch } = await import('./coachUnlock.ts');
  assert.equal(stripsCoachParam('1'), true);
  assert.equal(stripsCoachParam('0'), true);
  assert.equal(stripsCoachParam(''), true);
  assert.equal(stripsCoachParam(null), false);
  const signed = 'eyJhbGciOi.eyJ0eXAiOi.c2lnbmF0dXJl';
  assert.equal(stripsCoachParam(signed), false);
  assert.equal(previewCoachUnlockFromSearch(new URLSearchParams(`coach=${signed}`)), null);
  assert.equal(applyCoachUnlockSearch(new URLSearchParams(`coach=${signed}`)), false);
});
