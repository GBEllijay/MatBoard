import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COACH_AD_LEAD,
  COACH_HOME_TEASER,
  COACH_HUB_BLURB,
  COACH_TOOLS_TEASER,
  COMPETITOR_ROSTER_LABEL,
  TECHNIQUE_TREE_LABEL,
  TECHNIQUE_TREE_LEAD,
  TRAINING_NOTES_LABEL,
  EMPTY_BRACKET_BODY,
  EMPTY_BRACKET_TITLE,
  OWNER_BRACKET_CLOUD_NOTE,
  EMPTY_NOTES_BODY,
  EMPTY_NOTES_TITLE,
  EMPTY_ROSTER_BODY,
  EMPTY_ROSTER_SEARCH,
  EMPTY_ROSTER_TITLE,
  EMPTY_VIDEOS_BODY,
  EMPTY_VIDEOS_TITLE,
  NOTES_LEAD,
  ROSTER_CSV_ABOUT,
  ROSTER_CSV_COACH_HOW,
  ROSTER_CSV_COACH_STAYS,
  ROSTER_LEAD_COACH,
  ROSTER_LEAD_PRO,
} from './coachCopy.ts';

function allCopy(): string {
  return [
    COMPETITOR_ROSTER_LABEL,
    TRAINING_NOTES_LABEL,
    TECHNIQUE_TREE_LABEL,
    TECHNIQUE_TREE_LEAD,
    COACH_TOOLS_TEASER,
    COACH_HOME_TEASER,
    COACH_HUB_BLURB,
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
    OWNER_BRACKET_CLOUD_NOTE,
    NOTES_LEAD,
    ROSTER_CSV_ABOUT,
    ROSTER_CSV_COACH_STAYS,
    ROSTER_CSV_COACH_HOW,
    ROSTER_LEAD_COACH,
    ROSTER_LEAD_PRO,
  ].join('\n');
}

function assertCoachToolOrder(text: string, rosterLabel = 'Competitor Roster') {
  const lesson = text.indexOf('Daily Lesson Plan');
  const videos = text.indexOf('Daily Training Videos');
  const mock = text.indexOf('Mock Tournament');
  const roster = text.indexOf(rosterLabel);
  assert.ok(lesson >= 0 && videos > lesson && mock > videos && roster > mock);
}

test('Coach teasers list the four hub tools in lesson, videos, mock, roster order', () => {
  assert.equal(COMPETITOR_ROSTER_LABEL, 'Competitor Roster');
  assert.equal(TRAINING_NOTES_LABEL, 'Daily Lesson Plan');
  assert.equal(TECHNIQUE_TREE_LABEL, 'Technique Tree');
  assert.match(TECHNIQUE_TREE_LEAD, /One tree on this phone/);
  assert.match(COACH_HUB_BLURB, /Technique Tree/);
  assert.match(COACH_AD_LEAD, /Technique Tree/);
  assert.equal(
    COACH_TOOLS_TEASER,
    'Daily Lesson Plan, Daily Training Videos, Mock Tournament, Competitor Roster.',
  );
  assertCoachToolOrder(COACH_TOOLS_TEASER);
  assertCoachToolOrder(COACH_HOME_TEASER, 'Roster');
  assert.ok(COACH_HOME_TEASER.length < 70);
  assert.match(COACH_AD_LEAD, /^Coach tools:/);
  assertCoachToolOrder(COACH_AD_LEAD);
  assertCoachToolOrder(COACH_HUB_BLURB);
  assert.doesNotMatch(COACH_AD_LEAD, /Daily Techniques/);
  assert.doesNotMatch(COACH_HUB_BLURB, /Competitor Management/);
});

test('Coach roster lead and CSV help stay on this phone', () => {
  assert.equal(
    ROSTER_LEAD_COACH,
    'Competitor Roster with Names and Ranks for Single Matches and Mock Tournaments.',
  );
  assert.equal(ROSTER_CSV_ABOUT, 'About CSV');
  const help = `${ROSTER_CSV_COACH_STAYS}\n${ROSTER_CSV_COACH_HOW}`;
  assert.match(help, /stays on this phone/);
  assert.match(help, /back it up or move it to another device/);
  assert.match(help, /Download the template/);
  assert.match(help, /does not wipe anyone already here/);
  assert.match(help, /Export saves a copy/);
  assert.doesNotMatch(help, /cloud/i);
  assert.doesNotMatch(ROSTER_LEAD_COACH, /Competitor Management/);
});

test('Coach empty states stay friendly and skip student progress', () => {
  const text = allCopy();
  assert.match(text, /No competitors yet/);
  assert.match(text, /No notes yet/);
  assert.match(text, /No clips yet/);
  assert.match(text, /Add video opens Record or Pick from gallery/);
  assert.match(text, /Empty bracket/);
  assert.match(text, /2:30/);
  assert.match(text, /5:00/);
  assert.match(text, /7:00/);
  assert.doesNotMatch(text, /\bstudents?\b/i);
  assert.doesNotMatch(text, /progress/i);
  assert.doesNotMatch(text, /GB Members/i);
  assert.doesNotMatch(text, /membership/i);
});
