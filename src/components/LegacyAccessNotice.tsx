import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { entitlementSnapshot, subscribeEntitlement } from '../lib/entitlement';
import {
  LEGACY_NOTICE_DISMISSED_KEY,
  LEGACY_NOTICE_KEY,
  legacyUnlockPresent,
} from '../lib/legacyUnlock';

function showNotice(): boolean {
  const snapshot = entitlementSnapshot();
  if (!snapshot.amnesty || snapshot.claims) return false;
  try {
    if (localStorage.getItem(LEGACY_NOTICE_DISMISSED_KEY) === '1') return false;
    if (localStorage.getItem(LEGACY_NOTICE_KEY) !== '1' && !legacyUnlockPresent()) return false;
  } catch {
    return false;
  }
  return legacyUnlockPresent();
}

/** One dismissible note. It does not change photos, journals, or cloud bindings. */
export function LegacyAccessNotice() {
  const visible = useSyncExternalStore(subscribeEntitlement, showNotice, () => false);
  if (!visible) return null;
  return (
    <p className="buy__status" role="status">
      Confirm your access before the saved unlock on this browser stops counting.{' '}
      <Link to="/restore">Restore</Link>
      {' · '}
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => {
          try {
            localStorage.setItem(LEGACY_NOTICE_DISMISSED_KEY, '1');
          } catch {
            /* ignore */
          }
          window.dispatchEvent(new Event('advantage-access'));
        }}
      >
        Dismiss
      </button>
    </p>
  );
}
