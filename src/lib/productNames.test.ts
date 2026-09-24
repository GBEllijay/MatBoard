import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SITE_ALPHA_LINE,
  SITE_FEEDBACK_EMAIL,
  SITE_FEEDBACK_LEAD,
  SITE_OWNER_LINE,
} from './siteFooter.ts';
import {
  GYM_CONSOLE_NAME,
  MOCK_TOURNAMENT_NAME,
  PRO_COMING_SOON_LINES,
  HOME_MOTTO,
  PRO_HOME_DETAIL,
  PRO_HOME_LINES,
  PRO_LADDER_DETAIL,
  WHITE_LADDER_DETAIL,
  coachToolsOpen,
  parentToolboxPath,
  COMPETITOR_SYSTEM_NAME,
  INSTRUCTOR_COLLAB_NAME,
  MATCH_CONTROLLER_PATH,
  MEDIA_CONSOLE_INSTRUCTIONS,
  MEDIA_CONSOLE_NAME,
  PRO_HUBS,
  ROUND_CONTROLLER_PATH,
  TOURNAMENT_SOFTWARE_NAME,
  TOURNAMENT_SUITE_NAME,
  toolEyebrow,
  tournamentToolLabel,
} from './productNames.ts';

test('Console name uses the exact Instructor apostrophe', () => {
  assert.equal(GYM_CONSOLE_NAME, "Gym Owner and Instructor's Console");
  assert.doesNotMatch(GYM_CONSOLE_NAME, /Owner.?s Toolbox/i);
  assert.doesNotMatch(GYM_CONSOLE_NAME, /Owners Toolbox/i);
});

test('Home motto stays a quiet line under the Advantage title', () => {
  assert.equal(HOME_MOTTO, 'Win by Advantage');
});

test('Home ladder details keep White meaning and a plain Pro subtitle', () => {
  assert.equal(WHITE_LADDER_DETAIL, 'BJJ scoreboard and timer, live match and rounds');
  assert.equal(PRO_LADDER_DETAIL, 'Gym Owner and Instructors Console');
  assert.doesNotMatch(PRO_LADDER_DETAIL, /for this gym/i);
  assert.doesNotMatch(PRO_LADDER_DETAIL, /'/);
});

test('Media Console is the Pro cast hub, with phone-readable instructions', () => {
  assert.equal(MEDIA_CONSOLE_NAME, 'Media Console');
  assert.ok(MEDIA_CONSOLE_INSTRUCTIONS.length >= 4);
  assert.match(MEDIA_CONSOLE_INSTRUCTIONS[0], /Gold On/);
  assert.match(MEDIA_CONSOLE_INSTRUCTIONS[0], /plays on the TV/);
  assert.match(MEDIA_CONSOLE_INSTRUCTIONS.join('\n'), /Class Schedule opens the gym-TV board/);
  assert.doesNotMatch(MEDIA_CONSOLE_INSTRUCTIONS.join('\n'), /interval below/i);
  for (const line of MEDIA_CONSOLE_INSTRUCTIONS) {
    assert.ok(line.length < 140);
  }
});

test('Pro suite keeps the working title and Coach keeps Mock Tournament', () => {
  assert.equal(TOURNAMENT_SUITE_NAME, 'In-House Tournament Management Suite');
  assert.doesNotMatch(TOURNAMENT_SUITE_NAME, /MatBracket/i);
});

test('Pro console hubs stay four siblings, Media Console first', () => {
  assert.equal(COMPETITOR_SYSTEM_NAME, 'Competitor Management System');
  assert.equal(INSTRUCTOR_COLLAB_NAME, 'Instructor Collaboration and Cloud Access');
  assert.deepEqual(
    PRO_HUBS.map((hub) => hub.title),
    [MEDIA_CONSOLE_NAME, TOURNAMENT_SUITE_NAME, COMPETITOR_SYSTEM_NAME, INSTRUCTOR_COLLAB_NAME],
  );
  assert.deepEqual(
    PRO_HUBS.map((hub) => hub.to),
    ['/slideshow?folder=gallery', '/suite', '/competitors', '/instructors'],
  );
  assert.equal(MATCH_CONTROLLER_PATH, '/match/control');
  assert.equal(ROUND_CONTROLLER_PATH, '/training/control');
});

test('Owner tournament tool is Tournament Software; Coach keeps Mock Tournament', () => {
  assert.equal(TOURNAMENT_SOFTWARE_NAME, 'Tournament Software');
  assert.equal(MOCK_TOURNAMENT_NAME, 'Mock Tournament');
  assert.equal(tournamentToolLabel(true), TOURNAMENT_SOFTWARE_NAME);
  assert.equal(tournamentToolLabel(false), MOCK_TOURNAMENT_NAME);
});

test('Home Pro card shows the Coming Soon teaser with the Instructor apostrophe', () => {
  assert.equal(PRO_HOME_DETAIL, `${GYM_CONSOLE_NAME} — Coming Soon`);
  assert.match(PRO_HOME_DETAIL, /Instructor's Console — Coming Soon/);
  assert.deepEqual(PRO_HOME_LINES, [
    'Easily Cast Class Schedules, Events, Recent Promotions, Pro Shop Inventory, and More to your Gym TV.',
    'Full In-House Tournament Management Suite.',
    'Assignable Instructor Licenses and Much More!',
  ]);
  assert.equal(PRO_HOME_LINES.length, 3);
  assert.ok(PRO_HOME_LINES.join(' ').length < PRO_COMING_SOON_LINES.join(' ').length);
});

test('Coming Soon keeps the longer Pro appetite copy off the home card', () => {
  assert.deepEqual(PRO_COMING_SOON_LINES, [
    'Easily Cast to your Gym TV with Media Console: Class Schedules, Recent Promotions, ProShop Inventory, Upcoming Events and Competitions.',
    'Full In-House Tournament Management Suite with Auto-Fill Bracketing and Result Tracking.',
    'Assignable Instructor Licenses with Cross Platform Access to Updates, Shared Training Videos and More.',
  ]);
  const home = PRO_HOME_LINES.join('\n');
  assert.doesNotMatch(home, /Auto-Fill Bracketing/);
  assert.doesNotMatch(home, /Shared Training Videos/);
  assert.doesNotMatch(home, /ProShop Inventory/);
});

test('Pro unlock includes Coach tools and Coach-only unlock still stands alone', () => {
  assert.equal(coachToolsOpen(true, false), true);
  assert.equal(coachToolsOpen(true, true), true);
  assert.equal(coachToolsOpen(false, true), true);
  assert.equal(coachToolsOpen(false, false), false);
});

test('Footer states ownership, alpha testing, and the feedback email only', () => {
  const footer = [SITE_OWNER_LINE, SITE_ALPHA_LINE, SITE_FEEDBACK_LEAD, SITE_FEEDBACK_EMAIL].join('\n');
  assert.match(SITE_OWNER_LINE, /property of Advantage App, LLC/);
  assert.match(SITE_ALPHA_LINE, /still in Alpha Testing/);
  assert.match(SITE_FEEDBACK_LEAD, /Feedback is appreciated and encouraged/);
  assert.equal(SITE_FEEDBACK_EMAIL, 'advantageappllc@gmail.com');
  assert.doesNotMatch(footer, /trademark|patent|\bEIN\b|registered/i);
});

test('Shared tools prefer Pro console, then Coach', () => {
  assert.equal(parentToolboxPath(true, true), '/pro');
  assert.equal(parentToolboxPath(true, false), '/pro');
  assert.equal(parentToolboxPath(false, true), '/coach');
  assert.equal(parentToolboxPath(false, false), '/');
  assert.equal(toolEyebrow(true, false), GYM_CONSOLE_NAME);
  assert.equal(toolEyebrow(false, true), 'Advantage Coach');
});
