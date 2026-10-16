import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DriveHandoffCheck, DriveHandoffGuide, useDriveConnected } from './DriveHandoffGuide';
import {
  DRIVE_HANDOFF_LEAD,
  DRIVE_HANDOFF_MISSING,
  DRIVE_HANDOFF_SAVED,
  pullInviteHandoff,
} from '../lib/driveHandoff';

function acceptFailure(reason: string): string {
  if (reason === 'revoked') return 'This invite was revoked.';
  if (reason === 'signed-out') return 'This seat was signed out on this browser.';
  if (reason === 'storage') return 'This browser could not save the seat.';
  if (reason === 'connect') return DRIVE_HANDOFF_LEAD;
  return DRIVE_HANDOFF_MISSING;
}

/**
 * Another browser opened an invite that is not in its local seat list.
 * Coach and Pro stay locked. The gym folder is the only way the seat arrives.
 */
export function InviteHandoffAccept({ token }: { token: string }) {
  const navigate = useNavigate();
  const connected = useDriveConnected();
  const [note, setNote] = useState('');
  const [checked, setChecked] = useState(false);
  const [needsConnect, setNeedsConnect] = useState(false);

  const check = async () => {
    const result = await pullInviteHandoff(token);
    if (!result.ok) {
      setChecked(false);
      setNeedsConnect(result.reason === 'connect');
      setNote(acceptFailure(result.reason));
      return;
    }
    setChecked(true);
    setNote(DRIVE_HANDOFF_SAVED);
    navigate('/', { replace: true });
  };

  return (
    <main className="home home--pro">
      <div className="home__inner">
        <section className="review-inbox" aria-label="Accept invite">
          <p className="plan-card__kicker">Instructor invite</p>
          <h1>Open this invite</h1>
          <p>{DRIVE_HANDOFF_LEAD}</p>
          <p>
            <Link to="/">Back</Link>
          </p>
          {connected ? <DriveHandoffCheck on={checked} onClick={() => void check()} /> : null}
          {!connected || needsConnect ? <DriveHandoffGuide /> : null}
          {note ? (
            <p role="status">{note}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
