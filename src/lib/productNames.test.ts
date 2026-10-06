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
  COACH_HOME_DESCRIPTION,
  WHITE_HOME_DESCRIPTION,
  WHITE_LADDER_DETAIL,
  coachDoorOpen,
  coachToolsOpen,
  coachUnlimitedDoorOpen,
  isBasicCoach,
  isPlainCoachTournament,
  mediaConsoleDoorOpen,
  ownerProHubOpen,
  proDoorOpen,
  visibleProHubs,
  parentToolboxPath,
  COACH_UNLIMITED_PATH,
  COACH_UNLIMITED_TOOLS,
  coachingToolsMenu,
  COMPETITOR_SYSTEM_NAME,
  INSTRUCTOR_COLLAB_HUB_LABEL,
  INSTRUCTOR_COLLAB_NAME,
  INSTRUCTOR_COACH_ENTRY,
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
  toolEyebrow,
  tournamentToolLabel,
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
    'BJJ scoreboard and round timer for live matches and rounds. Display stays on the TV, the controller stays in your hand.',
  );
  assert.equal(
    COACH_HOME_DESCRIPTION,
    'Daily Lesson Planner with Expandable Technique Trees and Video Looper. Bracketing and Mock Tournament Tool with Student Roster.',
  );
  assert.doesNotMatch(WHITE_HOME_DESCRIPTION, /White —/);
  assert.match(COACH_HOME_DESCRIPTION, /Technique Trees/);
  assert.match(COACH_HOME_DESCRIPTION, /Student Roster/);
  assert.doesNotMatch(WHITE_HOME_DESCRIPTION, /student/i);
  assert.doesNotMatch(COACH_HOME_DESCRIPTION, /competitor roster/i);
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
    ['Daily Lesson Plan', 'Daily Training Videos', 'Technique Tree', 'Student Roster', 'Mock Tournament'],
  );
  assert.deepEqual(
    COACH_HUBS.map((hub) => hub.to),
    ['/notes', '/techniques', '/technique-tree', '/roster?from=students', '/tournament?from=coach'],
  );
  assert.deepEqual(
    COACH_HUBS.map((hub) => hub.belt),
    ['coach', 'coach', 'coach', 'coach', 'tournament'],
  );
  assert.ok(!COACH_HUBS.some((hub) => hub.title === 'Coaching Tools' || hub.title === COMPETITION_MANAGEMENT_LABEL));
  assert.ok(!COACH_HUBS.some((hub) => /curriculum/i.test(hub.title)));
  assert.deepEqual(
    COACHING_TOOLS_MENU.map((item) => item.title),
    ['Daily Lesson Plan', 'Daily Training Videos', 'Technique Tree'],
  );
  assert.deepEqual(
    COACHING_TOOLS_MENU.map((item) => item.to),
    ['/notes', '/techniques', '/technique-tree'],
  );
  assert.deepEqual(
    COACHING_TOOLS_MENU.map((item) => item.belt),
    ['coach', 'coach', 'coach'],
  );
  assert.equal(coachingToolsMenu(false)[0].belt, 'coach');
  assert.equal(coachingToolsMenu(true)[0].belt, 'coach');
  assert.deepEqual(
    coachingToolsMenu(false).map((item) => item.to),
    ['/notes', '/techniques', '/technique-tree'],
  );
  assert.equal(coachingToolsMenu(true)[0].to, UNLIMITED_LESSON_PATH);
  assert.deepEqual(
    coachingToolsMenu(true).slice(1).map((item) => item.to),
    ['/techniques', '/technique-tree'],
  );
  assert.deepEqual(
    COMPETITION_MENU.map((item) => item.title),
    ['Competitor Management System', 'Mock Tournament', 'Scoreboard', 'Round Timer'],
  );
  assert.deepEqual(
    COMPETITION_MENU.map((item) => item.to),
    ['/competitors', '/tournament', '/match/control', '/training'],
  );
  assert.equal(COMPETITION_MENU[2].to, MATCH_CONTROLLER_PATH);
  assert.equal('clearBout' in COMPETITION_MENU[2] && COMPETITION_MENU[2].clearBout, true);
  assert.equal(COMPETITION_MENU[3].to, '/training');
  assert.ok(!COMPETITION_MENU.some((item) => item.to === '/match'));
  assert.ok(!COMPETITION_MENU.some((item) => item.to.startsWith('/training/control')));
  const menuOrder = COMPETITION_MENU.map((item) => item.title);
  assert.ok(menuOrder.indexOf('Competitor Management System') < menuOrder.indexOf('Mock Tournament'));
  assert.ok(menuOrder.indexOf('Mock Tournament') < menuOrder.indexOf('Scoreboard'));
  assert.ok(menuOrder.indexOf('Scoreboard') < menuOrder.indexOf('Round Timer'));
  assert.deepEqual(
    COMPETITION_MENU.map((item) => item.belt),
    ['tournament', 'tournament', 'tournament', 'tournament'],
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
  assert.deepEqual(
    COACH_UNLIMITED_TOOLS.map((tool) => tool.title),
    ['Daily Lesson Plan', 'Daily Training Videos', 'Technique Tree', 'Competition Class Curriculum'],
  );
  assert.equal(COACH_UNLIMITED_TOOLS[0].to, UNLIMITED_LESSON_PATH);
  assert.deepEqual(
    COACH_UNLIMITED_TOOLS.map((tool) => tool.belt),
    ['brown', 'brown', 'brown', 'tournament'],
  );
  assert.equal(COACH_UNLIMITED_TOOLS[3].to, '/competition-curriculum?plan=unlimited');
  assert.ok(!COACH_UNLIMITED_TOOLS.some((tool) => tool.to.startsWith('/coaching-tools')));
  assert.deepEqual(
    PRO_HUBS.map((hub) => hub.title),
    [MEDIA_CONSOLE_NAME, INSTRUCTOR_COACH_ENTRY, INSTRUCTOR_COLLAB_HUB_LABEL, TOURNAMENT_MANAGEMENT_PRO_LABEL],
  );
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
  assert.equal(TOURNAMENT_MANAGEMENT_PRO_LABEL, 'Tournament Management Pro');
  assert.equal(PRO_HUBS[3].title, 'Tournament Management Pro');
  assert.equal(COMPETITION_MANAGEMENT_PRO_LABEL, 'Competition Management Pro');
  assert.equal(
    TOURNAMENT_MANAGEMENT_PRO_LEAD,
    'Pro Version of Tournament Brackets, Scoreboard and Round Timer - Additional Skins and Animations Included. Rankings stay in Competitor Management System.',
  );
  assert.doesNotMatch(TOURNAMENT_MANAGEMENT_PRO_LEAD, /roster/i);
  assert.deepEqual(
    COMPETITION_PRO_MENU.map((item) => item.title),
    ['Brackets-Tournament Software', 'Competitor Management System', 'Scoreboard', 'Round Timer'],
  );
  assert.ok(!COMPETITION_PRO_MENU.some((item) => /roster/i.test(item.title)));
  assert.deepEqual(
    COMPETITION_PRO_MENU.map((item) => item.to),
    [
      withSuiteFrom('/tournament', true),
      '/competitors',
      withSuiteFrom(MATCH_CONTROLLER_PATH, true),
      withSuiteFrom(ROUND_CONTROLLER_PATH, true),
    ],
  );
  assert.equal(COMPETITION_PRO_MENU[0].to, withSuiteFrom('/tournament', true));
  assert.equal(COMPETITION_PRO_MENU[1].to, '/competitors');
  assert.deepEqual(
    COMPETITION_PRO_MENU.map((item) => item.belt),
    ['tournament', 'tournament', 'black', 'black'],
  );
  assert.deepEqual(
    COMPETITION_PRO_MENU.map((item) => item.clearBout),
    [false, false, true, false],
  );
});

test('Suite origin stays on Suite links and leaves other paths alone', () => {
  assert.equal(withSuiteFrom('/match', false), '/match');
  assert.equal(withSuiteFrom('/training/control', false), '/training/control');
  assert.equal(withSuiteFrom('/match', true), '/match?from=suite');
  assert.equal(withSuiteFrom('/match/control?focus=round', true), '/match/control?focus=round&from=suite');
  assert.equal(withSuiteFrom('/match?bout=final-0', true), '/match?bout=final-0&from=suite');
  assert.equal(withSuiteFrom('/training?from=suite', true), '/training?from=suite');
});

test('Owner tournament tool is Tournament Software; Coach keeps Mock Tournament', () => {
  assert.equal(TOURNAMENT_SOFTWARE_NAME, 'Tournament Software');
  assert.equal(MOCK_TOURNAMENT_NAME, 'Mock Tournament');
  assert.equal(tournamentToolLabel(true), TOURNAMENT_SOFTWARE_NAME);
  assert.equal(tournamentToolLabel(false), MOCK_TOURNAMENT_NAME);
});

test('Home Pro card describes the console without a Coming Soon line', () => {
  assert.deepEqual(PRO_HOME_LINES, [
    "Gym Owner and Instructor's Console",
    'Easily cast class schedules, pro shop inventory, events, recent promotions, and more to your gym TV.',
    'Coordinate and create In-House Tournaments in moments and track the results for review and ranking.',
    'Provide your instructors with access to our collaborative coaching tools and give your gym the ultimate Advantage!',
  ]);
  const home = PRO_HOME_LINES.join('\n');
  assert.match(home, /Instructor's Console/);
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

test('Program Director opens Media Console with Pro locked; other seats do not', () => {
  const lockedDirector = {
    proUnlocked: false,
    seated: true,
    seatGrantsMedia: true,
    programDirectorSeat: true,
    coachMenus: false,
  };
  assert.equal(mediaConsoleDoorOpen(lockedDirector), true);
  assert.deepEqual(
    visibleProHubs(lockedDirector).map((hub) => hub.title),
    [MEDIA_CONSOLE_NAME],
  );
  assert.equal(coachUnlimitedDoorOpen(lockedDirector), false);

  const lockedAssistant = {
    proUnlocked: false,
    seated: true,
    seatGrantsMedia: false,
    programDirectorSeat: false,
    coachMenus: true,
  };
  assert.equal(mediaConsoleDoorOpen(lockedAssistant), false);
  assert.deepEqual(visibleProHubs(lockedAssistant), []);

  const lockedCoachWithGallery = {
    proUnlocked: false,
    seated: true,
    seatGrantsMedia: true,
    programDirectorSeat: false,
    coachMenus: true,
  };
  assert.equal(mediaConsoleDoorOpen(lockedCoachWithGallery), false);

  const proAssistant = { ...lockedAssistant, proUnlocked: true };
  assert.equal(mediaConsoleDoorOpen(proAssistant), false);
  assert.equal(coachUnlimitedDoorOpen(proAssistant), true);
  assert.deepEqual(
    visibleProHubs(proAssistant).map((hub) => hub.to),
    [COACH_UNLIMITED_PATH],
  );

  const proDirector = { ...lockedDirector, proUnlocked: true };
  assert.equal(mediaConsoleDoorOpen(proDirector), true);
  assert.deepEqual(
    visibleProHubs(proDirector).map((hub) => hub.title),
    [MEDIA_CONSOLE_NAME],
  );

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
  assert.equal(mediaConsoleDoorOpen({ ...owner, proUnlocked: false }), false);
});
