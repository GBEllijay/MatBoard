import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_CARRY_KEY,
  DEMO_CARRY_MAX_CHARS,
  demoBackupDownload,
  demoFingerprint,
  doorsForProduct,
  planDemoCarryover,
  readStagedDemo,
  settleDemoCarryover,
  stageStudentDemoFile,
} from './demoCarryover.ts';
import { exportProgressPacket } from './progress/format.ts';
import { parseStudentBackup } from './studentBackup.ts';
import { blankStudentReport } from './studentEdition.ts';
import { API_PRODUCT_COACH, API_PRODUCT_ID, API_PRODUCT_MEDIA, API_PRODUCT_PRO, API_PRODUCT_STUDENT } from '../server/routes.ts';

function memory() {
  const bag = new Map<string, string>();
  return {
    getItem: (key: string) => (bag.has(key) ? bag.get(key)! : null),
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
    removeItem: (key: string) => {
      bag.delete(key);
    },
  };
}

const seed = '{"profile":{"displayName":"Demo Student"},"journal":[]}';
const edited = '{"profile":{"displayName":"Alex"},"journal":[{"id":"card-1","body":"uchi mata"}],"working":{"nodes":[{"id":"w1","title":"Uchi Mata"}],"edges":[]}}';
const existing = '{"profile":{"displayName":"Real Student"},"journal":[{"id":"kept"}],"working":{"nodes":[],"edges":[]}}';

test('product doors follow the tier table and White does not include Student', () => {
  assert.deepEqual(doorsForProduct(API_PRODUCT_ID), ['white']);
  assert.ok(doorsForProduct(API_PRODUCT_STUDENT).includes('student'));
  assert.ok(doorsForProduct(API_PRODUCT_MEDIA).includes('student'));
  assert.ok(doorsForProduct(API_PRODUCT_COACH).includes('student'));
  assert.ok(doorsForProduct(API_PRODUCT_PRO).includes('student'));
  assert.equal(doorsForProduct(API_PRODUCT_ID).includes('student'), false);
  assert.deepEqual(doorsForProduct('not-a-product'), []);
});

test('the sample seed is not staged, and a user edit is', () => {
  const store = memory();
  assert.equal(stageStudentDemoFile(store, seed, seed), 'skipped');
  assert.equal(readStagedDemo(store), null);
  assert.equal(stageStudentDemoFile(store, edited, seed, 10), 'staged');
  const staged = readStagedDemo(store);
  assert.equal(staged?.door, 'student');
  assert.equal(staged?.fingerprint, demoFingerprint(edited));
  assert.equal(stageStudentDemoFile(store, `${edited} advantage.entitlement.token`, seed), 'unsafe');
  assert.equal(readStagedDemo(store)?.text, edited);
  assert.equal(stageStudentDemoFile(store, 'x'.repeat(DEMO_CARRY_MAX_CHARS + 1), seed), 'too-large');
  assert.equal(readStagedDemo(store)?.text, edited);
});

test('White keeps the demo waiting and does not write or unlock Student', () => {
  const store = memory();
  stageStudentDemoFile(store, edited, seed);
  const plan = settleDemoCarryover(store, ['white']);
  assert.equal(plan.action, 'waiting');
  assert.match(plan.message, /White/);
  assert.match(plan.message, /does not include Student Edition/);
  assert.equal(plan.writeText, null);
  assert.equal(store.getItem('matboard.studentEdition.v1'), null);
  assert.equal(store.getItem('advantage.studentUnlocked'), null);
  assert.equal(store.getItem('advantage.studentEditionUnlocked'), null);
  assert.ok(readStagedDemo(store));
});

test('Student, Media, Instructor, and Pro adopt an empty file once', () => {
  for (const grants of [['student'], ['media'], ['coach'], ['pro']] as const) {
    const store = memory();
    stageStudentDemoFile(store, edited, seed);
    const first = settleDemoCarryover(store, grants);
    assert.equal(first.action, 'adopted');
    assert.equal(store.getItem('matboard.studentEdition.v1'), edited);
    assert.equal(readStagedDemo(store), null);
    stageStudentDemoFile(store, edited, seed);
    const again = settleDemoCarryover(store, grants);
    assert.equal(again.action, 'unchanged');
    assert.equal(store.getItem('matboard.studentEdition.v1'), edited);
    assert.equal(store.getItem('advantage.studentUnlocked'), null);
  }
});

test('an existing student file is not overwritten, and an explicit choice can replace it', () => {
  const store = memory();
  store.setItem('matboard.studentEdition.v1', existing);
  stageStudentDemoFile(store, edited, seed);
  const held = settleDemoCarryover(store, ['coach']);
  assert.equal(held.action, 'needs-choice');
  assert.equal(store.getItem('matboard.studentEdition.v1'), existing);
  assert.ok(readStagedDemo(store));
  const replaced = settleDemoCarryover(store, ['pro'], 'use-demo');
  assert.equal(replaced.action, 'adopted');
  assert.equal(store.getItem('matboard.studentEdition.v1'), edited);
  assert.equal(readStagedDemo(store), null);
});

test('cancel and a failed confirm leave the staged copy, and a later real edit is not replaced', () => {
  const store = memory();
  stageStudentDemoFile(store, edited, seed);
  const before = store.getItem(DEMO_CARRY_KEY);
  assert.ok(before);
  assert.equal(store.getItem('matboard.studentEdition.v1'), null);
  const adopted = settleDemoCarryover(store, ['student']);
  assert.equal(adopted.action, 'adopted');
  const editedLater = existing;
  store.setItem('matboard.studentEdition.v1', editedLater);
  stageStudentDemoFile(store, edited, seed);
  const second = planDemoCarryover(store, ['student'], store.getItem('matboard.studentEdition.v1'));
  assert.equal(second.action, 'needs-choice');
  assert.equal(second.writeText, null);
});

test('the download is a normal student backup and leaves out video files', () => {
  const report = blankStudentReport(20);
  report.profile = { ...report.profile, displayName: 'Alex' };
  const text = exportProgressPacket(report);
  const download = demoBackupDownload(text, '2026-11-07');
  assert.equal(download.ok, true);
  if (!download.ok) return;
  assert.equal(download.json.includes('advantage.entitlement'), false);
  assert.equal(download.json.includes('filmFiles'), true);
  const parsed = parseStudentBackup(download.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.file.report.profile.displayName, 'Alex');
  assert.equal(parsed.file.filmFiles, undefined);
  assert.equal(parsed.file.filmFilesOmitted?.[0]?.reason.includes('Video files'), true);
  const raw = parseStudentBackup(text);
  assert.equal(raw.ok, false);
});

test('a tampered stage is ignored', () => {
  const store = memory();
  store.setItem(
    DEMO_CARRY_KEY,
    JSON.stringify({ version: 1, source: 'student-demo', door: 'student', savedAt: 1, fingerprint: 'nope', text: edited }),
  );
  assert.equal(readStagedDemo(store), null);
  assert.equal(settleDemoCarryover(store, ['pro']).action, 'none');
});
