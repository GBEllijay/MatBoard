import { WHITE_ENTITLEMENT_API } from './whitePurchase.ts';

export type WhiteEntitlementStatus = {
  entitled: boolean;
  email?: string;
  sessionId?: string;
  createdAt?: string;
};

/** Later screens can call this to see if Advantage White was purchased. */
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
    email: typeof body.email === 'string' ? body.email : undefined,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : undefined,
  };
}
