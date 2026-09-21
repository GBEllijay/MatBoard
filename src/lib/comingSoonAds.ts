import {
  COACH_AD_LEAD,
  COACH_HOME_TEASER,
  COMPETITOR_ROSTER_LABEL,
  TRAINING_NOTES_LABEL,
} from './coachCopy.ts';
import { GYM_CONSOLE_NAME, TOURNAMENT_SOFTWARE_NAME } from './productNames.ts';

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
        title: 'Mock Tournament',
        body: 'Run a 16-person bracket on the gym TV. Score each bout and track winners on the same easy to use scoreboard.',
      },
      {
        title: 'Competitor Management',
        body: `Keep a ${COMPETITOR_ROSTER_LABEL} for bouts — names and belts you pick into Live Bout and mock brackets.`,
      },
      {
        title: TRAINING_NOTES_LABEL,
        body: 'Jot class plans and cues on this phone. Warm-up, drills, who goes first.',
      },
      {
        title: 'Daily Training Videos',
        body: 'Up to 10 on-device clips. Loop one while the class drills, with a 2:30 / 5:00 / 7:00 timer on the screen.',
      },
    ],
    dismiss: 'Got it',
  },
  pro: {
    title: 'Advantage Pro',
    kicker: COMING_SOON_LABEL,
    lead: `${GYM_CONSOLE_NAME}. Easily cast to your gym TV and display: Pro-Shop, Class Schedules, Recent Promotions, Upcoming Events and Competitions. Full In-House Tournament Management Suite with Auto-Fill Bracketing and Result Tracking. Assignable Instructor Licenses with Cross Platform Access to Updates and more.`,
    features: [
      {
        title: 'Gym TV cast',
        body: 'Pro-Shop, Class Schedules, Recent Promotions, and Upcoming Events and Competitions on the wall board.',
      },
      {
        title: TOURNAMENT_SOFTWARE_NAME,
        body: 'Auto-fill bracketing and result tracking for gym-floor tournaments.',
      },
      {
        title: 'Instructor licenses',
        body: 'Assignable instructor licenses with cross-platform access to updates.',
      },
    ],
    dismiss: 'Got it',
  },
};
