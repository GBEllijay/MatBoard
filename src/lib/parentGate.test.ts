import assert from 'node:assert/strict';
import test from 'node:test';
import { importCoachText } from './coachInbound.ts';
import { readCoachQueue } from './coachRankUpdate.ts';
import { receiveSyncPacket } from './coachSync.ts';
import {
  disableParentGate,
  enableParentGate,
  heldForParent,
  parentDecide,
  parentGateOn,
  readParentGate,
} from './parentGate.ts';
import { gymLogoPromptDue, readGymLogoSync } from './studentGymMark.ts';
import { blankStudentReport } from './studentEdition.ts';
import { assignStudentId } from './studentIdentity.ts';
import { loadCoachShelf, sampleCoachPlanFile } from './studentTools.ts';
import { everyTestPacket, testMemory } from './testPackets.ts';

const PIN = '4321';

async function gated() {
  const storage = testMemory();
  const on = await enableParentGate(storage, PIN);
  assert.equal(on.ok, true);
  return storage;
}

test('off by default: every packet type follows the current flow unchanged', () => {
  const storage = testMemory();
  assert.equal(parentGateOn(storage), false);
  const results = everyTestPacket().map((packet) => receiveSyncPacket(storage, packet));
  assert.deepEqual(results, ['queued', 'queued', 'queued', 'queued', 'queued', 'logo-started']);
  assert.equal(heldForParent(storage).length, 0);
  const report = assignStudentId(blankStudentReport(10), 'stu-alex', 10);
  const plan = importCoachText(storage, report, sampleCoachPlanFile('stu-alex', 80).json);
  assert.equal(plan.kind, 'applied');
  assert.ok(loadCoachShelf(storage).plan);
});

test('on: every packet type is held until a parent approves (cloud, file, coach plan)', async () => {
  const storage = await gated();
  const results = everyTestPacket().map((packet) => receiveSyncPacket(storage, packet));
  assert.deepEqual(results, ['parent-hold', 'parent-hold', 'parent-hold', 'parent-hold', 'parent-hold', 'parent-hold']);
  // Nothing reached the student: no accept cards, no logo, no prompt.
  assert.equal(readCoachQueue(storage).length, 0);
  assert.equal(readGymLogoSync(storage).latest, null);
  assert.equal(gymLogoPromptDue(storage), false);
  // A repeat pull does not hold twice.
  receiveSyncPacket(storage, everyTestPacket()[0]);
  assert.equal(heldForParent(storage).length, 6);

  const report = assignStudentId(blankStudentReport(10), 'stu-alex', 10);
  const plan = importCoachText(storage, report, sampleCoachPlanFile('stu-alex', 80).json);
  assert.equal(plan.kind, 'parent-hold');
  assert.equal(loadCoachShelf(storage).plan, null);
  assert.equal(heldForParent(storage).length, 7);
});

test('parent approve hands each packet on; the student still accepts', async () => {
  const storage = await gated();
  for (const packet of everyTestPacket()) receiveSyncPacket(storage, packet);
  const report = assignStudentId(blankStudentReport(10), 'stu-alex', 10);
  importCoachText(storage, report, sampleCoachPlanFile('stu-alex', 80).json);
  assert.equal((await parentDecide(storage, heldForParent(storage)[0].holdId, '0000', 'approve')).ok, false);
  for (const item of heldForParent(storage)) {
    const decided = await parentDecide(storage, item.holdId, PIN, 'approve');
    assert.equal(decided.ok, true);
    if (!decided.ok) continue;
    if (decided.item.route === 'sync') receiveSyncPacket(storage, decided.item.text, null, { parentApproved: true });
    else importCoachText(storage, report, decided.item.text, { parentApproved: true });
  }
  assert.equal(heldForParent(storage).length, 0);
  assert.equal(readCoachQueue(storage).length, 5);
  assert.ok(readGymLogoSync(storage).shown);
  assert.ok(loadCoachShelf(storage).plan);
});

test('parent decline drops the packet and it is not held again', async () => {
  const storage = await gated();
  const [rank] = everyTestPacket();
  receiveSyncPacket(storage, rank);
  const [held] = heldForParent(storage);
  const declined = await parentDecide(storage, held.holdId, PIN, 'decline');
  assert.equal(declined.ok, true);
  assert.equal(heldForParent(storage).length, 0);
  assert.equal(receiveSyncPacket(storage, rank), 'ignored');
  assert.equal(heldForParent(storage).length, 0);
  assert.equal(readCoachQueue(storage).length, 0);
});

test('PIN: 4–8 digits, hashed, and needed to turn the gate off', async () => {
  const storage = testMemory();
  assert.equal((await enableParentGate(storage, '12')).ok, false);
  const storageOn = await gated();
  assert.equal(readParentGate(storageOn).pinHash.includes(PIN), false);
  assert.equal([...storageOn.bag.values()].some((value) => value.includes(`"${PIN}"`)), false);
  assert.equal((await disableParentGate(storageOn, '9999')).ok, false);
  assert.equal(parentGateOn(storageOn), true);
  receiveSyncPacket(storageOn, everyTestPacket()[1]);
  const off = await disableParentGate(storageOn, PIN);
  assert.equal(off.ok, true);
  // Turning it off releases held items to the caller; nothing is lost.
  if (off.ok) assert.equal(off.released.length, 1);
  assert.equal(parentGateOn(storageOn), false);
  assert.equal(receiveSyncPacket(storageOn, everyTestPacket()[0]), 'queued');
});
