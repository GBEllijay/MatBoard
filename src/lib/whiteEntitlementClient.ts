import { WHITE_ENTITLEMENT_API } from './whitePurchase.ts';

export type WhiteEntitlementStatus = {
  entitled: boolean;
  product?: string;
  email?: string;
  sessionId?: string;
  createdAt?: string;
};

/** Ask /api/entitlement whether this Checkout session or purchase email owns Advantage White. */
export async function lookupWhiteEntitlement(query: {
  sessionId?: string;
  email?: string;
}): Promise<WhiteEntitlementStatus> {
  const params = new URLSearchParams();
  if (query.sessionId) params.set('session_id', query.sessionId);
  if (query.email) params.set('email', query.email);
  const response = await fetch(`${WHITE_ENTITLEMENT_API}?${params.toString()}`);
  if (!response.ok) return { entitled: false };
  const body = (await response.json()) as WhiteEntitlementStatus;
  return {
    entitled: Boolean(body.entitled),
    product: typeof body.product === 'string' ? body.product : undefined,
    email: typeof body.email === 'string' ? body.email : undefined,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : undefined,
  };
}
