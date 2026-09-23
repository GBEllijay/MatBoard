import {
  COACH_AD_LEAD,
  COACH_HOME_TEASER,
  COMPETITOR_ROSTER_LABEL,
  TECHNIQUE_TREE_LABEL,
  TRAINING_NOTES_LABEL,
} from './coachCopy.ts';
import { GYM_CONSOLE_NAME, PRO_HOME_DETAIL, PRO_HOME_LINES, TOURNAMENT_SOFTWARE_NAME } from './productNames.ts';

export type SoonProduct = 'coach' | 'pro';

export type ComingSoonFeature = {
  title: string;
  body: string;
};

export type ComingSoonAdCopy = {
  title: string;
  kicker: string;
  lead: string;
  features: ComingSoonFeature[];
  dismiss: string;
};

/** Locked-card gold label. Same wording on Coach and Pro / Console. */
export const COMING_SOON_LABEL = 'Coming Soon';

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
    lead: COACH_AD_LEAD,
    features: [
      {
        title: TRAINING_NOTES_LABEL,
        body: 'Plan the class on this phone — warm-up, techniques, cool-down, and closing. Saved on this device.',
      },
      {
        title: 'Daily Training Videos',
        body: 'Up to 10 on-device clips. Loop one while the class drills, with a 2:30 / 5:00 / 7:00 timer on the screen.',
      },
      {
        title: TECHNIQUE_TREE_LABEL,
        body: 'Map a base position into branches and defenses. Trees stay on this phone.',
      },
      {
        title: 'Mock Tournament',
        body: 'Run a bracket of up to 16 competitors on the gym TV. Score each bout and track winners on the same easy to use scoreboard.',
      },
      {
        title: COMPETITOR_ROSTER_LABEL,
        body: 'Names and belts you pick into Live Bout and mock brackets.',
      },
    ],
    dismiss: 'Got it',
  },
  pro: {
    title: 'Advantage Pro',
    kicker: COMING_SOON_LABEL,
    lead: `${PRO_HOME_DETAIL}. ${PRO_HOME_LINES.join(' ')}`,
    features: [
      {
        title: 'Gym TV cast',
        body: 'Class Schedules, Recent Promotions, ProShop Inventory, and Upcoming Events and Competitions.',
      },
      {
        title: TOURNAMENT_SOFTWARE_NAME,
        body: 'Full in-house tournament management with auto-fill bracketing and result tracking.',
      },
      {
        title: 'Instructor licenses',
        body: 'Assignable instructor licenses with cross-platform access to updates, shared training videos, and more.',
      },
    ],
    dismiss: 'Got it',
  },
};
