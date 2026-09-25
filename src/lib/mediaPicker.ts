/**
 * Shared device media picker used by Gallery (photos + videos) and Daily
 * Training Videos.
 *
 * Capture and library are **two separate file inputs**. Toggling `capture` on
 * one input then calling `click()` is ignored on some Android Chrome builds:
 * Google Photos / Collections opens instead of the camera.
 *
 * Video Record: `video/*` + `capture="environment"` in the markup (not JS).
 * Chrome Android only launches the camera when `capture` is set and every
 * accept token is the same kind. `video/*,image/*` fails that check, so Record
 * fell through to the photo picker (saved videos). A single `video/*` matches
 * Take photo (`image/*` + `capture="environment"`) and opens video capture.
 * No `multiple` on Record.
 * Photo Take: `image/*` + `capture="environment"`, no `multiple`.
 * Library: `video/*` or `image/*`, no capture, so Pick from gallery stays
 * Google Photos / the system picker.
 *
 * Activate capture / library with a `<label htmlFor>` — not `input.click()`
 * from a dialog that then unmounts. Keep extra gym-TV extensions out of
 * `accept`. Not getUserMedia — media stays on this phone. No Pro cloud /
 * Google Photos upload here.
 */

/** HTML `accept` for library / gallery video picks. */
export const VIDEO_PICKER_ACCEPT = 'video/*';

/**
 * Record input accept. Video only — a second type such as `image/*` makes
 * Chrome Android ignore `capture` and open the gallery.
 */
export const VIDEO_RECORD_ACCEPT = 'video/*';

export const PHOTO_PICKER_ACCEPT = 'image/*';

/** Rear camera when the platform honors `capture` (iOS Safari, Android Chrome). */
export const VIDEO_CAPTURE = 'environment';

export const VIDEO_LIBRARY_LABEL = 'Pick from gallery';
export const VIDEO_RECORD_LABEL = 'Record';
export const PHOTO_CAPTURE_LABEL = 'Take photo';

export type MediaPickerMode = 'record' | 'library';
export type MediaSourceKind = 'video' | 'photo';

export function isVideoAccept(accept: string): boolean {
  return (
    accept === VIDEO_PICKER_ACCEPT ||
    accept === VIDEO_RECORD_ACCEPT ||
    accept.startsWith('video/')
  );
}

export function isImageAccept(accept: string): boolean {
  return accept === PHOTO_PICKER_ACCEPT || accept.startsWith('image/');
}

/** Low-level helper. Gallery and Daily Training use dedicated inputs instead. */
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
