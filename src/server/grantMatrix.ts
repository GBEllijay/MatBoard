import type { Door } from '../lib/entitlementToken.ts';
import { impliedDoors } from '../lib/tierImplications.ts';
import { API_PRODUCT_COACH, API_PRODUCT_ID, API_PRODUCT_PRO, API_PRODUCT_STUDENT } from './routes.ts';

/**
 * Server side of the tier rule in src/lib/tierImplications.ts (the single table).
 * Pro opens Coach, Student Edition and White. Coach opens White.
 * Every code kind, Stripe product, owner test, refresh and restore goes through here,
 * so the signed pass always carries the implied doors.
 */
export function expandGrants(grants: readonly string[]): Door[] {
  return impliedDoors(grants);
}

export function grantsForProduct(product: string): Door[] {
  if (product === API_PRODUCT_ID) return ['white'];
  if (product === API_PRODUCT_STUDENT) return ['student'];
  if (product === API_PRODUCT_COACH) return expandGrants(['coach']);
  if (product === API_PRODUCT_PRO) return expandGrants(['pro']);
  return [];
}

export function tierForGrants(grants: readonly Door[], source: string): 'owner' | 'pro' | 'coach' | 'student' | 'white' | 'alpha' {
  if (source === 'owner') return 'owner';
  if (source === 'code' || source === 'free') {
    if (grants.includes('pro')) return 'alpha';
    if (grants.includes('coach')) return 'alpha';
    if (grants.includes('student')) return 'alpha';
    return 'white';
  }
  if (grants.includes('pro')) return 'pro';
  if (grants.includes('coach')) return 'coach';
  if (grants.includes('student')) return 'student';
  return 'white';
}
