import {
  COACH_HOME_TEASER,
  STUDENT_NOTES_LABEL,
  STUDENT_ROSTER_LABEL,
  TECHNIQUE_TREE_LABEL,
  TRAINING_NOTES_LABEL,
} from './coachCopy.ts';
import {
  GYM_CONSOLE_NAME,
  INSTRUCTOR_COLLAB_HUB_LABEL,
  INSTRUCTOR_COACH_ENTRY,
  MEDIA_CONSOLE_NAME,
  PRO_LADDER_DETAIL,
  TOURNAMENT_MANAGEMENT_PRO_LABEL,
} from './productNames.ts';
import { COACH_PRICE_LINE, PRO_PRICE_LINE } from './productPrices.ts';
import { SITE_FEEDBACK_EMAIL } from './siteFooter.ts';

export type SoonProduct = 'coach' | 'pro';

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

/** Locked-card gold label. Same wording on Coach and Pro / Console. */
export const COMING_SOON_LABEL = 'Coming Soon';

/** Caption on the Coach Coming Soon shot of the unlocked Coach home. */
export const COACH_PREVIEW_LABEL = 'Advantage Coach';

/** One line under that shot. The picture is the live Coach button list. */
export const COACH_PREVIEW_NOTE =
  'Daily Lesson Plan, training videos, Technique Tree, Student Roster, and a plain mock tournament.';

/** Caption on the Pro Coming Soon shot of the unlocked console home. */
export const PRO_CONSOLE_PREVIEW_LABEL = 'Advantage Pro';

/** One line under that shot. The picture is the live four-hub console, not a wireframe. */
export const PRO_CONSOLE_PREVIEW_NOTE =
  'Media Console, Advantage Coach Unlimited, instructor invites, and Tournament Management Pro.';

/** Shown on Coming soon. Not a checkout button. */
export const COACH_LAUNCH_PRICE_NOTE = `Price: ${COACH_PRICE_LINE} when it launches. Not for sale on this page.`;

/** Shown on Coming soon. Not a checkout button. Numbers stay the locked Pro prices. */
export const PRO_LAUNCH_PRICE_NOTE = `Price: ${PRO_PRICE_LINE} when it launches. Not for sale on this page.`;

/** Alpha free-trial request. Same inbox as site feedback. */
export const ALPHA_TRIAL_NOTE = `Free trial: request an alpha testing code by emailing ${SITE_FEEDBACK_EMAIL}.`;

export const PRODUCT_TEASERS = {
  coach: COACH_HOME_TEASER,
  coachUnlocked: COACH_HOME_TEASER,
  pro: GYM_CONSOLE_NAME,
  proUnlocked: 'Console is on this browser.',
} as const;

export const COMING_SOON_ADS: Record<SoonProduct, ComingSoonAdCopy> = {
  coach: {
    title: 'Advantage Coach',
    kicker: COMING_SOON_LABEL,
    lead: "Tools and templates for coaches. Plan today's class and loop training videos.",
    includes: 'Includes everything in Advantage White.',
    aside:
      'Basic Coach does not include Competition Class Curriculum or Competition Team Management.',
    features: [
      {
        title: TRAINING_NOTES_LABEL,
        body: "Plan today's class on this phone — warm-up, techniques, cool-down, and closing. Saved on this device.",
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
        body: `Name, belt, other belt, Division, gym name or nickname, last promotion, and ${STUDENT_NOTES_LABEL}. No photo on basic Coach.`,
      },
      {
        title: 'Mock Tournament',
        body: 'A plain bracket on this phone. No skins and no rankings.',
      },
    ],
    dismiss: 'Got it',
  },
  pro: {
    title: 'Advantage Pro',
    kicker: COMING_SOON_LABEL,
    lead: PRO_LADDER_DETAIL,
    includes: 'Includes everything in Advantage Coach and Advantage White.',
    features: [
      {
        title: MEDIA_CONSOLE_NAME,
        body: 'Gallery, Class Schedule, Pro Shop, and Events on the gym TV.',
      },
      {
        title: INSTRUCTOR_COACH_ENTRY,
        body: 'Daily Lesson Plan, Daily Training Videos, Technique Tree, and Competition Class Curriculum. Google Drive is an extra folder when this tier is unlocked.',
      },
      {
        title: INSTRUCTOR_COLLAB_HUB_LABEL,
        body: 'Invite instructors on this device and choose what each seat can open.',
      },
      {
        title: TOURNAMENT_MANAGEMENT_PRO_LABEL,
        body: 'Pro brackets, the scoreboard, and the round timer, with extra skins and animations.',
      },
    ],
    dismiss: 'Got it',
  },
};
