/**
 * Read-only support reference. Not an input and not a recovery code.
 */
import { createElement, type ReactNode } from 'react';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function AccountReference({ id }: { id: string | null | undefined }): ReactNode {
  const value = typeof id === 'string' ? id.trim().toLowerCase() : '';
  if (!ID.test(value)) return null;
  return createElement(
    'p',
    { className: 'account-reference', 'data-testid': 'account-reference' },
    'Account reference ',
    createElement('span', { 'data-testid': 'account-reference-id' }, value),
    '. For support. You do not need to type this.',
  );
}
