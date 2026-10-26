import assert from 'node:assert/strict';
import test from 'node:test';
import { COACH_GYM_LOGO_MAX_CHARS } from './coachGymFit.ts';
import { buildGymBrandFile } from './coachGymFile.ts';
import { readTravelingGym } from './coachGymFit.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import type { CoachPlanPacket } from './progress/types.ts';
import { headerVisibility, writeProfileMark } from './profileMarks.ts';
import { writeProfilePortraitSync } from './profilePortrait.ts';
import { setBeltMode } from './beltBook.ts';
import { blankStudentReport, setStudentProfile } from './studentEdition.ts';
import { clearStudentGymLogo, readStudentGymLogo, writeStudentGymLogo } from './studentGymMark.ts';
import { applyCoachFile, progressReportFiles } from './studentTools.ts';

const LOGO = 'data:image/png;base64,BBBB';
const NEXT = 'data:image/png;base64,CCCC';
const SELFIE = 'data:image/jpeg;base64,AAAA';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

function plan(now = 20): CoachPlanPacket {
  return {
    schemaVersion: 2,
    kind: 'coach-plan',
    id: 'plan-1',
    studentId: 'student-local',
    updatedAt: now,
    plan: { title: 'Work on before next promotion', issuedOn: '2026-10-01', note: 'Keep showing up.', focus: [] },
  };
}

test('import from coach reads a gym logo and name, and an older file still loads', () => {
  const storage = memory();
  const report = blankStudentReport(10);
  const file = buildGymBrandFile({ name: 'GB Ellijay', logo: LOGO, issuedOn: '2026-10-26', now: 30 });
  const imported = applyCoachFile(report, { plan: null, feedback: null }, file);
  assert.equal(imported.error, '');
  assert.equal(imported.gymBrandOnly, true);
  assert.equal(imported.shelf.plan, null);
  assert.equal(imported.report.profile.gymName, 'GB Ellijay');
  assert.equal(imported.report.journal.length, 0);
  assert.equal(imported.gym?.logo, LOGO);
  if (imported.gym?.logo) writeStudentGymLogo(imported.gym.logo, storage);
  assert.equal(readStudentGymLogo(storage), LOGO);

  writeStudentGymLogo(NEXT, storage);
  assert.equal(readStudentGymLogo(storage), NEXT);
  clearStudentGymLogo(storage);
  assert.equal(readStudentGymLogo(storage), null);

  const legacy = applyCoachFile(setStudentProfile(report, { gymName: 'Home' }), { plan: null, feedback: null }, exportProgressPacket(plan()));
  assert.equal(legacy.error, '');
  assert.equal(legacy.gym, null);
  assert.equal(legacy.report.profile.gymName, 'Home');
  assert.equal(legacy.shelf.plan?.plan.title, 'Work on before next promotion');
});

test('a gym logo that is missing or unusable does not block an older coach file', () => {
  const raw = JSON.parse(exportProgressPacket(plan())) as { gym?: { name?: string; logo?: string }; extraPhoto?: string };
  const absent = parseProgressPacket(JSON.stringify(raw));
  assert.equal(absent.ok, true);
  if (absent.ok && absent.value.kind === 'coach-plan') assert.equal(absent.value.gym, undefined);

  raw.gym = { name: 'GB Ellijay', logo: 'https://example.com/logo.png' };
  const ignored = parseProgressPacket(JSON.stringify(raw));
  assert.equal(ignored.ok, true);
  if (ignored.ok && ignored.value.kind === 'coach-plan') {
    assert.equal(ignored.value.gym?.name, 'GB Ellijay');
    assert.equal(ignored.value.gym?.logo, undefined);
  }

  raw.gym = { name: 'GB Ellijay', logo: `data:image/jpeg;base64,${'A'.repeat(COACH_GYM_LOGO_MAX_CHARS)}` };
  const oversized = parseProgressPacket(JSON.stringify(raw));
  assert.equal(oversized.ok, true);
  if (oversized.ok && oversized.value.kind === 'coach-plan') assert.equal(oversized.value.gym?.logo, undefined);

  raw.extraPhoto = LOGO;
  delete raw.gym;
  const refused = parseProgressPacket(JSON.stringify(raw));
  assert.equal(refused.ok, false);
});

test('make a file for my coach includes the gym logo only when that switch is on, and never the photo', () => {
  const storage = memory();
  writeStudentGymLogo(LOGO, storage);
  writeProfilePortraitSync(SELFIE, storage);
  const adult = setStudentProfile(blankStudentReport(4), { displayName: 'Ada', gymName: 'GB Ellijay' }, 5);
  const withLogo = progressReportFiles(adult, [], storage);
  const gym = readTravelingGym(JSON.parse(withLogo.json));
  assert.equal(gym?.name, 'GB Ellijay');
  assert.equal(gym?.logo, LOGO);
  assert.equal(withLogo.json.includes(SELFIE), false);

  writeProfileMark('adult', 'logo', false, storage);
  writeProfileMark('adult', 'selfie', true, storage);
  const hidden = progressReportFiles(adult, [], storage);
  assert.equal(readTravelingGym(JSON.parse(hidden.json)), null);
  assert.equal(hidden.json.includes(SELFIE), false);

  const kids = setBeltMode(adult, 'kids', 6);
  writeProfileMark('kids', 'logo', true, storage);
  assert.equal(headerVisibility('kids', { version: 1, adult: { selfie: true, logo: false }, kids: { selfie: false, logo: true } }).selfie, false);
  const kidFile = progressReportFiles(kids, [], storage);
  assert.equal(readTravelingGym(JSON.parse(kidFile.json))?.logo, LOGO);
  assert.equal(kidFile.json.includes(SELFIE), false);
});
