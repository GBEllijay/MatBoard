/**
 * Advantage Media Edition marketing page. Display only.
 *
 * Not for sale: there is no Stripe price, checkout, code kind, or entitlement for
 * Media Edition. The page and the homepage ladder card (id `academy`) only show the
 * list price and the alpha-code email, the same pattern as the other alpha tiers.
 *
 * Every feature line below comes from shipped code:
 *  - Included: WHITE_INCLUDED (lib/whitePurchase) plus MEDIA_CONSOLE_NAME.
 *  - Media Console: FOLDERS (lib/photoStore), MEDIA_CONSOLE_INSTRUCTIONS
 *    (lib/productNames), the Settings sheet in pages/Screensaver.tsx
 *    (Photo interval, Play order, Pro Shop / Events on the TV, Video sound,
 *    GymLogoControl), and the Google Photos / Google Drive pickers.
 */
import { alphaAccessNote } from './productPrices.ts';
import { MEDIA_CONSOLE_NAME } from './productNames.ts';
import { WHITE_INCLUDED } from './whitePurchase.ts';

export const MEDIA_EDITION_PATH = '/media';

/** First preview address. It redirects to MEDIA_EDITION_PATH. */
export const MEDIA_EDITION_OLD_PATH = '/media-edition';

export const MEDIA_EDITION_NAME = 'Advantage Media Edition';

/** Same cloth as `.belt-header--purple` (the Media Console header) and the homepage purple belt. */
export const MEDIA_EDITION_BELT_CLOTH = '#6b2d91';

/** Display price only. Matches the homepage ladder card. */
export const MEDIA_EDITION_LIST_PRICE_CENTS = 2999;
export const MEDIA_EDITION_PRICE_LINE = '$29.99 one-time';
export const MEDIA_EDITION_PRICE_DETAIL = 'USD — one-time, when it launches';

/** Same words as the homepage ladder card. */
export const MEDIA_EDITION_LEAD = 'Scoreboard, round timer, and media console.';

/** Same wording style as the other tiers' "Includes everything in …" line. */
export const MEDIA_EDITION_INCLUDES = 'Includes everything in Advantage White.';

export const MEDIA_EDITION_INCLUDED = [...WHITE_INCLUDED, MEDIA_CONSOLE_NAME] as const;

export type MediaEditionFeature = { title: string; body: string };

/** Media Console, as it works in the app today. */
export const MEDIA_EDITION_FEATURES: readonly MediaEditionFeature[] = [
  {
    title: 'Gallery',
    body: 'Photos and videos loop fullscreen on the gym TV. Add them from this phone, from Google Photos (including albums), or from Google Drive.',
  },
  {
    title: 'Class Schedule',
    body: 'Casts the full week or month after Gallery, before Pro Shop.',
  },
  {
    title: 'Pro Shop',
    body: 'Add a photo, a name, and a buy link. The TV builds a QR from that link.',
  },
  {
    title: 'Events',
    body: 'Add a photo, a name, and QR links for registration, brackets, or tickets.',
  },
  {
    title: 'Play order and timing',
    body: 'Enabled folders play Gallery, then Pro Shop, then Events. Set the photo interval, play in order or shuffle. Videos play all the way through.',
  },
  {
    title: 'Video sound',
    body: 'Clips stay muted unless Play video sound is on, so gym music in another tab can keep going.',
  },
  {
    title: 'Gym logo',
    body: 'Pro Shop and Events display: Images only, Images + QR, or Images + QR + gym logo. The Class Schedule uses the same logo.',
  },
  {
    title: 'Stays on this device',
    body: 'Photos, buy links, and QR links stay on this device. Nothing is uploaded.',
  },
] as const;

export const MEDIA_EDITION_ALPHA_NOTE = alphaAccessNote('Media Edition');

export const MEDIA_EDITION_CTA_LABEL = 'Request an alpha code';

export type MediaEditionShot = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
};

/** White band: the same scoreboard and round timer screens as the homepage hero. */
export const MEDIA_EDITION_BAND_SHOTS: readonly MediaEditionShot[] = [
  {
    src: '/storefront/scoreboard.png',
    width: 1280,
    height: 720,
    alt: 'Advantage scoreboard with points, advantages, and penalties for two competitors',
    caption: 'Scoreboard',
  },
  {
    src: '/storefront/round-timer.png',
    width: 1280,
    height: 720,
    alt: 'Advantage round timer showing 05:00, work round 1 of 5',
    caption: 'Round timer',
  },
];

/**
 * Gallery under the white band. Real repo images only, in this order.
 * The two woodblocks reuse the homepage alt text and captions.
 */
export const MEDIA_EDITION_GALLERY: readonly MediaEditionShot[] = [
  {
    src: '/homepage/woodblock-scoreboard.jpg',
    width: 1280,
    height: 720,
    alt: 'Woodblock-style illustration of kids rolling at the gym while the Advantage scoreboard runs on the wall TV',
    caption: 'Scoreboard on the gym TV',
  },
  {
    src: '/homepage/woodblock-timer.jpg',
    width: 1280,
    height: 720,
    alt: 'Woodblock-style illustration of kids rolling at the gym while the Advantage round timer runs on the wall TV',
    caption: 'Round timer between rounds',
  },
  {
    src: '/storefront/round-timer-live.png',
    width: 1280,
    height: 720,
    alt: 'Advantage round timer at 03:12, work round 2 of 5, over the mat background',
    caption: 'Round timer, live round',
  },
];
