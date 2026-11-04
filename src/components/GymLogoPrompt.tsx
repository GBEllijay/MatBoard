import { useEffect, useState } from 'react';
import { COACH_UPDATE_EVENT } from '../lib/coachRankUpdate';
import {
  acceptGymLogoUpdate,
  GYM_LOGO_PROMPT,
  gymLogoPromptDue,
  ignoreGymLogoUpdate,
  readGymLogoSync,
} from '../lib/studentGymMark';

/**
 * Non-blocking note when the gym sent a newer logo. Update shows it.
 * Ignore keeps the current logo and hides this note until the next new logo.
 * The student can change the logo at any time in Profile.
 */
export function GymLogoPrompt() {
  const [due, setDue] = useState(() => gymLogoPromptDue(localStorage));

  useEffect(() => {
    const reload = () => setDue(gymLogoPromptDue(localStorage));
    window.addEventListener(COACH_UPDATE_EVENT, reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(COACH_UPDATE_EVENT, reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

  if (!due) return null;
  const latest = readGymLogoSync(localStorage).latest;
  if (!latest) return null;

  return (
    <aside className="coach-update coach-update--logo" role="status" aria-label="Gym logo update">
      <img src={latest.dataUrl} alt="" width={48} height={48} />
      <p>{GYM_LOGO_PROMPT}</p>
      <div className="coach-update__actions">
        <button
          type="button"
          className="ink-btn ink-btn--save"
          onClick={() => {
            acceptGymLogoUpdate(localStorage);
            setDue(false);
          }}
        >
          Update
        </button>
        <button
          type="button"
          className="ink-btn"
          onClick={() => {
            ignoreGymLogoUpdate(localStorage);
            setDue(false);
          }}
        >
          Ignore
        </button>
      </div>
    </aside>
  );
}
