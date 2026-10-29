import { PRO_GRACE_DAYS } from './paywallDecisions.ts';
import type { SubscriptionClaim } from '../lib/entitlementToken.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionAccess = {
  state: 'active' | 'grace' | 'locked';
  /** ISO time when a past-due subscription locks. Day 8, seven days after past_due_since. */
  lockAt: string | null;
  /** ISO period end while canceling at period end. */
  endsAt: string | null;
  /** Pro doors stay open. Locked is false. */
  entitled: boolean;
};

export type StoredSubscription = {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  pastDueSince: string | null;
};

const OPEN_STATUSES = new Set(['active', 'trialing']);

/**
 * 7 days of full access from past_due_since. The lock instant is that timestamp
 * plus 7 days (day 8). paused, unpaid, canceled, incomplete, and incomplete_expired
 * are locked. A subscription set to cancel at period end stays open until that end.
 */
export function accessForSubscription(row: StoredSubscription, now: Date): SubscriptionAccess {
  const periodEnd = row.currentPeriodEnd && Number.isFinite(Date.parse(row.currentPeriodEnd)) ? row.currentPeriodEnd : null;
  const endsAt = row.cancelAtPeriodEnd && periodEnd ? periodEnd : null;

  if (OPEN_STATUSES.has(row.status)) {
    if (endsAt && Date.parse(endsAt) <= now.getTime()) {
      return { state: 'locked', lockAt: null, endsAt, entitled: false };
    }
    return { state: 'active', lockAt: null, endsAt, entitled: true };
  }

  if (row.status === 'past_due') {
    const sinceMs = row.pastDueSince ? Date.parse(row.pastDueSince) : Number.NaN;
    if (!Number.isFinite(sinceMs)) {
      return { state: 'grace', lockAt: null, endsAt: null, entitled: true };
    }
    const lockAtMs = sinceMs + PRO_GRACE_DAYS * DAY_MS;
    const lockAt = new Date(lockAtMs).toISOString();
    if (now.getTime() >= lockAtMs) {
      return { state: 'locked', lockAt, endsAt: null, entitled: false };
    }
    return { state: 'grace', lockAt, endsAt: null, entitled: true };
  }

  return { state: 'locked', lockAt: null, endsAt: null, entitled: false };
}

export function claimForAccess(access: SubscriptionAccess): SubscriptionClaim {
  const claim: SubscriptionClaim = { state: access.state };
  if (access.lockAt) claim.lock_at = access.lockAt;
  if (access.endsAt) claim.ends_at = access.endsAt;
  return claim;
}

export type BillingEventKind = 'paid' | 'failed' | 'deleted' | 'upsert' | 'reconcile';

/**
 * First payment failure of a cycle stamps past_due_since. A later failure does not
 * move it. invoice.paid clears it once Stripe shows the subscription active or trialing.
 */
export function nextPastDueSince(input: {
  previous: string | null;
  eventKind: BillingEventKind;
  status: string;
  now: Date;
}): string | null {
  if (input.eventKind === 'failed') return input.previous ?? input.now.toISOString();
  const open = OPEN_STATUSES.has(input.status);
  if (open) return null;
  if (input.eventKind === 'paid') return input.previous;
  if (input.status === 'past_due' && !input.previous) return input.now.toISOString();
  return input.previous;
}
