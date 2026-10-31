import type { ReactNode } from 'react';
import { MediaEditionPage } from '../pages/MediaEdition';
import { PaidMediaEditionPage } from './PaidScreen';

/**
 * /media. An open Media Console door (Pro or owner today) loads the paid Media
 * Edition console through the paid-screen import. A locked visitor gets the
 * public $29.99 alpha marketing page instead, never the paid chunk or a 401.
 * `paid` is only swapped in tests.
 */
export function MediaEditionGate({ open, paid }: { open: boolean; paid?: ReactNode }) {
  if (!open) return <MediaEditionPage />;
  return <>{paid ?? <PaidMediaEditionPage />}</>;
}
