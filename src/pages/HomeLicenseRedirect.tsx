import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useEntitlementSettled } from '../hooks/useEntitlementSettled';
import { useHasSavedAdvantageAccess } from '../hooks/useHasSavedAdvantageAccess';
import { PRODUCTS_PATH } from '../lib/productNames';

/**
 * On `/`, send a device with saved Advantage access to `/products`.
 * Wait while a stored entitlement pass is still being checked so the
 * marketing homepage does not flash first. Preview-only White does not
 * count as saved access (see hasSavedAdvantageAccess).
 */
export function HomeLicenseRedirect({ children }: { children: ReactNode }) {
  const settled = useEntitlementSettled();
  const saved = useHasSavedAdvantageAccess();
  if (saved) return <Navigate to={PRODUCTS_PATH} replace />;
  if (!settled) return null;
  return children;
}
