import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COACH_AD_LEAD,
  COACH_HOME_TEASER,
  COACH_HUB_BLURB,
  COACH_TOOLS_TEASER,
  COMPETITOR_ROSTER_LABEL,
  TECHNIQUE_TREE_CAP_NOTE,
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
  COMPETITION_READY_CARD,
  COMPETITION_READY_LABEL,
  COMPETITION_READY_LEAD,
  COMPETITOR_ROSTER_CARD,
  COMPETITOR_ROSTER_DESCRIPTION,
  GAME_PLAN_A,
  GAME_PLAN_B,
  GAME_PLAN_C,
  GAME_PLAN_CARD,
  GAME_PLAN_EMPTY,
  GAME_PLAN_LABEL,
  GAME_PLAN_LEAD,
  GAME_PLAN_OPTIONAL,
  RANKINGS_RESULTS_CARD,
  ROSTER_CSV_DEVICE_NOTE,
  ROSTER_CSV_INSTRUCTIONS,
  ROSTER_CSV_PRO_TEASER,
  ROSTER_LEAD_COACH,
  ROSTER_LEAD_PRO,
  rosterCsvAvailable,
} from './coachCopy.ts';

function allCopy(): string {
  return [
    COMPETITOR_ROSTER_LABEL,
    TRAINING_NOTES_LABEL,
    TECHNIQUE_TREE_LABEL,
    TECHNIQUE_TREE_LEAD,
    TECHNIQUE_TREE_CAP_NOTE,
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
    ROSTER_CSV_PRO_TEASER,
    ROSTER_CSV_DEVICE_NOTE,
    ROSTER_CSV_INSTRUCTIONS,
    ROSTER_LEAD_COACH,
    ROSTER_LEAD_PRO,
    COMPETITOR_ROSTER_DESCRIPTION,
    COMPETITOR_ROSTER_CARD,
    RANKINGS_RESULTS_CARD,
    COMPETITION_READY_LABEL,
    COMPETITION_READY_CARD,
    COMPETITION_READY_LEAD,
    GAME_PLAN_LABEL,
    GAME_PLAN_CARD,
    GAME_PLAN_LEAD,
    GAME_PLAN_OPTIONAL,
    GAME_PLAN_EMPTY,
    GAME_PLAN_A,
    GAME_PLAN_B,
    GAME_PLAN_C,
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
  assert.match(TECHNIQUE_TREE_LEAD, /Trees stay on this phone/);
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

test('Competitor Roster copy names bout competitors and skips franchise disclaimers', () => {
  assert.equal(
    COMPETITOR_ROSTER_DESCRIPTION,
    'Competitor Roster is the list of bout competitors for matches and brackets.',
  );
  assert.equal(
    COMPETITOR_ROSTER_CARD,
    'Easily create and maintain a list of competitor names, rankings and results for easy loading into tournament brackets and matches.',
  );
  assert.equal(
    RANKINGS_RESULTS_CARD,
    'Save and catalogue your tournament results. Keeps names, dates, divisions, placements, and win records for ranking calculations. Full auto-bracketing and seeding coming soon.',
  );
  assert.equal(
    ROSTER_LEAD_PRO,
    'Save competitor names, belts, divisions, and notes for matches and in-house tournaments. CSV backup available.',
  );
  assert.doesNotMatch(ROSTER_LEAD_PRO, /this browser|Data stays|UTF-8|accent/i);
  assert.doesNotMatch(ROSTER_LEAD_PRO, /Bout competitors on this device/i);
  const rosterCopy = [COMPETITOR_ROSTER_DESCRIPTION, COMPETITOR_ROSTER_CARD, ROSTER_LEAD_PRO].join('\n');
  assert.doesNotMatch(rosterCopy, /GB Members|Gracie\s*Barra|student management/i);
  assert.equal(COMPETITION_READY_LABEL, 'Competition Ready');
  assert.equal(
    COMPETITION_READY_CARD,
    'A weekend checklist for each competitor. Medical forms, gi, division, travel, waiver, and weigh-in stay on this device.',
  );
  assert.match(COMPETITION_READY_LEAD, /Gold On is done/);
  assert.doesNotMatch(
    `${COMPETITION_READY_LABEL}\n${COMPETITION_READY_CARD}\n${COMPETITION_READY_LEAD}`,
    /GB Members|Gracie\s*Barra|student management|\bstudents?\b/i,
  );
});

test('Game Plan copy keeps a note optional and stays on bout competitors', () => {
  assert.equal(GAME_PLAN_LABEL, 'Competitor Game Plan');
  assert.equal(GAME_PLAN_A, 'A Game');
  assert.equal(GAME_PLAN_B, 'B Game');
  assert.equal(GAME_PLAN_C, 'C Game');
  assert.match(GAME_PLAN_CARD, /A Game, B Game, and C Game/);
  assert.match(GAME_PLAN_CARD, /optional/i);
  assert.match(GAME_PLAN_LEAD, /optional/i);
  assert.match(GAME_PLAN_LEAD, /stand alone/);
  assert.match(GAME_PLAN_OPTIONAL, /does not need/);
  assert.doesNotMatch(
    [GAME_PLAN_LABEL, GAME_PLAN_CARD, GAME_PLAN_LEAD, GAME_PLAN_OPTIONAL, GAME_PLAN_EMPTY, GAME_PLAN_A, GAME_PLAN_B, GAME_PLAN_C].join('\n'),
    /required|GB Members|student|everything works|fallback|desperation|surprise/i,
  );
});

test('Coach roster lead points CSV at Pro and keeps manual roster language', () => {
  assert.equal(
    ROSTER_LEAD_COACH,
    'Competitor Roster with Names and Ranks for Single Matches and Mock Tournaments.',
  );
  assert.equal(ROSTER_CSV_PRO_TEASER, 'Importable CSV Template Available in Advantage Pro');
  assert.doesNotMatch(ROSTER_CSV_PRO_TEASER, /About CSV|Download the template|Import CSV|Export CSV/i);
  assert.doesNotMatch(ROSTER_LEAD_COACH, /Competitor Management/);
  assert.equal(rosterCsvAvailable(true, false), true);
  assert.equal(rosterCsvAvailable(true, true), false);
  assert.equal(rosterCsvAvailable(false, true), false);
  assert.equal(rosterCsvAvailable(false, false), false);
  assert.equal(
    ROSTER_CSV_DEVICE_NOTE,
    'The roster stays on this device. CSV is for backup or a move.',
  );
  assert.equal(
    ROSTER_CSV_INSTRUCTIONS,
    'Each row needs a competitor name and a belt. A row missing either one is left out. Division, known injuries, and Check In are optional.',
  );
  assert.doesNotMatch(`${ROSTER_CSV_DEVICE_NOTE}\n${ROSTER_CSV_INSTRUCTIONS}`, /UTF-8|accent/i);
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
