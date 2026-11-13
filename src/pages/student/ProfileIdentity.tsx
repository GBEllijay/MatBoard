import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { DeviceMediaInput } from '../../components/DeviceMediaInput';
import { SendPhotoToCoach } from '../../components/SendPhotoToCoach';
import { useStudentNoPhotos } from '../../components/rosterCard/StudentNoPhotos';
import { beltModeOf } from '../../lib/beltBook';
import { PHOTO_PICKER_ACCEPT } from '../../lib/mediaPicker';
import { headerVisibility, readProfileMarks, writeProfileMark, type ProfileMark } from '../../lib/profileMarks';
import { localPhotoError } from '../../lib/localPhotoError';
import { clearProfilePortrait, portraitFromFile, readProfilePortrait, saveProfilePortrait } from '../../lib/profilePortrait';
import type { StudentProgressReport } from '../../lib/progress/types';
import { useStudentPath } from './chrome';
import { SaveConfirm } from './SaveConfirm';

const PORTRAIT_CAPTURE = 'profile-portrait-capture';
const PORTRAIT_LIBRARY = 'profile-portrait-library';
/**
 * Optional photo on My profile. The photo stays on this phone.
 * Gym logo upload was removed (owner, Nov 13 2026); saved logo data is left unused.
 * The picture sits in the top-right corner. These controls stay in the cards.
 */
export function useProfileMedia() {
  const portraitCapture = useRef<HTMLInputElement>(null);
  const portraitLibrary = useRef<HTMLInputElement>(null);
  const [portrait, setPortrait] = useState<string | null>(() => readProfilePortrait());
  const [portraitNote, setPortraitNote] = useState('');
  const [portraitSaved, setPortraitSaved] = useState(0);
  const [portraitError, setPortraitError] = useState('');

  const onPortrait = async (files: readonly File[]) => {
    const file = files[0];
    setPortraitNote('');
    setPortraitSaved(0);
    if (!file) {
      setPortraitError('No photo was selected. Choose a photo and try again.');
      return;
    }
    try {
      const saved = await portraitFromFile(file);
      await saveProfilePortrait(saved);
      setPortrait(saved);
      setPortraitError('');
      setPortraitNote('Saved on this phone. Shows on your profile.');
      setPortraitSaved((pulse) => pulse + 1);
    } catch (err) {
      setPortraitSaved(0);
      setPortraitError(localPhotoError(err, 'photo'));
    }
  };


  return {
    portrait,
    onPortrait,
    removePortrait: () => {
      void clearProfilePortrait();
      setPortrait(null);
      setPortraitError('');
      setPortraitSaved(0);
      setPortraitNote('Photo removed from this phone.');
    },
    portraitNote,
    portraitSaved,
    portraitError,
    portraitCapture,
    portraitLibrary,
  };

}

/** Small circle at the top right: the photo, or a kid's gym name. Never a logo on the student card. */
export function ProfileCornerMarks({
  portrait,
  name = '',
}: {
  portrait: string | null;
  name?: string;
}) {
  if (!portrait && !name) return null;
  return (
    <div className="profile-corner">
      {portrait ? <img src={portrait} alt="Profile photo" /> : null}
      {!portrait && name ? <span className="profile-corner__name">{name}</span> : null}
    </div>
  );
}

function FieldAlert({ id, message }: { id: string; message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof node.scrollIntoView !== 'function') return;
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [message]);
  return (
    <p ref={ref} id={id} className="profile-photo__error" role="alert">
      {message}
    </p>
  );
}

export function ProfileMedia({ media, kids = false }: { media: ReturnType<typeof useProfileMedia>; kids?: boolean }) {
  const { portrait, onPortrait, removePortrait } = media;
  const noPhotos = useStudentNoPhotos();
  return (
    <div className="profile-identity">
      <section
        className="profile-card profile-photo"
        aria-label="Profile photo"
        aria-describedby={media.portraitError ? 'profile-portrait-error' : undefined}
      >
        {portrait ? <img className="profile-avatar" src={portrait} alt="Profile photo" /> : null}
        <div className="profile-photo__copy">
          <h2>Photo</h2>
          <p>
            {kids
              ? 'Stays on this phone and shows on your profile. Nothing is uploaded. A parent can turn it on for reports.'
              : 'Optional. Stays on this phone and shows on your profile. Nothing is uploaded unless you export a report or a backup with the switch on.'}
          </p>
        </div>
        <div className="profile-photo__actions">
          <label className="profile-action" htmlFor={PORTRAIT_CAPTURE}>
            Take photo
          </label>
          <label className="profile-action" htmlFor={PORTRAIT_LIBRARY}>
            {portrait ? 'Change photo' : 'Choose photo'}
          </label>
          {portrait ? (
            <button type="button" className="profile-action profile-action--quiet" onClick={removePortrait}>
              Remove photo
            </button>
          ) : null}
        </div>
        {media.portraitError ? <FieldAlert id="profile-portrait-error" message={media.portraitError} /> : null}
        {media.portraitSaved && media.portraitNote ? (
          <SaveConfirm message={media.portraitNote} token={media.portraitSaved} />
        ) : media.portraitNote ? (
          <p className="student-quiet" role="status">
            {media.portraitNote}
          </p>
        ) : null}
        {noPhotos.on ? (
          <p className="profile-nophotos" data-testid="profile-no-photos">
            <strong>No photos</strong> · nothing is sent to your coach.
          </p>
        ) : (
          <SendPhotoToCoach portrait={portrait} />
        )}
      </section>

      {typeof document === 'undefined'
        ? null
        : createPortal(
            <>
              <DeviceMediaInput
                id={PORTRAIT_CAPTURE}
                inputRef={media.portraitCapture}
                accept={PHOTO_PICKER_ACCEPT}
                capture="user"
                onFiles={onPortrait}
              />
              <DeviceMediaInput
                id={PORTRAIT_LIBRARY}
                inputRef={media.portraitLibrary}
                accept={PHOTO_PICKER_ACCEPT}
                onFiles={onPortrait}
              />
            </>,
            document.body,
          )}
    </div>
  );
}

export function ProfileSwitches({ report }: { report: StudentProgressReport }) {
  const to = useStudentPath();
  const [marks, setMarks] = useState(() => readProfileMarks());
  const [note, setNote] = useState('');
  const mode = beltModeOf(report);
  const visible = headerVisibility(mode, marks);
  const kids = mode === 'kids';

  const toggle = (mark: ProfileMark) => {
    setMarks(writeProfileMark(mode, mark, !visible[mark]));
    setNote('Saved on this phone.');
  };

  return (
    <section className="profile-card" aria-label="Report switches">
      <p className="profile-mode">
        These switches follow {kids ? 'Kids' : 'Adult'} on <Link to={to('/student/rank')}>My rank</Link>.
      </p>
      <ProfileSwitch
        on={visible.selfie}
        label="Photo on reports and backups"
        note={
          kids
            ? 'Off for kids until a parent turns this on. It stays off kids reports until then.'
            : 'Off until you turn it on. Adult reports only.'
        }
        onToggle={() => toggle('selfie')}
      />
      {note ? (
        <p className="student-quiet profile-switch-status" role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}

export function ProfileSwitch({
  on,
  label,
  note,
  onToggle,
}: {
  on: boolean;
  label: string;
  note: string;
  onToggle: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} className="profile-switch" onClick={onToggle}>
      <span className="profile-switch__copy">
        <span className="profile-switch__label">{label}</span>
        <span className="profile-switch__note">{note}</span>
      </span>
      <span className={on ? 'profile-switch__track is-on' : 'profile-switch__track'} aria-hidden="true">
        <span />
      </span>
    </button>
  );
}
