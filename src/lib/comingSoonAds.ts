import { GYM_CONSOLE_NAME } from './productNames.ts';

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
  coach: 'Mock Tournament, Daily Techniques, Competitor Management.',
  coachUnlocked: 'Coach tools on this browser.',
  pro: GYM_CONSOLE_NAME,
  proUnlocked: 'Console is on this browser.',
} as const;

export const COMING_SOON_ADS: Record<SoonProduct, ComingSoonAdCopy> = {
  coach: {
    title: 'Advantage Coach',
    kicker: COMING_SOON_LABEL,
    lead: 'Run a Mock Tournament, Record Daily Techniques for Screencasting with Competitor Management System.',
    features: [
      {
        title: 'Competitor Management System',
        body: 'Keep a roster for bouts — names and belts you pick into Live Bout and mock brackets.',
      },
      {
        title: 'Mock Tournament',
        body: 'Run a 16-person bracket on the gym TV. Score each bout and track winners on the same easy to use scoreboard.',
      },
      {
        title: 'Daily Techniques',
        body: 'Record morning clips for screencasting. Loop one while the class drills, with a timer on the screen. Each coach keeps their own bank of clips.',
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
        title: 'In-House Tournament Suite',
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
