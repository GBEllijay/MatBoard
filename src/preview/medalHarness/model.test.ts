import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  HARNESS_CLAIMS,
  HARNESS_STUDENT_ID,
  buildHarnessEnvelope,
  buildHarnessStudentReport,
  dedupeClaims,
  exportRealBackup,
  readForInstructor,
  repeatAcceptRefused,
  restoreRealBackup,
  wrongStudentCoachPacket,
} from './model.ts';

test('the real backup has matches and no medals, and a repeat coach packet is refused', () => {
  const { report } = buildHarnessStudentReport();
  assert.equal(report.studentId, HARNESS_STUDENT_ID);
  const raw = exportRealBackup(report);
  assert.equal(raw.includes('"medal"'), false);
  assert.equal(raw.includes('fake-bracket'), false);
  const restored = restoreRealBackup(raw);
  assert.equal(restored.ok, true);
  if (restored.ok) assert.ok(restored.report.competition.results.length >= 3);
  assert.equal(repeatAcceptRefused(report), true);
});

test('a student envelope is not an instructor certification', () => {
  const { report } = buildHarnessStudentReport();
  const envelope = buildHarnessEnvelope(report, [...HARNESS_CLAIMS, HARNESS_CLAIMS[0]]);
  assert.equal(dedupeClaims(envelope.claims).length, HARNESS_CLAIMS.length);
  const read = readForInstructor(JSON.stringify(envelope));
  assert.equal(read.certified, false);
  assert.equal(read.academyTotalsChanged, false);
  assert.equal(read.uncertifiedClaims.some((claim) => claim.id === 'claim-silver-loss' && claim.matches[0]?.result === 'loss'), true);
  assert.equal(read.uncertifiedClaims.some((claim) => claim.id === 'claim-gold-nofight' && claim.matches.length === 0), true);
  assert.equal(read.uncertifiedClaims.some((claim) => claim.id === 'claim-open'), true);
  assert.equal(read.uncertifiedClaims.some((claim) => claim.id === 'claim-team'), true);
  assert.equal(read.uncertifiedClaims.some((claim) => claim.academy === 'Other Gym'), false);
  const bad = readForInstructor('{"kind":"not-a-progress-file"}');
  assert.equal(bad.ok, false);
  const wrong = readForInstructor(wrongStudentCoachPacket());
  assert.equal(wrong.certified, false);
  assert.match(wrong.title, /Wrong student|Coach-to-student/);
});

test('the harness page does not edit approved preview files', () => {
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /\/preview\/medal-harness/);
  const page = readFileSync(new URL('./MedalHarnessPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /localStorage|fetch\(|stripe/i);
  assert.match(page, /No production path|No production send|not instructor-certified/i);
});
