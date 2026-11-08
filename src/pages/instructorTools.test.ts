import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COACH_UNLIMITED_TOOLS } from '../lib/productNames.ts';

const page = readFileSync(new URL('./CoachUnlimited.tsx', import.meta.url), 'utf8');
const marks = readFileSync(new URL('../components/InstructorToolMark.tsx', import.meta.url), 'utf8');
const seats = readFileSync(new URL('../lib/instructorSeats.ts', import.meta.url), 'utf8');
const pro = readFileSync(new URL('./Pro.tsx', import.meta.url), 'utf8');

test('Instructor tools keep the live routes and drop the left belt', () => {
  assert.match(page, /coachToolVisible\(tool\.to, seat\)/);
  assert.match(page, /to=\{tool\.to\}/);
  assert.match(page, /tool\.clearBout \? \(\) => unlinkBracketBout\(\)/);
  assert.match(page, /<BeltHeader kind="brown" worn title="Instructor Edition"/);
  assert.doesNotMatch(page, /BeltRail/);
  assert.match(page, /className="instructor-tool"/);
  assert.deepEqual(
    COACH_UNLIMITED_TOOLS.map((tool) => tool.to),
    [
      '/notes?plan=unlimited',
      '/techniques?from=unlimited',
      '/technique-tree?from=unlimited',
      '/student-roster',
      '/record-for-review?from=unlimited',
      '/match/control?from=unlimited',
      '/training/control?from=unlimited',
    ],
  );
  assert.match(page, /\[TRAINING_NOTES_LABEL\]: 'plan'/);
  assert.match(page, /'Daily Training Videos': 'video'/);
  assert.match(page, /\[TECHNIQUE_TREE_LABEL\]: 'tree'/);
  assert.match(page, /\[STUDENT_ROSTER_LABEL\]: 'roster'/);
  assert.match(page, /'Record for Review': 'record'/);
  assert.match(page, /Scoreboard: 'board'/);
  assert.match(page, /'Round Timer': 'timer'/);
  assert.match(marks, /fill="#6ea8ff">5:00/);
  assert.match(marks, /fill="#14161c" fontFamily="ui-monospace, monospace">5:00/);
  assert.match(marks, />Blue</);
  assert.match(marks, />White</);
  assert.match(marks, /fill="#f4f1ea" \/>\s*<path d="M30 24h32/);
  assert.doesNotMatch(marks, /M46 24v13l8 5/);
});

test('sign-out and the Pro menu labels stay in place', () => {
  assert.match(seats, /export function signOutInstructorSeat/);
  assert.match(pro, /<span>Advantage White<\/span>/);
  assert.match(pro, /<span>Advantage Student Edition<\/span>/);
  assert.match(pro, /title: 'Advantage Media Edition'/);
  assert.doesNotMatch(pro, /[Jj]ournal/);
});
