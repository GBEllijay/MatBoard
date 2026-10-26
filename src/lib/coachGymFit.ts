/**
 * Gym name and logo that can ride inside a coach file.
 * A missing or unusable logo is ignored so older files still load.
 */

import { asRecord } from './plainValue.ts';
import { PROGRESS_NAME_MAX, type CoachGymBrand } from './progress/types.ts';

/** Same cap as the on-device gym logo. Larger logos are left out, not fatal. */
export const COACH_GYM_LOGO_MAX_CHARS = 350_000;

const GYM_LOGO_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/;

export function coachGymLogoFits(value: string): boolean {
  return value.length <= COACH_GYM_LOGO_MAX_CHARS && GYM_LOGO_RE.test(value);
}

/** Read `gym` from a coach file or a Send to coach file. Null when it is absent. */
export function readTravelingGym(raw: unknown): CoachGymBrand | null {
  const record = asRecord(raw);
  const gym = record ? asRecord(record.gym) : null;
  if (!gym) return null;
  const name = typeof gym.name === 'string' ? gym.name.trim().slice(0, PROGRESS_NAME_MAX) : '';
  const logo = typeof gym.logo === 'string' && coachGymLogoFits(gym.logo) ? gym.logo : undefined;
  if (!name && !logo) return null;
  return logo ? { name, logo } : { name };
}

/**
 * Drop a gym logo that cannot be kept, before the photo check.
 * The rest of the file still loads.
 */
export function softenOversizedGymLogo(record: Record<string, unknown>): void {
  const gym = asRecord(record.gym);
  if (!gym || typeof gym.logo !== 'string' || coachGymLogoFits(gym.logo)) return;
  delete gym.logo;
}
