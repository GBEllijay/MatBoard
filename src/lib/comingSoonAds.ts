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

export const PRODUCT_TEASERS = {
  coach: 'Mock tournaments on the gym TV, plus Daily Techniques that loop while the class drills.',
  pro: 'Class Schedule, Gallery, Videos, ProShop display, Events, and instructor seats you control.',
  proUnlocked:
    'Class Schedule, Gallery, Videos, ProShop display, Events, instructor seats, and competitor tools.',
} as const;

export const COMING_SOON_ADS: Record<SoonProduct, ComingSoonAdCopy> = {
  coach: {
    title: 'Advantage Coach',
    kicker: 'Coming soon',
    lead: 'Built for coaches on the gym floor.',
    features: [
      {
        title: 'Competitor Management System',
        body: 'Keep a roster for bouts — names and belts you pick into Live Bout and mock brackets.',
      },
      {
        title: 'Mock tournaments',
        body: 'Run a 16-person bracket on the gym TV. Score each bout and track winners on the same easy to use scoreboard.',
      },
      {
        title: 'Daily Techniques',
        body: 'Drop morning clips on the TV. Loop one while the class drills, with a timer on the screen. Each coach keeps their own bank of clips.',
      },
    ],
    dismiss: 'Got it',
  },
  pro: {
    title: 'Advantage Pro',
    kicker: 'Coming soon',
    lead: 'Owner tools for the black belt who runs the gym — the wall TV, the shop, and the people on the mat.',
    features: [
      {
        title: 'Class Schedule',
        body: 'Gym logo, QR, and a multi-mat week on the wall TV.',
      },
      {
        title: 'Gallery and Videos',
        body: 'Photos and clips looping between classes.',
      },
      {
        title: 'ProShop display',
        body: 'Product cards on the gym TV.',
      },
      {
        title: 'Events and flyers',
        body: 'Tournament and promo flyers on the same board.',
      },
      {
        title: 'Instructor seats',
        body: 'Seats for instructors you add and control.',
      },
      {
        title: 'Competitor tools',
        body: 'Bout roster, mock tournament, and Daily Techniques for the coaches you seat.',
      },
    ],
    dismiss: 'Got it',
  },
};
