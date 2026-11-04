/**
 * Minimal student hooks for the two student → coach kinds. No card visuals.
 *
 *  - TournamentOutbox: registrations that could not reach Advantage Cloud, with
 *    "Save file for my coach".
 *  - ShareCardWithCoach: after the academy QR sign-up, the student presses
 *    Share. Profile and card fields only; the photo waits for the head coach.
 *    With the parent gate on, the parent PIN approves before it sends.
 */
import { useEffect, useState } from 'react';
import { readProfilePortrait } from '../lib/profilePortrait';
import { photoImageFits } from '../lib/rosterPhotoApproval';
import {
  parentApproveStudentCardShare,
  sendStudentCardShare,
  studentCardShareDraft,
} from '../lib/studentCoachOutbox';
import type { StudentCardShare } from '../lib/studentCardShare';
import {
  markStudentEventSent,
  readStudentOutbox,
  STUDENT_OUTBOX_EVENT,
  tournamentRegistrationFile,
} from '../lib/studentEvents';
import { loadStudentReport } from '../lib/studentEdition';
import { loadAcademyLink } from '../lib/academyPathway';
import { readAcademyLicense } from '../lib/studentInboxClient';
import { readStudentNoPhotos } from '../lib/studentPhotoFlag';

/** The gym takes card shares: Pro or Plus Cloud (academy license) or a gym Drive folder link. */
export function cardShareAvailable(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  return Boolean(loadAcademyLink(storage)) || Boolean(readAcademyLicense(storage));
}

function saveFile(file: { name: string; json: string }): void {
  const url = URL.createObjectURL(new Blob([file.json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function TournamentOutbox() {
  const [items, setItems] = useState(() => readStudentOutbox(localStorage).filter((row) => !row.sent));
  useEffect(() => {
    const refresh = () => setItems(readStudentOutbox(localStorage).filter((row) => !row.sent));
    window.addEventListener(STUDENT_OUTBOX_EVENT, refresh);
    return () => window.removeEventListener(STUDENT_OUTBOX_EVENT, refresh);
  }, []);
  if (!items.length) return null;
  return (
    <section className="ink" aria-label="Tell my coach">
      <p className="student-quiet">
        Your coach sees only the event name, date, division, and that you entered. Nothing from your journal is sent.
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.event.eventId}>
            {item.event.eventName} · {item.event.date}
            <button
              type="button"
              className="ink-btn"
              onClick={() => {
                saveFile(tournamentRegistrationFile(item.event));
                markStudentEventSent(localStorage, item.event.eventId);
              }}
            >
              Save file for my coach
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ShareCardWithCoach({
  label = 'Share my card with my coach',
}: {
  /** Button text. My profile uses 'Upload for coach approval to add to student card'. */
  label?: string;
} = {}) {
  const [share, setShare] = useState<StudentCardShare | null>(null);
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const start = () => {
    // Don't allow photos: the share goes without a photo.
    const portrait = readStudentNoPhotos(localStorage).on ? null : readProfilePortrait();
    const draft = studentCardShareDraft(localStorage, loadStudentReport(localStorage), {
      photo: portrait && photoImageFits(portrait) ? portrait : null,
    });
    if (!draft.ok) {
      setStatus(draft.error === 'not-eligible' ? 'Your gym needs Pro, Plus Cloud, or a gym Drive folder for this.' : 'Add your name first.');
      return;
    }
    setShare(draft.share);
    if (draft.state === 'awaiting-parent') setStatus('A parent approves this before it goes to your coach.');
    else void send(draft.share);
  };

  const send = async (ready: StudentCardShare) => {
    setBusy(true);
    try {
      const result = await sendStudentCardShare(localStorage, ready);
      if (!result.ok) {
        setStatus(result.reason === 'awaiting-parent' ? 'A parent approves this first.' : 'Your gym did not take this card. Ask your coach.');
        return;
      }
      if (result.via === 'file') saveFile(result.file);
      setShare(null);
      setStatus(
        result.via === 'cloud'
          ? 'Sent. Your coach reviews it. Your photo waits for the head coach.'
          : 'Saved a file. Put it in your gym folder or give it to your coach.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ink" aria-label={label}>
      <p className="student-quiet">
        Sends your name, belt, stripes, and gym. Your journal and notes stay on this phone.
      </p>
      {share && share.parent.required && !share.parent.approvedAt ? (
        <label className="ink">
          <span className="ink__label">Parent PIN</span>
          <input aria-label="Parent PIN" type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} />
          <button
            type="button"
            className="ink-btn ink-btn--save"
            disabled={busy}
            onClick={async () => {
              const approved = await parentApproveStudentCardShare(localStorage, share, pin);
              setPin('');
              if (!approved.ok) {
                setStatus(approved.error);
                return;
              }
              setShare(approved.share);
              await send(approved.share);
            }}
          >
            Parent: approve and send
          </button>
        </label>
      ) : (
        <button type="button" className="ink-btn ink-btn--save" disabled={busy} onClick={start}>
          {label}
        </button>
      )}
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}
