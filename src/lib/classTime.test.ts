import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CLASS_TIME_BLANK_VALUE,
  CLASS_TIME_CUSTOM_VALUE,
  CLASS_TIME_STEP_MINUTES,
  classTimeFromWheel,
  classTimeWheelOptions,
  classTimeWheelValue,
  formatClassTimeLabel,
  parseClassTimeMinutes,
} from './classTime.ts';

test('class time labels are 12-hour with AM/PM', () => {
  assert.equal(formatClassTimeLabel(0), '12:00 AM');
  assert.equal(formatClassTimeLabel(15), '12:15 AM');
  assert.equal(formatClassTimeLabel(9 * 60 + 5), '9:05 AM');
  assert.equal(formatClassTimeLabel(12 * 60), '12:00 PM');
  assert.equal(formatClassTimeLabel(17 * 60), '5:00 PM');
  assert.equal(formatClassTimeLabel(23 * 60 + 45), '11:45 PM');
});

test('existing typed class times parse into minutes from midnight', () => {
  assert.equal(parseClassTimeMinutes('5:00 PM'), 17 * 60);
  assert.equal(parseClassTimeMinutes('5:00PM'), 17 * 60);
  assert.equal(parseClassTimeMinutes('5 pm'), 17 * 60);
  assert.equal(parseClassTimeMinutes('5:00 p.m.'), 17 * 60);
  assert.equal(parseClassTimeMinutes('  6:45 AM '), 6 * 60 + 45);
  assert.equal(parseClassTimeMinutes('12:00 AM'), 0);
  assert.equal(parseClassTimeMinutes('12:00 PM'), 12 * 60);
  assert.equal(parseClassTimeMinutes('12:15 am'), 15);
  assert.equal(parseClassTimeMinutes('17:00'), 17 * 60);
  assert.equal(parseClassTimeMinutes('00:00'), 0);
  assert.equal(parseClassTimeMinutes('09:30'), 9 * 60 + 30);
  assert.equal(parseClassTimeMinutes('5:10 PM'), 17 * 60 + 10);
  assert.equal(parseClassTimeMinutes(''), null);
  assert.equal(parseClassTimeMinutes('   '), null);
  assert.equal(parseClassTimeMinutes('5:00'), null);
  assert.equal(parseClassTimeMinutes('5'), null);
  assert.equal(parseClassTimeMinutes('evening'), null);
  assert.equal(parseClassTimeMinutes('25:00'), null);
  assert.equal(parseClassTimeMinutes('13:00 PM'), null);
});

test('the class-time wheel lists 15-minute AM/PM steps and keeps a saved off-step or free-text time', () => {
  const options = classTimeWheelOptions('');
  assert.equal(options[0]?.value, CLASS_TIME_BLANK_VALUE);
  assert.equal(options[0]?.label, '—');
  assert.equal(options.length, 1 + (24 * 60) / CLASS_TIME_STEP_MINUTES);
  assert.equal(options[1]?.label, '12:00 AM');
  assert.equal(options[1]?.detent, true);
  assert.equal(options.find((option) => option.value === 15)?.label, '12:15 AM');
  assert.equal(options.find((option) => option.value === 17 * 60)?.label, '5:00 PM');
  assert.equal(options.at(-1)?.label, '11:45 PM');
  assert.equal(classTimeWheelValue(''), CLASS_TIME_BLANK_VALUE);
  assert.equal(classTimeFromWheel(CLASS_TIME_BLANK_VALUE), '');
  assert.equal(classTimeFromWheel(17 * 60), '5:00 PM');

  const saved = classTimeWheelOptions('5:10 PM');
  assert.equal(saved.find((option) => option.value === 17 * 60 + 10)?.label, '5:10 PM');
  assert.equal(classTimeWheelValue('5:10 PM'), 17 * 60 + 10);
  assert.equal(classTimeWheelOptions('5:00 PM').filter((option) => option.label === '5:00 PM').length, 1);
  assert.equal(classTimeWheelValue('5:00 PM'), 17 * 60);
  assert.equal(classTimeWheelValue('17:00'), 17 * 60);

  const custom = classTimeWheelOptions('evening');
  assert.equal(custom.find((option) => option.value === CLASS_TIME_CUSTOM_VALUE)?.label, 'evening');
  assert.equal(classTimeWheelValue('evening'), CLASS_TIME_CUSTOM_VALUE);
  assert.equal(classTimeFromWheel(CLASS_TIME_CUSTOM_VALUE, 'evening'), 'evening');
  assert.equal(classTimeFromWheel(CLASS_TIME_BLANK_VALUE, 'evening'), '');
});

test('choosing a wheel row writes the standard label and does not rewrite a value just by listing it', () => {
  assert.equal(classTimeFromWheel(classTimeWheelValue('17:00'), '17:00'), '5:00 PM');
  assert.equal(classTimeWheelValue('17:00'), 17 * 60);
  assert.equal(classTimeFromWheel(classTimeWheelValue('5:00 PM'), '5:00 PM'), '5:00 PM');
  assert.equal(classTimeFromWheel(9 * 60 + 30), '9:30 AM');
});

test('the Daily Lesson Plan and Competition Class use the shared class-time wheel, not a typed field', () => {
  const field = readFileSync(new URL('../components/ClassTimeField.tsx', import.meta.url), 'utf8');
  const notes = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  const curriculum = readFileSync(new URL('../pages/CompetitionCurriculum.tsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../components/WheelPicker.tsx', import.meta.url), 'utf8');
  assert.match(field, /WheelPicker/);
  assert.match(field, /classTimeWheelOptions/);
  assert.match(field, /classTimeFromWheel/);
  assert.doesNotMatch(field, /<input/);
  assert.match(notes, /ClassTimeField/);
  assert.match(curriculum, /ClassTimeField/);
  assert.match(notes, /id="notes-class-time"/);
  assert.match(curriculum, /id="curriculum-time"/);
  assert.doesNotMatch(notes, /placeholder="5:00 PM"/);
  assert.doesNotMatch(curriculum, /placeholder="5:00 PM"/);
  assert.doesNotMatch(notes, /<input[^>]*id="notes-class-time"|htmlFor="notes-class-time"/);
  assert.doesNotMatch(curriculum, /<input[^>]*id="curriculum-time"|htmlFor="curriculum-time"/);
  assert.match(picker, /disabled/);
});
