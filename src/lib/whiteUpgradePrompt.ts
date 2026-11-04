import { TIER_BUY_PATHS } from './tierBuyPages.ts';

/** Visible line on the White hub upgrade control. No price. */
export const WHITE_UPGRADE_LINE = 'Start with White, grow into Pro.';

/** Second line under the White hub upgrade control. No price. */
export const WHITE_UPGRADE_SUB =
  'Your investment grows with you. Your purchase price counts towards each upgrade.';

/** Short name for assistive tech. Not a second visible price. */
export const WHITE_UPGRADE_LABEL = 'Upgrade to Student Edition';

/** Public Student buy page. /buy/student stays behind the Student door. */
export const WHITE_UPGRADE_PATH = TIER_BUY_PATHS.student;

/**
 * White hub only. Student and every tier above it already include White,
 * so those doors hide the prompt. A live seat is not a license owner.
 */
export function whiteUpgradePromptVisible(access: {
  white: boolean;
  student: boolean;
  media: boolean;
  coach: boolean;
  pro: boolean;
  cloud: boolean;
  seated: boolean;
}): boolean {
  if (access.seated || !access.white) return false;
  return !(access.student || access.media || access.coach || access.pro || access.cloud);
}
