/**
 * Student Edition: Don't allow photos. With Parent approvals on, the parent PIN is
 * required to set or clear it. The change is a small file packet for the coach
 * (studentPhotoFlagFile); the coach imports it in Student updates and the card
 * shows No photos · Set by family. Cloud delivery is not wired yet (file only).
 */
import { useEffect, useState } from 'react';
import { parentGateOn } from '../../lib/parentGate';
import { readInboxPass, studentIdFromInboxPass } from '../../lib/studentInboxClient';
import { readStudentNoPhotos, setStudentNoPhotos, STUDENT_NO_PHOTOS_EVENT, studentPhotoFlagFile, type StudentPhotoFlag } from '../../lib/studentPhotoFlag';
import { downloadJsonFile } from './fileSave';

export function useStudentNoPhotos(): StudentPhotoFlag {
  const [flag, setFlag] = useState(() => readStudentNoPhotos(localStorage));
  useEffect(() => {
    const refresh = () => setFlag(readStudentNoPhotos(localStorage));
    window.addEventListener(STUDENT_NO_PHOTOS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(STUDENT_NO_PHOTOS_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return flag;
}

export function StudentNoPhotosSwitch({ studentId }: { studentId: string }) {
  const flag = useStudentNoPhotos();
  const gated = parentGateOn(localStorage);
  const [asking, setAsking] = useState(false);
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const apply = async () => {
    const pass = readInboxPass(localStorage);
    const id = (pass && studentIdFromInboxPass(pass)) || studentId;
    const result = await setStudentNoPhotos(localStorage, !flag.on, { studentId: id, pin });
    setPin('');
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAsking(false);
    setError('');
    if (result.packet) {
      const file = studentPhotoFlagFile(result.packet);
      downloadJsonFile(file.name, file.json);
      setStatus(
        result.flag.on
          ? 'Saved. Give this file to your coach, or put it in your gym folder. No photos are shared from this phone.'
          : 'Photos allowed. Give this file to your coach so the card updates.',
      );
    } else {
      setStatus('Saved on this phone.');
    }
  };

  return (
    <section className="profile-card" aria-label="Photo permission">
      <button
        type="button"
        role="switch"
        aria-checked={flag.on}
        className="profile-switch"
        onClick={() => {
          setStatus('');
          if (gated) setAsking(true);
          else void apply();
        }}
      >
        <span className="profile-switch__copy">
          <span className="profile-switch__label">Don&apos;t allow photos</span>
          <span className="profile-switch__note">
            {flag.on
              ? `On${flag.setBy === 'parent' ? ' · set by a parent' : ''}. Your coach's card shows No photos, and no photo is sent.`
              : 'Your coach sees No photos on your card. Only you or a parent can turn it off.'}
          </span>
        </span>
        <span className={flag.on ? 'profile-switch__track is-on' : 'profile-switch__track'} aria-hidden="true">
          <span />
        </span>
      </button>
      {asking ? (
        <label className="profile-row">
          <span className="ink__label">Parent PIN</span>
          <input
            aria-label="Parent PIN for photo permission"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
          />
          <button type="button" className="ink-btn ink-btn--save" onClick={() => void apply()}>
            Parent: confirm
          </button>
        </label>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {status ? (
        <p className="student-quiet" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
