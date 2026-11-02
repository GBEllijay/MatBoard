import { PRO_PLUS_CLOUD_INFO_PATH, PRO_PLUS_CLOUD_NAME } from './productNames.ts';
import { TIER_BUY_PATHS } from './tierBuyPages.ts';

/** Always the Media description. /media becomes the hub once Media is unlocked. */
export const MEDIA_INFO_PATH = '/editions/media';

/**
 * One Learn more control per tier. Labels match the buttons already on the
 * products page. Each link opens that tier's public description page.
 */
export const LEARN_MORE = {
  white: { label: 'Learn more about Advantage White', to: TIER_BUY_PATHS.white },
  student: { label: 'Learn more about Student Edition', to: TIER_BUY_PATHS.student },
  media: { label: 'Learn more about Media Edition', to: MEDIA_INFO_PATH },
  instructor: { label: 'Learn more about Instructor Edition', to: TIER_BUY_PATHS.instructor },
  pro: { label: 'Learn more about Advantage Pro', to: TIER_BUY_PATHS.pro },
  proCloud: { label: `Learn more about ${PRO_PLUS_CLOUD_NAME}`, to: PRO_PLUS_CLOUD_INFO_PATH },
} as const;

export type LearnTier = keyof typeof LEARN_MORE;
