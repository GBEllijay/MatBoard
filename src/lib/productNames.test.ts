import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { rankSeatDoor } from './ownerPassRank.ts';
import type { EntitlementClaims } from './entitlementToken.ts';
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
  INSTRUCTOR_DRIVE_REQUIREMENT,
  PRO_PLUS_CLOUD_BELT_BLURB,
  PRO_PLUS_CLOUD_DESCRIPTION,
  PRO_PLUS_CLOUD_NAME,
  PRO_PLUS_CLOUD_PATH,
  ADVANTAGE_CLOUD_DRIVE_NOTE,
  ADVANTAGE_CLOUD_HEADING,
  COACH_HOME_DESCRIPTION,
  STUDENT_EDITION_NAME,
  STUDENT_HOME_DESCRIPTION,
  WHITE_HOME_DESCRIPTION,
  WHITE_LADDER_DETAIL,
  coachDoorOpen,
  coachToolsOpen,
  coachUnlimitedDoorOpen,
  isBasicCoach,
  isCoachStudentRoster,
  isPlainCoachTournament,
  MEDIA_CONSOLE_ROUTES,
  MEDIA_FOLDER_ROUTES,
  consoleHubs,
  homeConsoleLabel,
  closedDoorPath,
  mediaConsoleDoorOpen,
  mediaFolderDoorOpen,
  ownerProHubOpen,
  proDoorOpen,
  visibleMediaSurfaces,
  visibleProHubs,
  parentToolboxPath,
  COACH_UNLIMITED_PATH,
  COACH_UNLIMITED_TOOLS,
  COMPETITOR_ROSTER_PATH,
  coachingToolsMenu,
  COMPETITOR_SYSTEM_NAME,
  INSTRUCTOR_COLLAB_HUB_LABEL,
  INSTRUCTOR_COLLAB_NAME,
  INSTRUCTOR_COACH_ENTRY,
  PRO_INSTRUCTOR_HUB_LABEL,
  UNLIMITED_LESSON_PATH,
  MATCH_CONTROLLER_PATH,
  MEDIA_CONSOLE_INSTRUCTIONS,
  MEDIA_CONSOLE_NAME,
  COACH_HUBS,
  COACHING_TOOLS_DETAIL,
  COACHING_TOOLS_LABEL,
  COACHING_TOOLS_LEAD,
  COACHING_TOOLS_MENU,
  COACHING_TOOLS_PATH,
  COMPETITION_MANAGEMENT_LABEL,
  COMPETITION_MANAGEMENT_PRO_LABEL,
  TOURNAMENT_MANAGEMENT_PRO_LABEL,
  TOURNAMENT_MANAGEMENT_PRO_LEAD,
  COMPETITION_MENU,
  COMPETITION_MENU_PRO,
  COMPETITION_PRO_MENU,
  PRO_HUBS,
  ROUND_CONTROLLER_PATH,
  TOURNAMENT_SOFTWARE_NAME,
  TOURNAMENT_SUITE_NAME,
  techniquesPageEyebrow,
  techniquesParentPath,
  sharedToolBackPath,
  carryHubFrom,
  COACH_NOTES_PATH,
  COACH_VIDEOS_PATH,
  COACH_TREE_PATH,
  UNLIMITED_VIDEOS_PATH,
  UNLIMITED_TREE_PATH,
  UNLIMITED_ROSTER_PATH,
  toolEyebrow,
  tournamentToolLabel,
  withHubFrom,
  withSuiteFrom,
} from './productNames.ts';

test('Console name uses the exact Instructor apostrophe', () => {
  assert.equal(GYM_CONSOLE_NAME, "Gym Owner and Instructor's Console");
  assert.doesNotMatch(GYM_CONSOLE_NAME, /Owner.?s Toolbox/i);
  assert.doesNotMatch(GYM_CONSOLE_NAME, /Owners Toolbox/i);
});

test('Home motto stays Win by Advantage', () => {
  assert.equal(HOME_MOTTO, 'Win by Advantage');
});

test('Home ladder details keep White meaning and a plain Pro subtitle', () => {
  assert.equal(WHITE_LADDER_DETAIL, 'BJJ scoreboard and timer, live match and rounds');
  assert.equal(
    WHITE_HOME_DESCRIPTION,
    'Live BJJ scoreboard and customizable round timer. Cast the display to a TV and keep the controller on your phone.',
  );
  assert.equal(
    COACH_HOME_DESCRIPTION,
    'Downloadable daily lesson plans, training videos, and a technique tree. Includes everything in Media, Student and White.',
  );
  assert.doesNotMatch(WHITE_HOME_DESCRIPTION, /White —/);
  assert.match(COACH_HOME_DESCRIPTION, /^Downloadable daily lesson plans/);
  assert.match(COACH_HOME_DESCRIPTION, /technique tree/);
  assert.match(COACH_HOME_DESCRIPTION, /everything in Media, Student and White/);
  assert.doesNotMatch(WHITE_HOME_DESCRIPTION, /student/i);
  assert.doesNotMatch(COACH_HOME_DESCRIPTION, /competitor roster/i);
  assert.equal(STUDENT_EDITION_NAME, 'Advantage – Student Edition');
  assert.equal(
    STUDENT_HOME_DESCRIPTION,
    'A personal BJJ training journal with rank and stripes, fundamentals proficiency, and competitor prep.',
  );
  assert.equal(STUDENT_HOME_DESCRIPTION.includes('\n'), false);
  assert.equal(COACH_HOME_DESCRIPTION.includes('\n'), false);
  assert.match(STUDENT_HOME_DESCRIPTION, /journal/i);
  assert.match(STUDENT_HOME_DESCRIPTION, /rank and stripes/);
  assert.match(STUDENT_HOME_DESCRIPTION, /fundamentals/);
  assert.match(STUDENT_HOME_DESCRIPTION, /competitor prep/);
  assert.equal(PRO_LADDER_DETAIL, 'Gym Owner and Instructors Console');
  assert.doesNotMatch(PRO_LADDER_DETAIL, /for this gym/i);
  assert.doesNotMatch(PRO_LADDER_DETAIL, /'/);
});

test('Media Console is the Pro cast hub, with phone-readable instructions', () => {
  assert.equal(MEDIA_CONSOLE_NAME, 'Media Console');
  assert.ok(MEDIA_CONSOLE_INSTRUCTIONS.length >= 4);
  assert.match(MEDIA_CONSOLE_INSTRUCTIONS[0], /Gold On/);
  assert.match(MEDIA_CONSOLE_INSTRUCTIONS[0], /plays on the TV/);
  assert.match(MEDIA_CONSOLE_INSTRUCTIONS.join('\n'), /after Gallery, before Pro Shop/);
  assert.match(MEDIA_CONSOLE_INSTRUCTIONS.join('\n'), /CSV backup/);
  assert.match(MEDIA_CONSOLE_INSTRUCTIONS.join('\n'), /Events: add a photo/);
  assert.match(MEDIA_CONSOLE_INSTRUCTIONS.join('\n'), /Events display/);
  assert.match(MEDIA_CONSOLE_INSTRUCTIONS.join('\n'), /Google Photos or this phone/);
  assert.match(MEDIA_CONSOLE_INSTRUCTIONS.join('\n'), /Google Drive is an extra source/);
  assert.doesNotMatch(MEDIA_CONSOLE_INSTRUCTIONS.join('\n'), /coming soon/i);
  assert.doesNotMatch(MEDIA_CONSOLE_INSTRUCTIONS.join('\n'), /does not join the photo queue/);
  assert.doesNotMatch(MEDIA_CONSOLE_INSTRUCTIONS.join('\n'), /interval below/i);
  for (const line of MEDIA_CONSOLE_INSTRUCTIONS) {
    assert.ok(line.length < 140);
  }
});

test('Pro suite keeps the working title and Coach keeps Mock Tournament', () => {
  assert.equal(TOURNAMENT_SUITE_NAME, 'In-House Tournament Management Suite');
  assert.doesNotMatch(TOURNAMENT_SUITE_NAME, /MatBracket/i);
});

test('Coach hub is Coaching Tools then Competition Team Management', () => {
  assert.equal(COACHING_TOOLS_LABEL, 'Coaching Tools');
  assert.equal(COACHING_TOOLS_PATH, '/coaching-tools');
  assert.equal(COMPETITION_MANAGEMENT_LABEL, 'Competition Team Management');
  assert.equal(
    COACHING_TOOLS_DETAIL,
    'Daily Lesson Plan, Daily Training Videos, and Technique Tree.',
  );
  assert.equal(
    COACHING_TOOLS_LEAD,
    "Write today's class, loop training clips, and build a technique tree.",
  );
  assert.doesNotMatch(`${COACHING_TOOLS_DETAIL}\n${COACHING_TOOLS_LEAD}`, /student/i);
  assert.deepEqual(
    COACH_HUBS.map((hub) => hub.title),
    ['Daily Lesson Plan', 'Daily Training Videos', 'Technique Tree', 'Student Roster', 'Competitor Roster', 'Mock Tournament'],
  );
  assert.deepEqual(
    COACH_HUBS.map((hub) => hub.to),
    [
      '/notes?from=coach',
      '/techniques?from=coach',
      '/technique-tree?from=coach',
      '/roster?from=students',
      '/roster?from=coach',
      '/tournament?from=coach',
    ],
  );
  assert.deepEqual(
    COACH_HUBS.map((hub) => hub.belt),
    ['coach', 'coach', 'coach', 'coach', 'tournament', 'tournament'],
  );
  assert.ok(!COACH_HUBS.some((hub) => hub.title === 'Coaching Tools' || hub.title === COMPETITION_MANAGEMENT_LABEL));
  assert.ok(!COACH_HUBS.some((hub) => /curriculum/i.test(hub.title)));
  assert.deepEqual(
    COACHING_TOOLS_MENU.map((item) => item.title),
    ['Daily Lesson Plan', 'Daily Training Videos', 'Technique Tree'],
  );
  assert.deepEqual(
    COACHING_TOOLS_MENU.map((item) => item.to),
    ['/notes?from=coach', '/techniques?from=coach', '/technique-tree?from=coach'],
  );
  assert.deepEqual(
    COACHING_TOOLS_MENU.map((item) => item.belt),
    ['coach', 'coach', 'coach'],
  );
  assert.equal(coachingToolsMenu(false)[0].belt, 'coach');
  assert.equal(coachingToolsMenu(true)[0].belt, 'coach');
  assert.deepEqual(
    coachingToolsMenu(false).map((item) => item.to),
    ['/notes?from=coach', '/techniques?from=coach', '/technique-tree?from=coach'],
  );
  assert.equal(coachingToolsMenu(true)[0].to, UNLIMITED_LESSON_PATH);
  assert.deepEqual(
    coachingToolsMenu(true).slice(1).map((item) => item.to),
    ['/techniques?from=unlimited', '/technique-tree?from=unlimited'],
  );
  assert.deepEqual(
    COMPETITION_MENU.map((item) => item.title),
    ['Competitor Management System', 'Competitor Roster', 'Mock Tournament', 'Scoreboard', 'Round Timer'],
  );
  assert.deepEqual(
    COMPETITION_MENU.map((item) => item.to),
    ['/competitors?from=competition', '/roster?from=competition', '/tournament', '/match/control', '/training'],
  );
  assert.equal(COMPETITION_MENU[3].to, MATCH_CONTROLLER_PATH);
  assert.equal('clearBout' in COMPETITION_MENU[3] && COMPETITION_MENU[3].clearBout, true);
  assert.equal(COMPETITION_MENU[4].to, '/training');
  assert.ok(!COMPETITION_MENU.some((item) => item.to === '/match'));
  assert.ok(!COMPETITION_MENU.some((item) => item.to.startsWith('/training/control')));
  const menuOrder = COMPETITION_MENU.map((item) => item.title);
  assert.ok(menuOrder.indexOf('Competitor Management System') < menuOrder.indexOf('Mock Tournament'));
  assert.ok(menuOrder.indexOf('Mock Tournament') < menuOrder.indexOf('Scoreboard'));
  assert.ok(menuOrder.indexOf('Scoreboard') < menuOrder.indexOf('Round Timer'));
  assert.deepEqual(
    COMPETITION_MENU.map((item) => item.belt),
    ['tournament', 'tournament', 'tournament', 'tournament', 'tournament'],
  );
  assert.equal(COMPETITION_MENU_PRO.length, 0);
  assert.doesNotMatch(COMPETITION_MANAGEMENT_LABEL, /student|GB Members|Coming Soon/i);
});

test('Pro console hubs stay four siblings, Media Console first', () => {
  assert.equal(COMPETITOR_SYSTEM_NAME, 'Competitor Management System');
  assert.equal(INSTRUCTOR_COLLAB_NAME, 'Instructor Invitation and Access Management');
  assert.equal(
    INSTRUCTOR_COLLAB_HUB_LABEL,
    'Instructor Invitation and Access Management',
  );
  assert.equal(
    INSTRUCTOR_COACH_ENTRY,
    'Advantage Coach Unlimited',
  );
  assert.equal(COACH_UNLIMITED_PATH, '/coach-unlimited');
  assert.equal(UNLIMITED_LESSON_PATH, '/notes?plan=unlimited');
  assert.equal(COMPETITOR_ROSTER_PATH, '/roster?from=competitors');
  assert.deepEqual(
    COACH_UNLIMITED_TOOLS.map((tool) => tool.title),
    ['Daily Lesson Plan', 'Daily Training Videos', 'Technique Tree', 'Student Roster', 'Scoreboard', 'Round Timer'],
  );
  assert.equal(COACH_UNLIMITED_TOOLS[4].to, withHubFrom(MATCH_CONTROLLER_PATH, 'unlimited'));
  assert.equal(COACH_UNLIMITED_TOOLS[5].to, withHubFrom(ROUND_CONTROLLER_PATH, 'unlimited'));
  assert.equal(COACH_UNLIMITED_TOOLS[4].belt, 'black');
  assert.equal(COACH_UNLIMITED_TOOLS[5].belt, 'black');
  assert.equal(COACH_UNLIMITED_TOOLS[4].clearBout, true);
  assert.equal(COACH_UNLIMITED_TOOLS[3].title, 'Student Roster');
  assert.equal(COACH_UNLIMITED_TOOLS[0].to, UNLIMITED_LESSON_PATH);
  assert.equal(COACH_UNLIMITED_TOOLS[1].to, UNLIMITED_VIDEOS_PATH);
  assert.equal(COACH_UNLIMITED_TOOLS[2].to, UNLIMITED_TREE_PATH);
  assert.deepEqual(
    COACH_UNLIMITED_TOOLS.map((tool) => tool.belt),
    ['brown', 'brown', 'brown', 'brown', 'black', 'black'],
  );
  assert.deepEqual(
    COACH_UNLIMITED_TOOLS.map((tool) => ('stripes' in tool ? tool.stripes : null)),
    [0, 1, 2, 3, null, null],
  );
  assert.equal(COACH_UNLIMITED_TOOLS[3].to, '/student-roster');
  assert.equal(isCoachStudentRoster('/student-roster', null), true);
  assert.equal(isCoachStudentRoster('/roster', 'students'), true);
  assert.equal(isCoachStudentRoster('/roster', 'competitors'), false);
  assert.equal(isCoachStudentRoster('/roster', 'unlimited'), false);
  assert.equal(isCoachStudentRoster('/roster', 'coach'), false);
  assert.equal(UNLIMITED_ROSTER_PATH, '/roster?from=unlimited');
  assert.notEqual(COACH_UNLIMITED_TOOLS[3].to, COMPETITOR_ROSTER_PATH);
  assert.equal(COACH_UNLIMITED_TOOLS[3].belt, 'brown');
  assert.ok(!COACH_UNLIMITED_TOOLS.some((tool) => /curriculum/i.test(tool.title) || tool.to.includes('competition-curriculum')));
  assert.ok(!COACH_UNLIMITED_TOOLS.some((tool) => tool.to.startsWith('/coaching-tools')));
  assert.deepEqual(
    PRO_HUBS.map((hub) => hub.title),
    [MEDIA_CONSOLE_NAME, PRO_INSTRUCTOR_HUB_LABEL, INSTRUCTOR_COLLAB_HUB_LABEL, TOURNAMENT_MANAGEMENT_PRO_LABEL],
  );
  // Pro's list reads Instructor Edition; the Coach Unlimited screen keeps its own name and route.
  assert.equal(PRO_INSTRUCTOR_HUB_LABEL, 'Advantage Instructor Edition');
  assert.equal(PRO_HUBS[1].title, 'Advantage Instructor Edition');
  assert.equal(PRO_HUBS[1].to, '/coach-unlimited');
  assert.ok(!PRO_HUBS.some((hub) => /Coach Unlimited/.test(hub.title)));
  assert.deepEqual(
    PRO_HUBS.map((hub) => hub.to),
    ['/slideshow?folder=gallery', '/coach-unlimited', '/instructors', '/suite'],
  );
  assert.ok(!PRO_HUBS.some((hub) => hub.title === COMPETITOR_SYSTEM_NAME));
  assert.deepEqual(
    PRO_HUBS.map((hub) => hub.belt),
    ['purple', 'brown', 'black', 'tournament'],
  );
  assert.equal(MATCH_CONTROLLER_PATH, '/match/control');
  assert.equal(ROUND_CONTROLLER_PATH, '/training/control');
  assert.equal(TOURNAMENT_MANAGEMENT_PRO_LABEL, 'Competition and Tournament Management');
  assert.equal(PRO_HUBS[3].title, 'Competition and Tournament Management');
  assert.equal(COMPETITION_MANAGEMENT_PRO_LABEL, 'Competition Management Pro');
  assert.equal(
    TOURNAMENT_MANAGEMENT_PRO_LEAD,
    'Pro Version of Tournament Brackets, Scoreboard and Round Timer - Additional Skins and Animations Included. Rankings stay in Competitor Management System.',
  );
  assert.doesNotMatch(TOURNAMENT_MANAGEMENT_PRO_LEAD, /roster/i);
  assert.deepEqual(
    COMPETITION_PRO_MENU.map((item) => item.title),
    ['Brackets-Tournament Software', 'Competitor Management System', 'Competitor Roster', 'Scoreboard', 'Round Timer'],
  );
  assert.equal(COMPETITION_PRO_MENU[2].to, '/roster?from=suite');
  assert.notEqual(COMPETITION_PRO_MENU[1].to, COMPETITION_PRO_MENU[2].to);
  assert.deepEqual(
    COMPETITION_PRO_MENU.map((item) => item.to),
    [
      withSuiteFrom('/tournament', true),
      withSuiteFrom('/competitors', true),
      withSuiteFrom('/roster', true),
      withSuiteFrom(MATCH_CONTROLLER_PATH, true),
      withSuiteFrom(ROUND_CONTROLLER_PATH, true),
    ],
  );
  assert.equal(COMPETITION_PRO_MENU[0].to, withSuiteFrom('/tournament', true));
  assert.equal(COMPETITION_PRO_MENU[1].to, '/competitors?from=suite');
  assert.deepEqual(
    COMPETITION_PRO_MENU.map((item) => item.belt),
    ['tournament', 'tournament', 'tournament', 'black', 'black'],
  );
  assert.deepEqual(
    COMPETITION_PRO_MENU.map((item) => item.clearBout),
    [false, false, false, true, false],
  );
});

test('Suite origin stays on Suite links and leaves other paths alone', () => {
  assert.equal(withSuiteFrom('/match', false), '/match');
  assert.equal(withSuiteFrom('/training/control', false), '/training/control');
  assert.equal(withSuiteFrom('/match', true), '/match?from=suite');
  assert.equal(withSuiteFrom('/match/control?focus=round', true), '/match/control?focus=round&from=suite');
  assert.equal(withSuiteFrom('/match?bout=final-0', true), '/match?bout=final-0&from=suite');
  assert.equal(withSuiteFrom('/training?from=suite', true), '/training?from=suite');
  assert.equal(withHubFrom('/match?bout=sf-0', null), '/match?bout=sf-0');
  assert.equal(withHubFrom('/match?bout=sf-0', 'suite'), '/match?bout=sf-0&from=suite');
  assert.equal(withHubFrom('/tournament', 'unlimited'), '/tournament?from=unlimited');
  assert.equal(withHubFrom('/match?bout=sf-0&kids=ocean', 'unlimited'), '/match?bout=sf-0&kids=ocean&from=unlimited');
});

test('Owner tournament tool is Tournament Software; Coach keeps Mock Tournament', () => {
  assert.equal(TOURNAMENT_SOFTWARE_NAME, 'Tournament Software');
  assert.equal(MOCK_TOURNAMENT_NAME, 'Mock Tournament');
  assert.equal(tournamentToolLabel(true), TOURNAMENT_SOFTWARE_NAME);
  assert.equal(tournamentToolLabel(false), MOCK_TOURNAMENT_NAME);
});

test('Home Pro card describes the console without a Coming Soon line', () => {
  assert.deepEqual(PRO_HOME_LINES, [
    'Academy management with a shared drive, events, pro shop, and gallery, plus instructor collaboration and student seats. Includes all Advantage products.',
  ]);
  const home = PRO_HOME_LINES.join('\n');
  assert.match(home, /shared drive/);
  assert.match(home, /instructor collaboration/);
  assert.match(home, /student seats/);
  assert.match(home, /Includes all Advantage products\./);
  assert.doesNotMatch(home, /Coming Soon/);
  assert.doesNotMatch(PRO_HOME_LINES[0], /^Pro\b/);
  assert.equal(PRO_HOME_DETAIL, `${GYM_CONSOLE_NAME} — Coming Soon`);
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
  assert.doesNotMatch(home, /Coming Soon/);
});

test('Pro unlock includes Coach tools and Coach-only unlock still stands alone', () => {
  assert.equal(coachToolsOpen(true, false), true);
  assert.equal(coachToolsOpen(true, true), true);
  assert.equal(coachToolsOpen(false, true), true);
  assert.equal(coachToolsOpen(false, false), false);
  assert.equal(isBasicCoach(false, true), true);
  assert.equal(isBasicCoach(true, true), false);
  assert.equal(isBasicCoach(true, false), false);
  assert.equal(isBasicCoach(false, false), false);
  assert.equal(isPlainCoachTournament('coach', false), true);
  assert.equal(isPlainCoachTournament('coach', true), true);
  assert.equal(isPlainCoachTournament(null, true), true);
  assert.equal(isPlainCoachTournament('suite', true), false);
  assert.equal(isPlainCoachTournament('suite', false), false);
  assert.equal(isPlainCoachTournament(null, false), false);
  assert.equal(isPlainCoachTournament('unlimited', false), false);
  assert.equal(isPlainCoachTournament('unlimited', true), true);
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
  assert.equal(parentToolboxPath(false, false), '/products');
  assert.equal(toolEyebrow(true, false), GYM_CONSOLE_NAME);
  assert.equal(toolEyebrow(false, true), 'Advantage Coach');
});

test('a live seat opens Coach and leaves the owner Pro hubs closed', () => {
  assert.equal(coachDoorOpen(false, false, true), true);
  assert.equal(coachDoorOpen(false, false, false), false);
  assert.equal(coachDoorOpen(false, true, false), true);
  assert.equal(coachDoorOpen(true, false, false), true);
  assert.equal(proDoorOpen(false), false);
  assert.equal(proDoorOpen(true), true);
  assert.equal(ownerProHubOpen(true, false), true);
  assert.equal(ownerProHubOpen(true, true), false);
  assert.equal(ownerProHubOpen(false, false), false);
  assert.equal(parentToolboxPath(false, false, true), '/coach');
  assert.equal(parentToolboxPath(true, false, true), '/pro');
  assert.equal(parentToolboxPath(false, false, true, true), '/pro');
  assert.equal(toolEyebrow(false, false, true), 'Advantage Coach');
  assert.equal(toolEyebrow(true, false, true), GYM_CONSOLE_NAME);
  assert.equal(coachToolsOpen(false, false), false);
});

test('shared tools return to the hub that opened them', () => {
  assert.equal(COACH_NOTES_PATH, '/notes?from=coach');
  assert.equal(COACH_VIDEOS_PATH, '/techniques?from=coach');
  assert.equal(COACH_TREE_PATH, '/technique-tree?from=coach');
  assert.equal(UNLIMITED_VIDEOS_PATH, '/techniques?from=unlimited');
  assert.equal(UNLIMITED_TREE_PATH, '/technique-tree?from=unlimited');

  assert.equal(sharedToolBackPath({ from: 'coach', fallback: '/pro' }), '/coach');
  assert.equal(sharedToolBackPath({ from: 'coach', unlimited: true, fallback: '/pro' }), '/coach');
  assert.equal(sharedToolBackPath({ from: 'unlimited', fallback: '/pro' }), '/coach-unlimited');
  assert.equal(sharedToolBackPath({ from: null, unlimited: true, fallback: '/pro' }), '/coach-unlimited');
  assert.equal(sharedToolBackPath({ from: null, fallback: '/pro' }), '/pro');
  assert.equal(sharedToolBackPath({ from: 'suite', fallback: '/pro' }), '/pro');
  assert.equal(sharedToolBackPath({ from: null, unlimited: false, fallback: '/coach' }), '/coach');
  assert.equal(sharedToolBackPath({ from: '', fallback: '/pro' }), '/pro');

  assert.equal(carryHubFrom('/techniques', '?from=coach'), '/techniques?from=coach');
  assert.equal(carryHubFrom('/techniques', 'from=coach'), '/techniques?from=coach');
  assert.equal(carryHubFrom('/technique-tree?tree=a', '?from=coach'), '/technique-tree?tree=a&from=coach');
  assert.equal(carryHubFrom('/techniques?focus=1&section=warmup', '?plan=unlimited'), '/techniques?focus=1&section=warmup&from=unlimited');
  assert.equal(carryHubFrom('/notes', '?from=unlimited'), '/notes?plan=unlimited&from=unlimited');
  assert.equal(carryHubFrom('/notes', '?plan=unlimited'), '/notes?plan=unlimited&from=unlimited');
  assert.equal(carryHubFrom('/techniques?from=coach', '?from=unlimited'), '/techniques?from=coach');
  assert.equal(carryHubFrom('/techniques', ''), '/techniques');
  assert.equal(carryHubFrom('/tournament?from=suite', '?from=coach'), '/tournament?from=suite');
});

test('Daily Training Videos names a seated coach instead of the gym owner console', () => {
  assert.equal(techniquesPageEyebrow(true, false, true), 'Advantage Coach');
  assert.equal(techniquesPageEyebrow(true, false, false), GYM_CONSOLE_NAME);
  assert.equal(techniquesPageEyebrow(false, true, false), 'Advantage Coach');
  assert.equal(techniquesPageEyebrow(false, false, true), 'Advantage Coach');
  assert.equal(techniquesParentPath(true, false, true), '/coach');
  assert.equal(techniquesParentPath(true, false, false), '/pro');
  assert.equal(techniquesParentPath(false, true, false), '/coach');
  assert.doesNotMatch(techniquesPageEyebrow(true, false, true), /Gym Owner/);
});

test('a media grant opens Media Console with Pro locked; a seat without one stays shut', () => {
  const lockedDirector = {
    proUnlocked: false,
    seated: true,
    seatGrantsMedia: true,
    programDirectorSeat: true,
    coachMenus: false,
  };
  const directorMenus = { galleryUpload: true, eventsAccess: true, proShopAccess: true };
  assert.equal(mediaConsoleDoorOpen(lockedDirector), true);
  assert.equal(homeConsoleLabel(lockedDirector), 'Open Media Console');
  assert.deepEqual(
    visibleProHubs(lockedDirector).map((hub) => hub.title),
    [MEDIA_CONSOLE_NAME],
  );
  assert.deepEqual(
    consoleHubs(lockedDirector, directorMenus).map((hub) => hub.to),
    ['/gallery', '/events', '/proshop'],
  );
  assert.equal(mediaFolderDoorOpen(lockedDirector, directorMenus, 'shop'), true);
  assert.equal(coachUnlimitedDoorOpen(lockedDirector), false);

  const lockedAssistant = {
    proUnlocked: false,
    seated: true,
    seatGrantsMedia: false,
    programDirectorSeat: false,
    coachMenus: true,
  };
  assert.equal(mediaConsoleDoorOpen(lockedAssistant), false);
  assert.equal(homeConsoleLabel(lockedAssistant), null);
  assert.deepEqual(visibleProHubs(lockedAssistant), []);
  assert.deepEqual(visibleMediaSurfaces(lockedAssistant, null), []);
  assert.equal(
    mediaFolderDoorOpen(lockedAssistant, { galleryUpload: false, eventsAccess: false, proShopAccess: false }, 'gallery'),
    false,
  );

  const lockedCoachWithGallery = {
    proUnlocked: false,
    seated: true,
    seatGrantsMedia: true,
    programDirectorSeat: false,
    coachMenus: true,
  };
  const galleryOnly = { galleryUpload: true, eventsAccess: false, proShopAccess: false };
  assert.equal(mediaConsoleDoorOpen(lockedCoachWithGallery), true);
  assert.equal(homeConsoleLabel(lockedCoachWithGallery), 'Open Media Console');
  assert.equal(mediaFolderDoorOpen(lockedCoachWithGallery, galleryOnly, 'gallery'), true);
  assert.equal(mediaFolderDoorOpen(lockedCoachWithGallery, galleryOnly, 'events'), false);
  assert.equal(mediaFolderDoorOpen(lockedCoachWithGallery, galleryOnly, 'shop'), false);
  assert.equal(closedDoorPath(true), '/products');
  assert.equal(closedDoorPath(false), '/coming-soon');

  const proAssistant = { ...lockedAssistant, proUnlocked: true };
  assert.equal(mediaConsoleDoorOpen(proAssistant), false);
  assert.equal(coachUnlimitedDoorOpen(proAssistant), true);
  assert.deepEqual(
    visibleProHubs(proAssistant).map((hub) => hub.to),
    [COACH_UNLIMITED_PATH],
  );

  const proDirector = { ...lockedDirector, proUnlocked: true };
  assert.equal(mediaConsoleDoorOpen(proDirector), true);
  assert.equal(homeConsoleLabel(proDirector), 'Open Media Console');
  assert.deepEqual(
    visibleProHubs(proDirector).map((hub) => hub.title),
    [MEDIA_CONSOLE_NAME],
  );
  assert.deepEqual(
    consoleHubs(proDirector, directorMenus).map((hub) => hub.title),
    ['Gallery', 'Events', 'Pro Shop'],
  );
  const eventsOnly = { galleryUpload: false, eventsAccess: true, proShopAccess: false };
  assert.deepEqual(
    visibleMediaSurfaces(lockedDirector, eventsOnly).map((surface) => surface.title),
    ['Events'],
  );
  assert.equal(mediaFolderDoorOpen(lockedDirector, eventsOnly, 'gallery'), false);

  const strippedDirector = { ...lockedDirector, seatGrantsMedia: false };
  assert.equal(mediaConsoleDoorOpen(strippedDirector), false);

  const owner = {
    proUnlocked: true,
    seated: false,
    seatGrantsMedia: false,
    programDirectorSeat: false,
    coachMenus: false,
  };
  assert.equal(mediaConsoleDoorOpen(owner), true);
  assert.deepEqual(
    visibleProHubs(owner).map((hub) => hub.title),
    PRO_HUBS.map((hub) => hub.title),
  );
  assert.equal(homeConsoleLabel(owner), 'Open Console');
  assert.deepEqual(
    consoleHubs(owner, null).map((hub) => hub.title),
    PRO_HUBS.map((hub) => hub.title),
  );
  assert.equal(mediaFolderDoorOpen(owner, null, 'events'), true);
  assert.equal(mediaConsoleDoorOpen({ ...owner, proUnlocked: false }), false);
  assert.equal(mediaFolderDoorOpen({ ...owner, proUnlocked: false }, null, 'gallery'), false);
  assert.deepEqual(
    MEDIA_FOLDER_ROUTES.map((route) => route.path),
    ['/gallery', '/events', '/proshop', '/pro-shop'],
  );
  assert.deepEqual([...MEDIA_CONSOLE_ROUTES], ['/media-console', '/console']);
  // /media is the Media Edition screen now, not a /pro alias.
  assert.equal((MEDIA_CONSOLE_ROUTES as readonly string[]).includes('/media'), false);
});

const PRO_BUTTONS = [
  'Media Console',
  'Advantage Instructor Edition',
  'Instructor Invitation and Access Management',
  'Competition and Tournament Management',
] as const;

test('Pro console buttons stay those four labels, in that order, for owner, Pro, and a seat', () => {
  assert.deepEqual(PRO_HUBS.map((hub) => hub.title), [...PRO_BUTTONS]);
  assert.deepEqual(
    PRO_HUBS.map((hub) => hub.belt),
    ['purple', 'brown', 'black', 'tournament'],
  );
  assert.equal(PRO_HUBS[1].to, '/coach-unlimited');
  assert.ok(!PRO_HUBS.some((hub) => hub.title === 'Advantage Coach Unlimited' || hub.title === COMPETITOR_SYSTEM_NAME));

  const menus = { galleryUpload: true, eventsAccess: true, proShopAccess: true };
  const seated = {
    proUnlocked: true,
    seated: true,
    seatGrantsMedia: true,
    programDirectorSeat: false,
    coachMenus: true,
    seat: { id: 'owner-test-seat' },
  };
  const pass = (src: 'owner' | 'code' | 'stripe'): EntitlementClaims =>
    ({
      src,
      tier: src === 'code' ? 'alpha' : src === 'owner' ? 'owner' : 'pro',
      grants: ['white', 'student', 'coach', 'pro', 'media'],
      subs: src === 'stripe' ? { state: 'active' } : undefined,
    }) as EntitlementClaims;

  for (const src of ['owner', 'code', 'stripe'] as const) {
    const ranked = rankSeatDoor(seated, pass(src));
    assert.equal(ranked.seated, false, src);
    assert.deepEqual(
      consoleHubs(ranked, menus).map((hub) => hub.title),
      [...PRO_BUTTONS],
      src,
    );
  }

  const seatOnly = rankSeatDoor(seated, { src: 'seat', tier: 'seat', grants: [], subs: { state: 'locked' } } as EntitlementClaims);
  assert.equal(seatOnly.seated, true);
  const seatTitles = consoleHubs(seatOnly, menus).map((hub) => hub.title);
  assert.deepEqual(seatTitles, ['Gallery', 'Events', 'Pro Shop', 'Advantage Instructor Edition']);
  assert.ok(!seatTitles.includes('Advantage Coach Unlimited'));

  const locked = rankSeatDoor(seated, { ...pass('stripe'), subs: { state: 'locked' } } as EntitlementClaims);
  assert.equal(locked.seated, true);

  const proPage = readFileSync(new URL('../pages/Pro.tsx', import.meta.url), 'utf8');
  const soon = readFileSync(new URL('../components/ComingSoonAd.tsx', import.meta.url), 'utf8');
  assert.match(proPage, /consoleHubs\(door/);
  assert.doesNotMatch(proPage, /Advantage Coach Unlimited/);
  assert.match(soon, /Advantage Instructor Edition/);
  assert.doesNotMatch(soon, /Advantage Coach Unlimited/);
});

test('Pro Plus Cloud copy stays off the Advantage Pro blurb', () => {
  assert.equal(PRO_LADDER_DETAIL, 'Gym Owner and Instructors Console');
  assert.equal(PRO_PLUS_CLOUD_NAME, 'Advantage Pro + Cloud');
  assert.equal(
    PRO_PLUS_CLOUD_DESCRIPTION,
    'Advantage hosted cross-platform communication. Easiest way to use Advantage.',
  );
  assert.equal(
    INSTRUCTOR_DRIVE_REQUIREMENT,
    'Requires gym setup with a third-party drive (Google Drive, OneDrive, or Dropbox). Advantage does not host it.',
  );
  assert.doesNotMatch(PRO_PLUS_CLOUD_DESCRIPTION, /Cloudflare/);
  assert.equal(PRO_PLUS_CLOUD_PATH, '/pro-plus-cloud');
  assert.equal(PRO_PLUS_CLOUD_BELT_BLURB, 'Gym Owner and Instructors Console, with Advantage Cloud.');
  assert.notEqual(PRO_PLUS_CLOUD_BELT_BLURB, PRO_LADDER_DETAIL);
  assert.equal(ADVANTAGE_CLOUD_HEADING, 'Advantage Cloud');
  assert.equal(
    ADVANTAGE_CLOUD_DRIVE_NOTE,
    'This subscription does not need Google Drive or OneDrive. Advantage hosts Advantage Cloud. Advantage App LLC does not host or manage a drive you own yourself.',
  );
  assert.deepEqual(
    PRO_HUBS.map((hub) => hub.title),
    [
      'Media Console',
      'Advantage Instructor Edition',
      'Instructor Invitation and Access Management',
      'Competition and Tournament Management',
    ],
  );
  assert.deepEqual(
    PRO_HUBS.map((hub) => hub.belt),
    ['purple', 'brown', 'black', 'tournament'],
  );
});
