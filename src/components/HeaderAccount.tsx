import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ACCOUNT_PATH, LOGIN_EVENT, readLoginHint } from '../lib/emailLogin';
import { accountButtonBlocked } from '../lib/optionsReopenGuard';
import { isSheetLayerOpen, subscribeSheetLayer } from '../lib/sheetLayer';

/**
 * Paths that already have a top-right Sign in / Account control, or are a TV display.
 * The round timer (/training) is the TV display like /match: its top-right corner
 * belongs to Fullscreen and the Training options Close.
 */
const HIDDEN_PATHS = new Set(['/', '/match', '/training']);

/**
 * Top-right account control for app pages.
 * Signed out: "Sign in". Signed in: "Account". Both open /account.
 * Hidden on the public storefront, which already has this control in its header.
 */
export function HeaderAccount() {
  const { pathname } = useLocation();
  const [hint, setHint] = useState(() => readLoginHint());
  useEffect(() => {
    const update = () => setHint(readLoginHint());
    window.addEventListener(LOGIN_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(LOGIN_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  // Any open sheet owns the top-right corner (its Close). Do not rely on CSS :has() alone.
  const sheetOpen = useSyncExternalStore(subscribeSheetLayer, isSheetLayerOpen, () => false);
  if (HIDDEN_PATHS.has(pathname) || sheetOpen) return null;
  return (
    <Link
      className="header-account"
      to={ACCOUNT_PATH}
      aria-label={hint ? 'Account' : 'Sign in'}
      title={hint ? `Signed in as ${hint}` : 'Sign in with your email'}
      onClick={(event) => {
        if (isSheetLayerOpen() || accountButtonBlocked()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <svg className="header-account__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <circle cx="12" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5.2 19c.8-3.4 3.4-5.2 6.8-5.2s6 1.8 6.8 5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="header-account__label">{hint ? 'Account' : 'Sign in'}</span>
    </Link>
  );
}
