import { Navigate } from 'react-router-dom';
import { useEntitlementSettled } from '../hooks/useEntitlementSettled';
import { guardOutcome } from '../lib/guardWait';

/** Neutral screen while the saved pass is checked. No paid content renders here. */
export function EntitlementWait() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="entitlement-wait"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: '#0b0d10',
        color: '#9aa4b2',
        fontSize: '1rem',
      }}
    >
      Checking your pass…
    </div>
  );
}

/**
 * Drop-in for `<Navigate to=... replace />` inside a closed route guard.
 * Waits for the saved pass check to finish before leaving the page.
 */
export function GuardRedirect({ to }: { to: string }) {
  const settled = useEntitlementSettled();
  if (guardOutcome(false, settled) === 'wait') return <EntitlementWait />;
  return <Navigate to={to} replace />;
}
