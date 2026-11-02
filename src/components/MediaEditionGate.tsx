import type { ReactNode } from 'react';
import { MediaEditionPage } from '../pages/MediaEdition';
import { PaidMediaEditionPage } from './PaidScreen';
import { EntitlementWait } from './GuardRedirect';
import { useEntitlementSettled } from '../hooks/useEntitlementSettled';

/**
 * /media. An open Media Console door (Pro or owner today) loads the paid Media
 * Edition console through the paid-screen import. A locked visitor gets the
 * public $29.99 alpha marketing page instead, never the paid chunk or a 401.
 * `paid` is only swapped in tests. While a saved pass is still being checked
 * (refresh, deep link, cold offline open) a closed door shows a neutral wait
 * screen instead of flashing the marketing page.
 */
export function MediaEditionGate({ open, paid }: { open: boolean; paid?: ReactNode }) {
  const settled = useEntitlementSettled();
  if (!open && !settled) return <EntitlementWait />;
  if (!open) return <MediaEditionPage />;
  return <>{paid ?? <PaidMediaEditionPage />}</>;
}
