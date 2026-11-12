/**
 * Coach connect QR: one academy-wide code on Advantage Cloud.
 * Shows with Advantage Cloud, with or without a Drive or OneDrive folder.
 *
 *  - Owner (Binders, and Instructor Edition › Connect to my academy): show the
 *    code, copy the link, and Replace it.
 *  - Instructor seat (Instructor Edition › Connect to my academy): the same
 *    code, read only. No Replace. A seat never makes or replaces it.
 */
import { useEffect, useState } from 'react';
import { useGymName } from '../hooks/useGymBrand';
import { useProPlusCloudUnlocked } from '../hooks/useProPlusCloud';
import {
  fetchCurrentCoachConnect,
  issueCoachConnect,
  readSavedCoachConnect,
  type SavedCoachConnect,
} from '../lib/coachConnect';
import { entitlementSnapshot } from '../lib/entitlement';
import { qrDataUrl } from '../lib/qr';

export const COACH_CONNECT_TITLE = 'Coach connect QR';
export const COACH_CONNECT_CREATE = 'Show coach connect QR';
export const COACH_CONNECT_ROTATE = 'Replace this QR';
export const COACH_CONNECT_ROTATE_CONFIRM = 'Replace QR — old one stops working';
export const COACH_CONNECT_NEEDS_CLOUD = 'The coach connect QR needs Advantage Cloud. No Drive folder is needed.';
export const COACH_CONNECT_SEAT_WAITING =
  'Your gym owner has not shown the coach connect QR yet. Ask them to open it once under Binders, then it shows here too.';

/** This browser is signed in as an instructor seat, not the owner. */
export function seatViewerNow(ownerCloud: boolean): boolean {
  const claims = entitlementSnapshot().claims;
  if (ownerCloud) return false;
  return Boolean(claims && (claims.src === 'seat' || claims.tier === 'seat'));
}

export function CoachConnectQrPanel({
  hideWithoutCloud = false,
  onCloud,
}: {
  /** Instructor Edition: render nothing (the Drive pathway stays) when the academy has no Cloud. */
  hideWithoutCloud?: boolean;
  /** Tells the page whether the academy has Cloud, so it can put the Drive pathway second. */
  onCloud?: (on: boolean) => void;
} = {}) {
  const ownerCloud = useProPlusCloudUnlocked();
  const seatViewer = seatViewerNow(ownerCloud);
  const gymName = useGymName();
  const [saved, setSaved] = useState<SavedCoachConnect | null>(() => (seatViewer ? null : readSavedCoachConnect(localStorage)));
  const [seatState, setSeatState] = useState<'loading' | 'ok' | 'none' | 'no-cloud'>('loading');
  const [src, setSrc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [note, setNote] = useState('');

  // Seat: read the academy's current code. Owner with nothing saved here: pick up the code made on another device.
  useEffect(() => {
    if (!seatViewer && (!ownerCloud || saved)) return;
    let alive = true;
    void fetchCurrentCoachConnect({ origin: window.location.origin }).then((result) => {
      if (!alive) return;
      if (result.ok) {
        setSaved(result.saved);
        setSeatState('ok');
        return;
      }
      setSeatState(result.reason === 'none' ? 'none' : 'no-cloud');
    });
    return () => {
      alive = false;
    };
    // Runs once per role; saved changes after this never refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatViewer, ownerCloud]);

  useEffect(() => {
    if (!saved) {
      setSrc('');
      return;
    }
    let alive = true;
    void qrDataUrl(saved.link).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [saved]);

  const cloud = seatViewer ? seatState === 'ok' || seatState === 'none' : ownerCloud;
  const known = seatViewer ? seatState !== 'loading' : true;
  useEffect(() => {
    if (known) onCloud?.(cloud);
  }, [cloud, known, onCloud]);

  if (!cloud) {
    if (hideWithoutCloud) return null;
    return (
      <section className="invite-form coach-connect" aria-label={COACH_CONNECT_TITLE}>
        <strong>{COACH_CONNECT_TITLE}</strong>
        <p className="invite-form__note">{seatViewer && !known ? 'Checking Advantage Cloud…' : COACH_CONNECT_NEEDS_CLOUD}</p>
      </section>
    );
  }

  const create = async (rotate: boolean) => {
    setBusy(true);
    setError('');
    setNote('');
    setCopied(false);
    setConfirmRotate(false);
    const result = await issueCoachConnect({ gymName, origin: window.location.origin, rotate });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(result.saved);
    if (rotate) setNote('New QR is ready. The old QR and link no longer work. Instructors already connected stay connected.');
  };

  const copy = async () => {
    if (!saved) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard');
      await navigator.clipboard.writeText(saved.link);
      setCopied(true);
    } catch {
      setCopied(false);
      setError('Select the link and copy it from there.');
    }
  };

  return (
    <section className="invite-form coach-connect" aria-label={COACH_CONNECT_TITLE}>
      <p className="invite-form__kicker">{seatViewer ? 'Your academy · Advantage Cloud' : 'Owner only · Advantage Cloud'}</p>
      <strong>{COACH_CONNECT_TITLE}</strong>
      <span className="invite-form__note">
        One QR for your whole academy. Every instructor scans the same code on Connect to my academy, and it keeps
        working until {seatViewer ? 'the owner replaces' : 'you replace'} it. Their phone joins the academy on Advantage
        Cloud, with no Drive or OneDrive folder. Their card then comes to the owner&apos;s Roster for assessments and
        promotions. This QR does not use or give an instructor seat. A Coach or Instructors seat invite is still what
        lets an instructor review students&apos; cards and send assessments. Nothing is billed.
      </span>
      {saved ? (
        <div className="invite-link" role="status">
          {src ? <img className="invite-link__qr" src={src} alt="Coach connect QR" width={180} height={180} /> : null}
          <div className="invite-link__copy">
            <p>{saved.gymName ? `${saved.gymName} · ` : ''}Academy-wide · reusable · works until {seatViewer ? 'the owner replaces' : 'you replace'} it.</p>
            <label>
              Coach connect link
              <input readOnly value={saved.link} onFocus={(event) => event.currentTarget.select()} />
            </label>
            <button type="button" className="btn btn--ghost" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy coach connect link'}
            </button>
          </div>
        </div>
      ) : null}
      {seatViewer ? (
        saved ? null : <p className="invite-form__note">{COACH_CONNECT_SEAT_WAITING}</p>
      ) : !saved ? (
        <button type="button" className="btn" disabled={busy} onClick={() => void create(false)}>
          {busy ? 'Making QR…' : COACH_CONNECT_CREATE}
        </button>
      ) : confirmRotate ? (
        <div className="invite-actions" role="group" aria-label="Replace coach connect QR">
          <p>Use this if the QR leaked. Anyone not yet connected needs the new QR.</p>
          <button type="button" className="btn" disabled={busy} onClick={() => void create(true)}>
            {COACH_CONNECT_ROTATE_CONFIRM}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmRotate(false)}>
            Keep this QR
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setConfirmRotate(true)}>
          {COACH_CONNECT_ROTATE}
        </button>
      )}
      {note ? <p role="status">{note}</p> : null}
      {error ? (
        <p className="invite-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
