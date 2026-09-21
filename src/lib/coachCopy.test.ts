import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COACH_AD_LEAD,
  COACH_TOOLS_TEASER,
  EMPTY_BRACKET_BODY,
  EMPTY_BRACKET_TITLE,
  EMPTY_NOTES_BODY,
  EMPTY_NOTES_TITLE,
  EMPTY_ROSTER_BODY,
  EMPTY_ROSTER_SEARCH,
  EMPTY_ROSTER_TITLE,
  EMPTY_VIDEOS_BODY,
  EMPTY_VIDEOS_TITLE,
  NOTES_LEAD,
  ROSTER_LEAD_COACH,
  ROSTER_LEAD_PRO,
} from './coachCopy.ts';

function allCopy(): string {
  return [
    COACH_TOOLS_TEASER,
    COACH_AD_LEAD,
    EMPTY_ROSTER_TITLE,
    EMPTY_ROSTER_BODY,
    EMPTY_ROSTER_SEARCH,
    EMPTY_NOTES_TITLE,
    EMPTY_NOTES_BODY,
    EMPTY_VIDEOS_TITLE,
    EMPTY_VIDEOS_BODY,
    EMPTY_BRACKET_TITLE,
    EMPTY_BRACKET_BODY,
    NOTES_LEAD,
    ROSTER_LEAD_COACH,
    ROSTER_LEAD_PRO,
  ].join('\n');
}

test('Coach teasers list the four hub tools', () => {
  assert.match(COACH_TOOLS_TEASER, /Mock Tournament/);
  assert.match(COACH_TOOLS_TEASER, /Competitor roster/);
  assert.match(COACH_TOOLS_TEASER, /Training notes/);
  assert.match(COACH_TOOLS_TEASER, /Daily Training Videos/);
  assert.match(COACH_AD_LEAD, /Mock Tournament/);
  assert.match(COACH_AD_LEAD, /Competitor Management/);
  assert.match(COACH_AD_LEAD, /Training notes/);
  assert.match(COACH_AD_LEAD, /Daily Training Videos/);
  assert.doesNotMatch(COACH_AD_LEAD, /Daily Techniques/);
});

test('Coach empty states stay friendly and skip student progress', () => {
  const text = allCopy();
  assert.match(text, /No competitors yet/);
  assert.match(text, /No notes yet/);
  assert.match(text, /No clips yet/);
  assert.match(text, /Empty bracket/);
  assert.match(text, /2:30/);
  assert.match(text, /5:00/);
  assert.match(text, /7:00/);
  assert.doesNotMatch(text, /\bstudents?\b/i);
  assert.doesNotMatch(text, /progress/i);
  assert.doesNotMatch(text, /GB Members/i);
  assert.doesNotMatch(text, /membership/i);
});
