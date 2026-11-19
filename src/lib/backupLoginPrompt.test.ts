import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_PROMPT_ACCOUNT_PATH,
  BACKUP_PROMPT_SNOOZE_KEY,
  BACKUP_PROMPT_SNOOZE_MS,
  backupLoginPromptVisible,
  deviceHasLocalData,
  readBackupPromptSnooze,
  snoozeBackupPrompt,
} from './backupLoginPrompt.ts';

function memory(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

const NOW = Date.UTC(2026, 10, 18, 20);

test('shows when the device has data and nobody is signed in', () => {
  assert.equal(backupLoginPromptVisible({ signedIn: false, hasData: true, snoozedUntil: 0, now: NOW }), true);
  assert.match(BACKUP_PROMPT_ACCOUNT_PATH, /^\/account\?/);
});

test('hidden when signed in, with no data, in the demo, or in private browsing', () => {
  assert.equal(backupLoginPromptVisible({ signedIn: true, hasData: true, snoozedUntil: 0, now: NOW }), false);
  assert.equal(backupLoginPromptVisible({ signedIn: false, hasData: false, snoozedUntil: 0, now: NOW }), false);
  assert.equal(backupLoginPromptVisible({ signedIn: false, hasData: true, snoozedUntil: 0, now: NOW, demo: true }), false);
  assert.equal(backupLoginPromptVisible({ signedIn: false, hasData: true, snoozedUntil: 0, now: NOW, privateBrowsing: true }), false);
});

test('Not now snoozes for about a week, then it can show again', () => {
  const store = memory();
  const until = snoozeBackupPrompt(store, NOW);
  assert.equal(until, NOW + BACKUP_PROMPT_SNOOZE_MS);
  assert.equal(BACKUP_PROMPT_SNOOZE_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(store.getItem(BACKUP_PROMPT_SNOOZE_KEY), String(until));
  const snoozedUntil = readBackupPromptSnooze(store);
  assert.equal(backupLoginPromptVisible({ signedIn: false, hasData: true, snoozedUntil, now: NOW + 1000 }), false);
  assert.equal(backupLoginPromptVisible({ signedIn: false, hasData: true, snoozedUntil, now: NOW + 6 * 86_400_000 }), false);
  assert.equal(backupLoginPromptVisible({ signedIn: false, hasData: true, snoozedUntil, now: NOW + BACKUP_PROMPT_SNOOZE_MS + 1 }), true);
});

test('a broken snooze value or a store that throws never blocks the page', () => {
  assert.equal(readBackupPromptSnooze(memory({ [BACKUP_PROMPT_SNOOZE_KEY]: 'nope' })), 0);
  assert.equal(readBackupPromptSnooze(null), 0);
  const throwing = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(snoozeBackupPrompt(throwing, NOW), NOW + BACKUP_PROMPT_SNOOZE_MS);
});

test('what counts as data worth backing up', () => {
  assert.equal(deviceHasLocalData(null), false);
  assert.equal(deviceHasLocalData(memory()), false);
  assert.equal(deviceHasLocalData(memory({ 'matboard.gymName.v1': JSON.stringify({ name: '' }) })), false);
  assert.equal(deviceHasLocalData(memory({ 'matboard.gymName.v1': JSON.stringify({ name: 'Advantage BJJ' }) })), true);
  assert.equal(deviceHasLocalData(memory({ 'matboard.roster.v1': '[]' })), false);
  assert.equal(deviceHasLocalData(memory({ 'matboard.roster.v1': JSON.stringify([{ id: 'a', name: 'Sam' }]) })), true);
  const blankStudent = JSON.stringify({ profile: { displayName: '', belt: 'white' }, journal: [] });
  assert.equal(deviceHasLocalData(memory({ 'matboard.studentEdition.v1': blankStudent })), false);
  const namedStudent = JSON.stringify({ profile: { displayName: 'Sam', belt: 'blue' }, journal: [] });
  assert.equal(deviceHasLocalData(memory({ 'matboard.studentEdition.v1': namedStudent })), true);
  // A second profile's file carries a suffix.
  assert.equal(deviceHasLocalData(memory({ 'matboard.studentEdition.v1::profile:p2': namedStudent })), true);
  // Unrelated settings are not data.
  assert.equal(deviceHasLocalData(memory({ 'matboard.rosterSort.v1': '"name"', 'advantage.login.v1': '' })), false);
});
