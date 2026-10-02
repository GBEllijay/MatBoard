import type { ReactNode } from 'react';

/** Hide a Coach control completely. Unpermitted tools are not disabled or teased. */
export function CollaborationGate({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}): ReactNode {
  if (!show) return null;
  return children;
}
