import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { DeviceMediaInput } from '../../components/DeviceMediaInput';
import { beltModeOf } from '../../lib/beltBook';
import { PHOTO_PICKER_ACCEPT } from '../../lib/mediaPicker';
import { headerVisibility, readProfileMarks, writeProfileMark, type ProfileMark } from '../../lib/profileMarks';
import { clearProfilePortrait, portraitFromFile, readProfilePortrait, saveProfilePortrait } from '../../lib/profilePortrait';
import { quotaAddNote } from '../../lib/storageQuota';
import { clearStudentGymLogo, readStudentGymLogo, saveStudentGymLogoFile } from '../../lib/studentGymMark';
import type { StudentProgressReport } from '../../lib/progress/types';
import { useStudentPath } from './chrome';

const PORTRAIT_CAPTURE = 'profile-portrait-capture';
const PORTRAIT_LIBRARY = 'profile-portrait-library';
const LOGO_CAPTURE = 'profile-logo-capture';
const LOGO_LIBRARY = 'profile-logo-library';

/**
 * Optional photo and gym logo on My profile.
 * The photo stays on this phone. The gym logo can be replaced or removed.
 * The pictures themselves sit in the top-right corner. These controls stay in the cards.
 */
export function useProfileMedia() {
  const portraitCapture = useRef<HTMLInputElement>(null);
  const portraitLibrary = useRef<HTMLInputElement>(null);
  const logoCapture = useRef<HTMLInputElement>(null);
  const logoLibrary = useRef<HTMLInputElement>(null);
  const [portrait, setPortrait] = useState<string | null>(() => readProfilePortrait());
  const [logo, setLogo] = useState<string | null>(() => readStudentGymLogo());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const remember = (message: string) => {
    setError('');
    setNote(message);
  };

  const fail = (err: unknown) => {
    setNote('');
    const fallback = err instanceof Error && err.message === 'not-image' ? 'That file is not a photo.' : 'That photo is too large to keep on this phone.';
    setError(quotaAddNote(err) ?? fallback);
  };

  const onPortrait = async (files: readonly File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const saved = await portraitFromFile(file);
      await saveProfilePortrait(saved);
      setPortrait(saved);
      remember('Photo saved on this phone.');
    } catch (err) {
      fail(err);
    }
  };

  const onLogo = async (files: readonly File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const saved = await saveStudentGymLogoFile(file);
      setLogo(saved);
      remember('Gym logo saved on this phone.');
    } catch (err) {
      fail(err);
    }
  };

  return {
    portrait,
    logo,
    note,
    error,
    onPortrait,
    onLogo,
    removePortrait: () => {
      void clearProfilePortrait();
      setPortrait(null);
      remember('Photo removed from this phone.');
    },
    removeLogo: () => {
      clearStudentGymLogo();
      setLogo(null);
      remember('Gym logo removed from this phone.');
    },
    portraitCapture,
    portraitLibrary,
    logoCapture,
    logoLibrary,
  };
}

/** Small circles at the top right. One mark sits alone. Two sit side by side. */
export function ProfileCornerMarks({
  portrait,
  logo,
  name = '',
}: {
  portrait: string | null;
  logo: string | null;
  name?: string;
}) {
  if (!portrait && !logo && !name) return null;
  return (
    <div className="profile-corner">
      {logo ? <img src={logo} alt="Gym logo" /> : null}
      {portrait ? <img src={portrait} alt="Profile photo" /> : null}
      {!logo && !portrait && name ? <span className="profile-corner__name">{name}</span> : null}
    </div>
  );
}

export function ProfileMedia({ media, kids = false }: { media: ReturnType<typeof useProfileMedia>; kids?: boolean }) {
  const { portrait, logo, note, error, onPortrait, onLogo, removePortrait, removeLogo } = media;
  return (
    <div className="profile-identity">
      <section className="profile-card profile-photo" aria-label="Profile photo">
        <div className="profile-photo__copy">
          <h2>Photo</h2>
          <p>
            {kids
              ? 'Off for kids. The corner shows the gym logo, or the gym name when there is no logo. A parent can turn a photo on for reports.'
              : 'Optional. Stays on this phone. Nothing is uploaded unless you export a report or a backup with the switch on.'}
          </p>
        </div>
        <div className="profile-photo__actions">
          <label className="profile-action" htmlFor={PORTRAIT_CAPTURE}>
            Take photo
          </label>
          <label className="profile-action" htmlFor={PORTRAIT_LIBRARY}>
            Choose photo
          </label>
          {portrait ? (
            <button type="button" className="profile-action profile-action--quiet" onClick={removePortrait}>
              Remove photo
            </button>
          ) : null}
        </div>
      </section>

      <section className="profile-card profile-logo" aria-label="Gym logo">
        <div className="profile-photo__copy">
          <h2>Gym logo</h2>
          <p>From your coach, or one you choose. You can replace or remove it.</p>
        </div>
        <div className="profile-photo__actions">
          <label className="profile-action" htmlFor={LOGO_CAPTURE}>
            Take logo photo
          </label>
          <label className="profile-action" htmlFor={LOGO_LIBRARY}>
            Choose logo
          </label>
          {logo ? (
            <button type="button" className="profile-action profile-action--quiet" onClick={removeLogo}>
              Remove logo
            </button>
          ) : null}
        </div>
      </section>
      {error ? <p role="alert">{error}</p> : null}
      {note ? (
        <p className="student-quiet" role="status">
          {note}
        </p>
      ) : null}
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
              <DeviceMediaInput
                id={LOGO_CAPTURE}
                inputRef={media.logoCapture}
                accept={PHOTO_PICKER_ACCEPT}
                capture="environment"
                onFiles={onLogo}
              />
              <DeviceMediaInput
                id={LOGO_LIBRARY}
                inputRef={media.logoLibrary}
                accept={PHOTO_PICKER_ACCEPT}
                onFiles={onLogo}
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
      <Switch
        on={visible.selfie}
        label="Photo on reports and backups"
        note={
          kids
            ? 'Off for kids until a parent turns this on. It stays off kids reports until then.'
            : 'Off until you turn it on. Adult reports only.'
        }
        onToggle={() => toggle('selfie')}
      />
      <Switch
        on={visible.logo}
        label="Gym logo on reports and backups"
        note="The gym name stays on the report. The logo file is included only while this is on."
        onToggle={() => toggle('logo')}
      />
      {note ? (
        <p className="student-quiet profile-switch-status" role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}

function Switch({
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
