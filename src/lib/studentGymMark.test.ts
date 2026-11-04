import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptGymLogoUpdate,
  chooseStudentLogo,
  GYM_LOGO_PROMPT,
  gymLogoPromptDue,
  ignoreGymLogoUpdate,
  readStudentGymLogo,
  receiveGymLogo,
  studentLogoChoice,
  writeStudentGymLogo,
} from './studentGymMark.ts';
import { TEST_LOGO, TEST_LOGO_2, testMemory } from './testPackets.ts';

const OWN = 'data:image/png;base64,T1dOT1dOT1dO';

test('a connected student with no override starts on the gym logo, no prompt', () => {
  const storage = testMemory();
  assert.equal(receiveGymLogo({ logoVersion: 1, dataUrl: TEST_LOGO }, storage), 'started');
  assert.equal(readStudentGymLogo(storage), TEST_LOGO);
  assert.equal(gymLogoPromptDue(storage), false);
  assert.equal(GYM_LOGO_PROMPT, 'Your gym updated its logo. Update?');
});

test('a newer gym logo shows the prompt; an older one is ignored (latest wins)', () => {
  const storage = testMemory();
  receiveGymLogo({ logoVersion: 5, dataUrl: TEST_LOGO }, storage);
  assert.equal(receiveGymLogo({ logoVersion: 4, dataUrl: TEST_LOGO_2 }, storage), 'ignored');
  assert.equal(receiveGymLogo({ logoVersion: 6, dataUrl: TEST_LOGO_2 }, storage), 'prompt');
  assert.equal(gymLogoPromptDue(storage), true);
  // The logo is not swapped until the student says Update.
  assert.equal(readStudentGymLogo(storage), TEST_LOGO);
});

test('ignore keeps the current logo and does not nag until a newer version', () => {
  const storage = testMemory();
  receiveGymLogo({ logoVersion: 1, dataUrl: TEST_LOGO }, storage);
  receiveGymLogo({ logoVersion: 2, dataUrl: TEST_LOGO_2 }, storage);
  ignoreGymLogoUpdate(storage);
  assert.equal(gymLogoPromptDue(storage), false);
  assert.equal(readStudentGymLogo(storage), TEST_LOGO);
  assert.equal(receiveGymLogo({ logoVersion: 2, dataUrl: TEST_LOGO_2 }, storage), 'ignored');
  assert.equal(gymLogoPromptDue(storage), false);
  receiveGymLogo({ logoVersion: 3, dataUrl: TEST_LOGO_2 }, storage);
  assert.equal(gymLogoPromptDue(storage), true);
});

test('accept shows the newest gym logo', () => {
  const storage = testMemory();
  receiveGymLogo({ logoVersion: 1, dataUrl: TEST_LOGO }, storage);
  receiveGymLogo({ logoVersion: 2, dataUrl: TEST_LOGO_2 }, storage);
  assert.equal(acceptGymLogoUpdate(storage), true);
  assert.equal(readStudentGymLogo(storage), TEST_LOGO_2);
  assert.equal(gymLogoPromptDue(storage), false);
});

test('student override wins and persists across a gym update', () => {
  const storage = testMemory();
  writeStudentGymLogo(OWN, storage);
  chooseStudentLogo('own', storage);
  // A student with their own logo is never switched; they only get the prompt.
  assert.equal(receiveGymLogo({ logoVersion: 1, dataUrl: TEST_LOGO }, storage), 'prompt');
  assert.equal(readStudentGymLogo(storage), OWN);
  ignoreGymLogoUpdate(storage);
  receiveGymLogo({ logoVersion: 2, dataUrl: TEST_LOGO_2 }, storage);
  assert.equal(readStudentGymLogo(storage), OWN);
  assert.equal(studentLogoChoice(storage), 'own');
  // The Advantage default is also a choice that sticks.
  chooseStudentLogo('default', storage);
  receiveGymLogo({ logoVersion: 3, dataUrl: TEST_LOGO }, storage);
  assert.equal(readStudentGymLogo(storage), null);
});

test('revert to the gym logo picks the newest one the phone has', () => {
  const storage = testMemory();
  writeStudentGymLogo(OWN, storage);
  chooseStudentLogo('own', storage);
  receiveGymLogo({ logoVersion: 7, dataUrl: TEST_LOGO_2 }, storage);
  chooseStudentLogo('gym', storage);
  assert.equal(readStudentGymLogo(storage), TEST_LOGO_2);
  assert.equal(gymLogoPromptDue(storage), false);
});
