/**
 * Shared device media picker used by Gallery → Videos and Daily Training Videos.
 *
 * Record and library are **two separate file inputs**. Toggling `capture` on one
 * input then calling `click()` is ignored on some Android Chrome builds: Google
 * Photos / Collections opens instead of the camera. Daily Training was hitting
 * that path; Owner Videos looked like it “worked” when the Camera app still
 * appeared from a mixed chooser.
 *
 * Record: `accept` prefers `video/*`, plus `image/*` so if the OS will not hand
 * video capture to the camera it still opens the Camera app (photo mode; switch
 * to video — same UX as Owner Videos on those phones). `capture="environment"`
 * is baked into the markup (not set in JS). No `multiple` on Record.
 * Library: `video/*`, no capture, so Pick from gallery stays Google Photos / the
 * system picker.
 *
 * Activate Record / Library with a `<label htmlFor>` — not `input.click()` from
 * a dialog that then unmounts. Keep extra gym-TV extensions out of `accept`.
 * Not getUserMedia — clips stay on this phone.
 */

/** HTML `accept` for library / gallery video picks. */
export const VIDEO_PICKER_ACCEPT = 'video/*';

/**
 * Record input accept. Video first; image allowed so Android can open Camera
 * (not Photos) when video-only capture is bound to the gallery.
 */
export const VIDEO_RECORD_ACCEPT = 'video/*,image/*';

/** Rear camera when the platform honors `capture` (iOS Safari, Android Chrome). */
export const VIDEO_CAPTURE = 'environment';

export const VIDEO_LIBRARY_LABEL = 'Pick from gallery';
export const VIDEO_RECORD_LABEL = 'Record';

export type MediaPickerMode = 'record' | 'library';

export function isVideoAccept(accept: string): boolean {
  return (
    accept === VIDEO_PICKER_ACCEPT ||
    accept === VIDEO_RECORD_ACCEPT ||
    accept.startsWith('video/')
  );
}

export function openDeviceMediaPicker(
  input: HTMLInputElement | null,
  options: { accept: string; mode?: MediaPickerMode },
): void {
  if (!input) return;
  input.accept = options.accept;
  if (options.mode === 'record') {
    input.setAttribute('capture', VIDEO_CAPTURE);
  } else {
    input.removeAttribute('capture');
  }
  input.click();
}
