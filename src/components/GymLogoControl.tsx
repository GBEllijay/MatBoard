import { useRef, useState } from 'react';
import { DeviceMediaInput } from './DeviceMediaInput';
import { MediaSourceSheet } from './VideoSourceSheet';
import { clearGymLogo, readGymLogo, saveGymLogoFile } from '../lib/gymLogo';
import { quotaAddNote } from '../lib/storageQuota';
import { GYM_NAME_MAX, readGymName, writeGymName } from '../lib/gymName';
import { PHOTO_PICKER_ACCEPT, VIDEO_CAPTURE } from '../lib/mediaPicker';

const CAPTURE_ID = 'gym-logo-capture';
const LIBRARY_ID = 'gym-logo-library';

/** On-device default gym logo. Does not replace Advantage back-button marks. */
export function GymLogoControl() {
  const captureRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(() => readGymLogo());
  const [gymName, setGymName] = useState(() => readGymName());
  const [chooserOpen, setChooserOpen] = useState(false);
  const [note, setNote] = useState('');

  const onFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setChooserOpen(false);
    try {
      const saved = await saveGymLogoFile(file);
      setLogoUrl(saved);
      setNote('');
    } catch (error) {
      setNote(quotaAddNote(error) ?? 'That file is not a photo this logo can keep.');
    }
  };

  const clear = () => {
    clearGymLogo();
    setLogoUrl(null);
    setNote('');
  };

  return (
    <section className="gym-logo" aria-label="Gym identity">
      <h3 className="gym-logo__title">Custom gym logo</h3>
      {logoUrl ? (
        <div className="gym-logo__row">
          <img className="gym-logo__thumb" src={logoUrl} alt="Current gym logo" />
          <div className="gym-logo__actions">
            <button type="button" className="btn" onClick={() => setChooserOpen(true)}>
              Replace
            </button>
            <button type="button" className="btn btn--ghost" onClick={clear}>
              Clear
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn" onClick={() => setChooserOpen(true)}>
          Add custom gym logo
        </button>
      )}
      {note ? <p className="saver-folder__empty">{note}</p> : null}
      <label className="gym-logo__name">
        Gym name
        <input
          value={gymName}
          onChange={(event) => {
            const next = event.target.value.slice(0, GYM_NAME_MAX);
            setGymName(next);
            writeGymName(next);
          }}
          placeholder="School or academy"
          aria-label="Gym name"
          autoComplete="organization"
          maxLength={GYM_NAME_MAX}
        />
      </label>
      <p className="gym-logo__hint">
        Saved on this device. A new competitor starts with this name when their gym is empty.
      </p>
      <MediaSourceSheet
        open={chooserOpen}
        kind="photo"
        title="Custom gym logo"
        captureInputId={CAPTURE_ID}
        libraryInputId={LIBRARY_ID}
        stacked
        onClose={() => setChooserOpen(false)}
      />
      <DeviceMediaInput
        id={CAPTURE_ID}
        inputRef={captureRef}
        accept={PHOTO_PICKER_ACCEPT}
        capture={VIDEO_CAPTURE}
        onFiles={onFiles}
      />
      <DeviceMediaInput
        id={LIBRARY_ID}
        inputRef={libraryRef}
        accept={PHOTO_PICKER_ACCEPT}
        onFiles={onFiles}
      />
    </section>
  );
}
