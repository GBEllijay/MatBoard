import { useState } from 'react';
import { parentGateOn, readParentGate } from '../lib/parentGate';
import { createPhotoSubmission, parentApprovePhoto } from '../lib/rosterPhotoApproval';
import { readInboxPass, studentIdFromInboxPass, submitStudentPhoto } from '../lib/studentInboxClient';
import { readStudentNoPhotos } from '../lib/studentPhotoFlag';
import { recordPhotoSent, showStudentToast } from '../lib/studentAlerts';

/**
 * Student → head coach profile photo. When Parent approvals is on, a parent
 * enters the PIN first. The head coach approves on their device; nothing is
 * published automatically.
 */
export function SendPhotoToCoach({ portrait }: { portrait: string | null }) {
  const [pin, setPin] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pass = readInboxPass(localStorage);
  const studentId = pass ? studentIdFromInboxPass(pass) : null;
  // Don't allow photos (student or parent) blocks the send entirely.
  if (!portrait || !pass || !studentId || readStudentNoPhotos(localStorage).on) return null;
  const parentRequired = parentGateOn(localStorage);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const created = createPhotoSubmission({ studentId, image: portrait, parentRequired });
      if (!created.ok) {
        setNote(created.error);
        return;
      }
      let submission = created.submission;
      if (parentRequired) {
        const stamped = await parentApprovePhoto(submission, pin, readParentGate(localStorage).pinHash);
        if (!stamped.ok) {
          setNote(stamped.error);
          return;
        }
        submission = stamped.submission;
      }
      const sent = await submitStudentPhoto(pass, submission);
      if (sent.ok) {
        // Lets the photo notice show this profile when the coach decides.
        recordPhotoSent(localStorage, submission.photoId);
        showStudentToast('Photo sent to your coach');
      }
      setNote(
        sent.ok
          ? 'Sent. Your head coach approves it before it shows on your card. You’ll see a note here when they decide.'
          : sent.reason === 'unbound' || sent.reason === 'offline'
            ? 'Advantage Cloud is not connected. Try again later.'
            : 'Your coach’s gym could not take this photo.',
      );
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-photo__send">
      {parentRequired ? (
        <label>
          Parent PIN
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Parent PIN for photo"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
          />
        </label>
      ) : null}
      <button type="button" className="profile-action profile-action--quiet" disabled={busy} onClick={() => void send()}>
        Send photo to coach
      </button>
      {note ? <p role="status">{note}</p> : null}
    </div>
  );
}
