import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PRIVATE_BANNER_DISMISS_KEY, privateBrowsingCheck, privateBrowsingText, requestPersistentStorage } from '../lib/privateBrowsing';

/** The scoreboard and round timer (TV displays and their controllers) keep their whole screen. */
function timerOrScoreboard(pathname: string): boolean {
  return /^\/(match|training)(\/|$)/.test(pathname);
}

function dismissed(): boolean {
  try {
    return sessionStorage.getItem(PRIVATE_BANNER_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Warns once per tab when the browser is clearly in private / incognito mode, where
 * nothing Advantage saves will survive closing the tab. Silent when unsure.
 * Also asks the browser to keep this site's storage where that is quiet to ask.
 */
export function PrivateBrowsingBanner() {
  const { pathname } = useLocation();
  const [isPrivate, setIsPrivate] = useState(false);
  const [hidden, setHidden] = useState(() => dismissed());
  useEffect(() => {
    let live = true;
    void privateBrowsingCheck().then((verdict) => {
      if (!live) return;
      if (verdict.private) setIsPrivate(true);
      else void requestPersistentStorage();
    });
    return () => {
      live = false;
    };
  }, []);
  if (!isPrivate || hidden || timerOrScoreboard(pathname)) return null;
  return (
    <div className="in-app-hint private-hint" role="alert" data-testid="private-browsing-banner">
      <span>
        {privateBrowsingText(typeof navigator === 'undefined' ? '' : navigator.userAgent)}{' '}
        <Link className="home__text-btn" to="/faq#private-browsing">
          Why?
        </Link>
      </span>
      <button
        type="button"
        className="home__text-btn"
        onClick={() => {
          try {
            sessionStorage.setItem(PRIVATE_BANNER_DISMISS_KEY, '1');
          } catch {
            /* still hide */
          }
          setHidden(true);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
