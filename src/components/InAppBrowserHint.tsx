import { useState } from 'react';
import { IN_APP_HINT_DISMISS_KEY, inAppBrowserHintText, isInAppBrowser } from '../lib/inAppBrowser';

function dismissed(): boolean {
  try {
    return sessionStorage.getItem(IN_APP_HINT_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Small banner only inside in-app browsers: Open in Safari / Add to Home Screen. */
export function InAppBrowserHint() {
  const [hidden, setHidden] = useState(() => !isInAppBrowser() || dismissed());
  if (hidden) return null;
  return (
    <div className="in-app-hint" role="note">
      <span>{inAppBrowserHintText()}</span>
      <button
        type="button"
        className="home__text-btn"
        onClick={() => {
          try {
            sessionStorage.setItem(IN_APP_HINT_DISMISS_KEY, '1');
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
