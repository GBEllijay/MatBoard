import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DeviceMediaInput } from './DeviceMediaInput';
import { useGymLogo } from '../hooks/useGymBrand';
import { useEffectiveTimerBackdrop, useTimerBackgroundUrl } from '../hooks/useTimerBackdrop';
import { saveGymLogoFile } from '../lib/gymLogo';
import { PHOTO_PICKER_ACCEPT } from '../lib/mediaPicker';
import { quotaAddNote } from '../lib/storageQuota';
import {
  TIMER_SCRIMS,
  clearTimerBackground,
  saveTimerBackgroundFile,
  setTimerScrim,
  setTimerShowGymLogo,
  timerBackgroundStorageAvailable,
} from '../lib/timerBackdrop';

const BG_INPUT_ID = 'timer-bg-library';
const LOGO_INPUT_ID = 'timer-logo-library';

/**
 * Round timer "Background & logo" options. Shared by the display sheet and the
 * Rounds controller through TrainingOptions. Pictures stay on this device.
 * The file inputs are portaled to document.body (see GymLogoControl) so a
 * focused input cannot scroll the options sheet into an empty frame.
 */
export function TimerBackdropOptions() {
  // Media and up (owner, Nov 1 2026). Without it the prefs read as default and the blob is not loaded.
  const { prefs, unlocked } = useEffectiveTimerBackdrop();
  const bgUrl = useTimerBackgroundUrl(prefs.backgroundStamp);
  const gymLogo = useGymLogo();
  const bgRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const canStore = timerBackgroundStorageAvailable();
  const hasBg = prefs.backgroundStamp != null;

  const onBackground = async (files: readonly File[]) => {
    const file = files[0];
    if (!file) return;
    setBusy(true);
    setNote('');
    try {
      await saveTimerBackgroundFile(file);
    } catch (error) {
      setNote(
        quotaAddNote(error) ??
          (error instanceof Error && error.message === 'not-image'
            ? 'That file is not a photo the timer can use.'
            : 'Could not save that picture on this device.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const onLogo = async (files: readonly File[]) => {
    const file = files[0];
    if (!file) return;
    setNote('');
    try {
      await saveGymLogoFile(file);
      setTimerShowGymLogo(true);
    } catch (error) {
      setNote(quotaAddNote(error) ?? 'That file is not a photo this logo can keep.');
    }
  };

  // No Media door (White, Student): the section is not shown at all. No lock, no upsell.
  if (!unlocked) return null;

  return (
    <fieldset className="timer-backdrop">
      <legend>Background &amp; logo</legend>

      <div className="timer-backdrop__row">
        <div
          className={`timer-backdrop__preview${hasBg && bgUrl ? ' has-image' : ''}`}
          style={hasBg && bgUrl ? { backgroundImage: `url("${bgUrl}")` } : undefined}
          aria-label={hasBg ? 'Current custom background' : 'Default background'}
          role="img"
        >
          <span className="timer-backdrop__preview-clock">5:00</span>
        </div>
        <div className="timer-backdrop__actions">
          <button
            type="button"
            className="btn"
            disabled={!canStore || busy}
            onClick={() => bgRef.current?.click()}
          >
            {busy ? 'Saving…' : hasBg ? 'Replace background' : 'Upload background'}
          </button>
          {hasBg ? (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => {
                setNote('');
                void clearTimerBackground();
              }}
            >
              Use default background
            </button>
          ) : null}
        </div>
      </div>

      {hasBg ? (
        <div className="cue-preview">
          <p className="cue-preview-label">Dim background</p>
          <div className="presets presets--three" role="radiogroup" aria-label="Dim background">
            {TIMER_SCRIMS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={prefs.scrim === option.id}
                className={`preset${prefs.scrim === option.id ? ' preset--on' : ''}`}
                onClick={() => setTimerScrim(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <label className="toggle">
        <input
          type="checkbox"
          checked={prefs.showGymLogo}
          onChange={(e) => setTimerShowGymLogo(e.target.checked)}
        />
        Show gym logo (top right)
      </label>
      {gymLogo ? (
        <div className="timer-backdrop__logo">
          <img className="timer-backdrop__logo-thumb" src={gymLogo} alt="Gym logo" />
          <span>Uses the gym logo saved in Pro / Media Console.</span>
          <button type="button" className="btn btn--ghost" onClick={() => logoRef.current?.click()}>
            Replace logo
          </button>
        </div>
      ) : (
        <div className="timer-backdrop__logo">
          <button type="button" className="btn btn--ghost" onClick={() => logoRef.current?.click()}>
            Add gym logo
          </button>
          <span>No gym logo saved yet. It is shared with Pro / Media Console.</span>
        </div>
      )}

      {note ? <p className="timer-backdrop__note">{note}</p> : null}
      <p className="timer-backdrop__hint">
        {canStore
          ? 'Saved on this device only. Other tabs and the Rounds TV window on this device show it too. Other phones and TVs need their own upload.'
          : 'This browser cannot save a background picture.'}
      </p>

      {typeof document === 'undefined'
        ? null
        : createPortal(
            <>
              <DeviceMediaInput
                id={BG_INPUT_ID}
                className="timer-bg-file"
                inputRef={bgRef}
                accept={PHOTO_PICKER_ACCEPT}
                onFiles={onBackground}
              />
              <DeviceMediaInput
                id={LOGO_INPUT_ID}
                className="timer-logo-file"
                inputRef={logoRef}
                accept={PHOTO_PICKER_ACCEPT}
                onFiles={onLogo}
              />
            </>,
            document.body,
          )}
    </fieldset>
  );
}
