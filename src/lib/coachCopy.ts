/** User-facing Coach copy. Keep competitor language — never students/progress. */

export const COMPETITOR_ROSTER_LABEL = 'Competitor Roster';
export const TRAINING_NOTES_LABEL = 'Daily Lesson Plan';
export const TECHNIQUE_TREE_LABEL = 'Technique Tree';

export const TECHNIQUE_TREE_LEAD =
  'Trees stay on this phone. Start from a base position, then add a branch or a defense.';

export const TECHNIQUE_TREE_CAP_NOTE =
  'This phone holds 20 Technique Trees. Delete one to add another.';

export const COACH_TOOLS_TEASER =
  `${TRAINING_NOTES_LABEL}, Daily Training Videos, Mock Tournament, ${COMPETITOR_ROSTER_LABEL}.`;

/** Short home-card line so Coming Soon and unlocked teasers both fit. */
export const COACH_HOME_TEASER =
  'Daily Lesson Plan, Daily Training Videos, Mock Tournament, Roster.';

export const COACH_AD_LEAD =
  `Coach tools: write a ${TRAINING_NOTES_LABEL}, loop Daily Training Videos, build a ${TECHNIQUE_TREE_LABEL}, run a Mock Tournament, and keep a ${COMPETITOR_ROSTER_LABEL}.`;

/** Hub card sentence under Advantage Coach. Same priority as the yellow-line list. */
export const COACH_HUB_BLURB =
  `${TRAINING_NOTES_LABEL}, Daily Training Videos, ${TECHNIQUE_TREE_LABEL}, run a Mock Tournament, and keep a ${COMPETITOR_ROSTER_LABEL}.`;

export const EMPTY_ROSTER_TITLE = 'No competitors yet';
export const EMPTY_ROSTER_BODY =
  'Add a name and belt, then pick them into a match or bracket.';
export const EMPTY_ROSTER_SEARCH = 'No competitors match that name or belt.';

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

export const ROSTER_LEAD_COACH =
  'Competitor Roster with Names and Ranks for Single Matches and Mock Tournaments.';
export const ROSTER_LEAD_PRO =
  'Competitor Management — names and belts for Match and Mock Tournament. CSV backup stays in this browser.';

/** Coach Competitor Roster: CSV stays on the Pro roster screen. */
export const ROSTER_CSV_PRO_TEASER = 'Importable CSV Template Available in Advantage Pro';

/** True on the Pro roster surface. False on the Coach Competitor Roster screen. */
export function rosterCsvAvailable(proUnlocked: boolean, coachRosterScreen: boolean): boolean {
  return proUnlocked && !coachRosterScreen;
}

export const NOTES_LEAD = "Today on this phone. Yesterday and the last 14 days stay on this device.";
