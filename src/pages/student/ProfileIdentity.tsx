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
import {
  chooseStudentLogo,
  clearStudentGymLogo,
  readGymLogoSync,
  readStudentGymLogo,
  saveStudentGymLogoFile,
  studentLogoChoice,
} from '../../lib/studentGymMark';
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
  const [portraitNote, setPortraitNote] = useState('');
  const [portraitError, setPortraitError] = useState('');
  const [logoNote, setLogoNote] = useState('');
  const [logoError, setLogoError] = useState('');

  const onPortrait = async (files: readonly File[]) => {
    const file = files[0];
    setPortraitNote('');
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
    } catch (err) {
      setPortraitError(localPhotoError(err, 'photo'));
    }
  };

  const onLogo = async (files: readonly File[]) => {
    const file = files[0];
    setLogoNote('');
    if (!file) {
      setLogoError('No logo photo was selected. Choose a logo and try again.');
      return;
    }
    try {
      const saved = await saveStudentGymLogoFile(file);
      setLogo(saved);
      setLogoError('');
      setLogoNote('Gym logo saved on this phone.');
    } catch (err) {
      setLogoError(localPhotoError(err, 'logo'));
    }
  };

  return {
    portrait,
    logo,
    onPortrait,
    onLogo,
    removePortrait: () => {
      void clearProfilePortrait();
      setPortrait(null);
      setPortraitError('');
      setPortraitNote('Photo removed from this phone.');
    },
    removeLogo: () => {
      clearStudentGymLogo();
      chooseStudentLogo('default');
      setLogo(null);
      setLogoError('');
      setLogoNote('Gym logo removed from this phone.');
    },
    /** Shown when the gym has sent a logo. Reverts to it at any time. */
    gymLogoAvailable: Boolean(readGymLogoSync().latest),
    logoChoice: studentLogoChoice(),
    useGymLogo: () => {
      chooseStudentLogo('gym');
      setLogo(readStudentGymLogo());
      setLogoError('');
      setLogoNote('Showing your gym logo.');
    },
    useAdvantageDefault: () => {
      chooseStudentLogo('default');
      setLogo(null);
      setLogoError('');
      setLogoNote('Showing the Advantage logo.');
    },
    portraitNote,
    portraitError,
    logoNote,
    logoError,
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
  const { portrait, logo, onPortrait, onLogo, removePortrait, removeLogo } = media;
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
        {media.portraitNote ? (
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

      <section
        className="profile-card profile-logo"
        aria-label="Gym logo"
        aria-describedby={media.logoError ? 'profile-logo-error' : undefined}
      >
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
          {media.gymLogoAvailable && media.logoChoice !== 'gym' ? (
            <button type="button" className="profile-action profile-action--quiet" onClick={media.useGymLogo}>
              Use my gym logo
            </button>
          ) : null}
          {logo ? (
            <button type="button" className="profile-action profile-action--quiet" onClick={media.useAdvantageDefault}>
              Use Advantage logo
            </button>
          ) : null}
        </div>
        {media.logoError ? <FieldAlert id="profile-logo-error" message={media.logoError} /> : null}
        {media.logoNote ? (
          <p className="student-quiet" role="status">
            {media.logoNote}
          </p>
        ) : null}
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
      <ProfileSwitch
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
