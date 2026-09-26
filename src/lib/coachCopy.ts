/** User-facing Coach copy. Keep competitor language — never students/progress. */

export const COMPETITOR_ROSTER_LABEL = 'Competitor Roster';
export const TRAINING_NOTES_LABEL = 'Daily Lesson Plan';
export const TECHNIQUE_TREE_LABEL = 'Technique Tree';

export const TECHNIQUE_TREE_LEAD =
  'Trees stay on this phone. Start from a base position, then add a branch or a defense.';

export const TECHNIQUE_TREE_CAP_NOTE =
  'This phone holds 20 Technique Trees. Delete one to add another.';

export const COACH_TOOLS_TEASER =
  'Tools and Templates for Coaches and Professors.';

/** Short home-card line so Coming Soon and unlocked teasers both fit. */
export const COACH_HOME_TEASER =
  'Daily Lesson Plan, Daily Training Videos, Mock Tournament, Roster.';

export const COACH_AD_LEAD =
  `Coach tools: write a ${TRAINING_NOTES_LABEL}, loop Daily Training Videos, build a ${TECHNIQUE_TREE_LABEL}, run a Mock Tournament, and keep a ${COMPETITOR_ROSTER_LABEL}.`;

/** Feature list kept for copy checks. Not shown on the Coach hub card. */
export const COACH_HUB_BLURB =
  `${TRAINING_NOTES_LABEL}, Daily Training Videos, ${TECHNIQUE_TREE_LABEL}, run a Mock Tournament, and keep a ${COMPETITOR_ROSTER_LABEL}.`;

export const EMPTY_ROSTER_TITLE = 'No competitors yet';
export const EMPTY_ROSTER_BODY =
  'Add a name and belt, then pick them into a match or bracket.';
export const EMPTY_ROSTER_SEARCH = 'No competitors match that name, belt, or division.';

export const EMPTY_NOTES_TITLE = 'No notes yet';
export const EMPTY_NOTES_BODY = 'Jot a class plan — warm-up, drills, who goes first.';

export const EMPTY_VIDEOS_TITLE = 'No clips yet';
export const EMPTY_VIDEOS_BODY =
  'Add video opens Record or Pick from gallery — one clip per card. Clips stay on this device. Technique slots loop with a 2:30, 5:00, or 7:00 timer.';

export const EMPTY_BRACKET_TITLE = 'Empty bracket';
export const EMPTY_BRACKET_BODY =
  'Tap Edit names to fill this bracket, then Score a bout.';

/** Gym Owner Console — local saves ship now; cloud is the next owner step. */
export const OWNER_BRACKET_CLOUD_NOTE =
  'Saved brackets stay on this device. Pro boards hold up to 64 competitors. Cloud sync comes later.';

/** User-facing roster meaning on Competitor Management and the Pro roster. */
export const COMPETITOR_ROSTER_DESCRIPTION =
  'Competitor Roster is the list of bout competitors for matches and brackets.';

/** Subtitle on the Competitor Roster button in Competitor Management. */
export const COMPETITOR_ROSTER_CARD =
  'Easily create and maintain a list of competitor names, rankings and results for easy loading into tournament brackets and matches.';

/** Subtitle on the Rankings / Results button. Copy only — no auto-bracket or seeding yet. */
export const RANKINGS_RESULTS_CARD =
  'Save and catalogue your tournament results. Keeps names, dates, divisions, placements, and win records for ranking calculations. Full auto-bracketing and seeding coming soon.';

/** Hub button under Competitor Management. One checklist per roster competitor. */
export const COMPETITION_READY_LABEL = 'Competition Ready';

/** Subtitle on the Competition Ready button. */
export const COMPETITION_READY_CARD =
  'A weekend checklist for each competitor. Medical forms, gi, division, travel, waiver, and weigh-in stay on this device.';

/** Lead on the Competition Ready list. Same On / Off language as Media Console. */
export const COMPETITION_READY_LEAD =
  'Gold On is done. Off still needs attention. Each list stays on this device with that competitor.';

/** Hub button under Competitor Management. One A/B/C plan per roster competitor. */
export const GAME_PLAN_LABEL = 'Competitor Game Plan';

/** Subtitle on the Competitor Game Plan button. */
export const GAME_PLAN_CARD =
  'A Game, B Game, and C Game for each bout competitor, plus what to work on at home. A Technique Tree link is optional.';

/** Lead on the game plan screen. A note can stand alone. */
export const GAME_PLAN_LEAD =
  'Notes stay on this device with that competitor. A Technique Tree link is optional, and a custom note can stand alone.';

export const GAME_PLAN_A = 'A Game';
export const GAME_PLAN_B = 'B Game';
export const GAME_PLAN_C = 'C Game';
export const GAME_PLAN_HOME = 'Home focus. What to work on between sessions.';
export const GAME_PLAN_OPTIONAL = 'Optional. A note does not need a Technique Tree step.';
export const GAME_PLAN_EMPTY =
  'Add a name and belt on Competitor Roster, then write their game plan here.';

export const ROSTER_LEAD_COACH =
  'Competitor Roster with Names and Ranks for Single Matches and Mock Tournaments.';
export const ROSTER_LEAD_PRO =
  'Save competitor names, belts, divisions, and notes for matches and in-house tournaments. CSV backup available.';

/** Short line under the Pro CSV buttons. Same voice as the roster lead. */
export const ROSTER_CSV_DEVICE_NOTE =
  'The roster stays on this device. CSV is for backup or a move.';

/** Shown only from the Instructions control. Import skips a row without both. */
export const ROSTER_CSV_INSTRUCTIONS =
  'Each row needs a competitor name and a belt. A row missing either one is left out. Division, known injuries, and Check In are optional.';

/** Coach Competitor Roster: CSV stays on the Pro roster screen. */
export const ROSTER_CSV_PRO_TEASER = 'Importable CSV Template Available in Advantage Pro';

/** True on the Pro roster surface. False on the Coach Competitor Roster screen. */
export function rosterCsvAvailable(proUnlocked: boolean, coachRosterScreen: boolean): boolean {
  return proUnlocked && !coachRosterScreen;
}

export const NOTES_LEAD = "Today on this phone. Yesterday and the last 14 days stay on this device.";
