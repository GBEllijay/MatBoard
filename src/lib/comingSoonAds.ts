import {
  COACH_HOME_TEASER,
  STUDENT_NOTES_LABEL,
  STUDENT_ROSTER_LABEL,
  TECHNIQUE_TREE_LABEL,
  TRAINING_NOTES_LABEL,
} from './coachCopy.ts';
import {
  GYM_CONSOLE_NAME,
  INSTRUCTOR_HOME_TITLE,
  INSTRUCTOR_COLLAB_HUB_LABEL,
  PRO_INSTRUCTOR_HUB_LABEL,
  MEDIA_CONSOLE_NAME,
  PRO_LADDER_DETAIL,
  STUDENT_EDITION_NAME,
  STUDENT_HOME_DESCRIPTION,
  TOURNAMENT_MANAGEMENT_PRO_LABEL,
} from './productNames.ts';
import { INSTRUCTOR_DISPLAY_PRICE_LINE, PRO_PRICE_LINE, STUDENT_PRICE_LINE } from './productPrices.ts';
import { SITE_FEEDBACK_EMAIL } from './siteFooter.ts';

export type SoonProduct = 'coach' | 'pro' | 'student';

export type ComingSoonFeature = {
  title: string;
  body: string;
};

export type ComingSoonAdCopy = {
  title: string;
  kicker: string;
  lead: string;
  includes: string;
  aside?: string;
  features: ComingSoonFeature[];
  dismiss: string;
};

/** Instructor Edition (internal key coach) buy-page and sheet lead. Leads with the downloadable Daily Lesson Plan. */
export const INSTRUCTOR_EDITION_LEAD =
  "Tools and templates for instructors. Plan today's class with a downloadable Daily Lesson Plan and loop training videos.";

/** Instructor Edition sits above Media on the ladder. */
export const INSTRUCTOR_EDITION_INCLUDES = 'Includes everything in Media, Student and White.';

/** First Instructor feature: the Daily Lesson Plan, with its download and Drive save. */
export const INSTRUCTOR_LESSON_PLAN_BODY =
  "Plan today's class on this phone — warm-up, techniques, cool-down, and closing. Download today's lesson videos and save the plan to your Google Drive.";

/** Locked Pro and Student splash gold label. Coach does not use this. */
export const COMING_SOON_LABEL = 'Coming Soon';

/** Caption on the locked Instructor Edition shot of the unlocked Coach home (internal key stays coach). */
export const COACH_PREVIEW_LABEL = INSTRUCTOR_HOME_TITLE;

/** One line under that shot. The picture is the live Coach button list. */
export const COACH_PREVIEW_NOTE =
  'Daily Lesson Plan, training videos, Technique Tree, Student Roster, and full tournament brackets.';

/** Caption on the Pro Coming Soon shot of the unlocked console home. */
export const PRO_CONSOLE_PREVIEW_LABEL = 'Advantage Pro';

/** One line under that shot. The picture is the live four-hub console, not a wireframe. */
export const PRO_CONSOLE_PREVIEW_NOTE =
  'Media Console, Advantage Instructor Edition, instructor invites, and Competition and Tournament Management.';

/** Shown on Coming soon. Not a checkout button. */
export const COACH_LAUNCH_PRICE_NOTE = `Price: ${INSTRUCTOR_DISPLAY_PRICE_LINE} when it launches. Not for sale on this page.`;

/** Shown on Coming soon. Not a checkout button. Numbers stay the locked Pro prices. */
export const PRO_LAUNCH_PRICE_NOTE = `Price: ${PRO_PRICE_LINE} when it launches. Not for sale on this page.`;

/** Shown on Coming soon. Student Edition has no Stripe price in this build. */
export const STUDENT_LAUNCH_PRICE_NOTE = `Price: ${STUDENT_PRICE_LINE} when it launches. Not for sale on this page.`;

/** Caption on the Student Edition Coming Soon journal. */
export const STUDENT_PREVIEW_LABEL = STUDENT_EDITION_NAME;

/** One line under that journal. */
export const STUDENT_PREVIEW_NOTE = 'Journal, journal cards, a fundamentals checklist, calendar, and belt progress stay on this phone.';

/** Same request line as the home cards. Product sheets pass their own note. */
export const ALPHA_TRIAL_NOTE = `Email ${SITE_FEEDBACK_EMAIL} to request an alpha code.`;

export const PRODUCT_TEASERS = {
  coach: COACH_HOME_TEASER,
  coachUnlocked: COACH_HOME_TEASER,
  pro: GYM_CONSOLE_NAME,
  proUnlocked: 'Console is on this browser.',
} as const;

export const COMING_SOON_ADS: Record<SoonProduct, ComingSoonAdCopy> = {
  coach: {
    title: INSTRUCTOR_HOME_TITLE,
    kicker: '',
    lead: INSTRUCTOR_EDITION_LEAD,
    includes: INSTRUCTOR_EDITION_INCLUDES,
    aside:
      'Instructor Edition includes Competition Class Curriculum and Competition Team Management.',
    features: [
      {
        title: TRAINING_NOTES_LABEL,
        body: INSTRUCTOR_LESSON_PLAN_BODY,
      },
      {
        title: 'Daily Training Videos',
        body: 'Loop training clips while the class drills. Clips stay on this phone.',
      },
      {
        title: TECHNIQUE_TREE_LABEL,
        body: 'Map a base position into branches and defenses. Trees stay on this phone.',
      },
      {
        title: STUDENT_ROSTER_LABEL,
        body: `Name, belt, other belt, Division, gym name or nickname, last promotion, and ${STUDENT_NOTES_LABEL}. No photo on Instructor Edition.`,
      },
      {
        title: 'Tournament Software',
        body: 'Brackets up to 64 competitors, with bracket skins and the Competition class template. Brackets save on this phone.',
      },
    ],
    dismiss: 'Got it',
  },
  pro: {
    title: 'Advantage Pro',
    kicker: COMING_SOON_LABEL,
    lead: PRO_LADDER_DETAIL,
    includes: 'Includes everything in Instructor Edition, Media, Student and White.',
    features: [
      {
        title: MEDIA_CONSOLE_NAME,
        body: 'Gallery, Class Schedule, Pro Shop, and Events on the gym TV.',
      },
      {
        title: PRO_INSTRUCTOR_HUB_LABEL,
        body: 'Daily Lesson Plan, Daily Training Videos, Technique Tree, and Competition Class Curriculum. Google Drive is an extra folder when this tier is unlocked.',
      },
      {
        title: INSTRUCTOR_COLLAB_HUB_LABEL,
        body: 'Invite instructors on this device and choose what each seat can open.',
      },
      {
        title: TOURNAMENT_MANAGEMENT_PRO_LABEL,
        body: 'The same brackets, scoreboard, and round timer as Instructor Edition, opened from the Pro console.',
      },
    ],
    dismiss: 'Got it',
  },
  student: {
    title: STUDENT_EDITION_NAME,
    kicker: COMING_SOON_LABEL,
    lead: STUDENT_HOME_DESCRIPTION,
    includes: 'Daily notes, journal cards, and a fundamentals checklist stay on this phone.',
    features: [
      {
        title: 'Journal',
        body: "Today's page: date, gi or no-gi, an A/B/C game, techniques, partners, drills, rolls, and notes.",
      },
      {
        title: 'Journal cards',
        body: 'Search saved cards and add a later note. The first note stays.',
      },
      {
        title: 'Fundamentals',
        body: 'A checklist. Mark what you have learned and add your own lines.',
      },
      {
        title: 'Calendar',
        body: 'A month page. Days with journal cards are marked. Add a class, open mat, tournament, or promotion test.',
      },
      {
        title: 'Belt progress',
        body: 'Filled checkpoints between belts, goals, and coach notes you can copy.',
      },
    ],
    dismiss: 'Got it',
  },
};
