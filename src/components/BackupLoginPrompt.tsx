import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LOGIN_EVENT, readLoginHint } from '../lib/emailLogin';
import {
  BACKUP_PROMPT_ACCOUNT_PATH,
  BACKUP_PROMPT_BODY,
  BACKUP_PROMPT_TITLE,
  backupLoginPromptVisible,
  deviceHasLocalData,
  readBackupPromptSnooze,
  snoozeBackupPrompt,
} from '../lib/backupLoginPrompt';
import { privateBrowsingCheck } from '../lib/privateBrowsing';
import { studentDemoRequested } from '../lib/studentDemo';

function browserStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Friendly "Create a login to back up" card for the two home screens.
 * Only when this browser has a saved profile/roster and nobody is signed in.
 * "Not now" hides it for about a week. Not a modal; nothing else waits on it.
 */
export function BackupLoginPrompt() {
  const [hint, setHint] = useState(() => readLoginHint());
  const [snoozedUntil, setSnoozedUntil] = useState(() => readBackupPromptSnooze(browserStore()));
  const [hasData] = useState(() => deviceHasLocalData(browserStore()));
  const [privateBrowsing, setPrivateBrowsing] = useState(false);
  useEffect(() => {
    const update = () => setHint(readLoginHint());
    window.addEventListener(LOGIN_EVENT, update);
    window.addEventListener('storage', update);
    let live = true;
    void privateBrowsingCheck().then((verdict) => {
      if (live && verdict.private) setPrivateBrowsing(true);
    });
    return () => {
      live = false;
      window.removeEventListener(LOGIN_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  const visible = backupLoginPromptVisible({
    signedIn: Boolean(hint),
    hasData,
    snoozedUntil,
    now: Date.now(),
    demo: studentDemoRequested(),
    privateBrowsing,
  });
  if (!visible) return null;
  return (
    <aside className="backup-prompt" aria-label="Back up your profile" data-testid="backup-login-prompt">
      <p className="backup-prompt__title">
        <strong>{BACKUP_PROMPT_TITLE}</strong>
      </p>
      <p className="backup-prompt__body">{BACKUP_PROMPT_BODY}</p>
      <p className="backup-prompt__actions">
        <Link className="btn btn--white backup-prompt__go" to={BACKUP_PROMPT_ACCOUNT_PATH}>
          Create a login
        </Link>
        <button type="button" className="home__text-btn" onClick={() => setSnoozedUntil(snoozeBackupPrompt(browserStore()))}>
          Not now
        </button>
      </p>
    </aside>
  );
}
