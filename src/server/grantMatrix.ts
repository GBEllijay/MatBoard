import type { Door } from '../lib/entitlementToken.ts';
import { API_PRODUCT_COACH, API_PRODUCT_ID, API_PRODUCT_PRO, API_PRODUCT_STUDENT } from './routes.ts';

const ORDER: readonly Door[] = ['white', 'student', 'coach', 'pro'];

/**
 * The only place that decides which doors a purchase or code opens.
 * Pro opens Student Edition and Coach tools. Pro does not open White.
 * A full owner code already lists all four before this runs.
 */
export function expandGrants(grants: readonly string[]): Door[] {
  const open = new Set<string>(grants);
  if (open.has('pro')) {
    open.add('student');
    open.add('coach');
  }
  return ORDER.filter((door) => open.has(door));
}

export function grantsForProduct(product: string): Door[] {
  if (product === API_PRODUCT_ID) return ['white'];
  if (product === API_PRODUCT_STUDENT) return ['student'];
  if (product === API_PRODUCT_COACH) return ['coach'];
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
