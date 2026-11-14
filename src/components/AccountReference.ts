/**
 * Read-only support reference. Not an input and not a recovery code.
 * Buy and restore pages show the id as text. The instructor sheet uses a
 * copy control instead of displaying the raw string.
 */
import { createElement, useState, type ReactNode } from 'react';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function normalizedId(id: string | null | undefined): string {
  const value = typeof id === 'string' ? id.trim().toLowerCase() : '';
  return ID.test(value) ? value : '';
}

export function AccountReference({ id }: { id: string | null | undefined }): ReactNode {
  const value = normalizedId(id);
  if (!value) return null;
  return createElement(
    'p',
    { className: 'account-reference', 'data-testid': 'account-reference' },
    'Account reference ',
    createElement('span', { 'data-testid': 'account-reference-id' }, value),
    '. For support. You do not need to type this.',
  );
}

export function CopyAccountReference({ id }: { id: string | null | undefined }): ReactNode {
  const value = normalizedId(id);
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const onCopy = () => {
    const writer = typeof navigator !== 'undefined' ? navigator.clipboard?.writeText : undefined;
    const done = () => setCopied(true);
    if (typeof writer === 'function') {
      void Promise.resolve(writer.call(navigator.clipboard, value)).then(done, done);
      return;
    }
    done();
  };

  return createElement(
    'p',
    { className: 'ip-account-copy', 'data-testid': 'account-reference-copy' },
    createElement(
      'button',
      {
        type: 'button',
        className: 'ip-account-copy__btn',
        'data-testid': 'account-reference-copy-btn',
        onClick: onCopy,
      },
      copied ? 'Copied' : 'Copy account reference',
    ),
  );
}
