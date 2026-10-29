import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { proEndsNotice, proGraceNotice, subscribeEntitlement } from '../lib/entitlement';

function graceCopy() {
  return proGraceNotice();
}

function endsCopy() {
  return proEndsNotice();
}

/** Full access stays on during the grace week. The lock date is already in the token. */
export function PaymentGraceBanner() {
  const grace = useSyncExternalStore(subscribeEntitlement, graceCopy, () => null);
  const ends = useSyncExternalStore(subscribeEntitlement, endsCopy, () => null);
  if (!grace && !ends) return null;
  const lockLabel = grace?.lockAt ? new Date(grace.lockAt).toLocaleDateString() : '';
  const endLabel = ends?.endsAt ? new Date(ends.endsAt).toLocaleDateString() : '';
  return (
    <p className="buy__status" role="status">
      {grace ? (
        grace.seat ? (
          <>Ask your gym owner to check billing.{lockLabel ? ` Pro locks on ${lockLabel}.` : ''}</>
        ) : (
          <>
            Your payment didn't go through. Update your card.{lockLabel ? ` Pro locks on ${lockLabel}.` : ''}{' '}
            <Link to="/pro/paused">Update payment</Link>
          </>
        )
      ) : (
        <>Pro ends on {endLabel}.</>
      )}
    </p>
  );
}
