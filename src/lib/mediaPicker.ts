/**
 * Shared device media picker used by Gallery → Videos and Daily Training Videos.
 *
 * Record (Add videos / Add clips): `accept="video/*"` + `capture="environment"`
 * so iOS/Android open the camera in **video** mode instead of a recent-clips
 * gallery. Library: same accept, no capture, so the OS photo/files picker stays
 * available as a second action.
 *
 * Keep extra gym-TV extensions out of `accept` — `.mp4,.mov,…` makes iOS
 * open Files (library-only). JS still allows those types after pick.
 * Not getUserMedia — clips stay on this phone; no Pro cloud/PC upload here.
 */

/** HTML `accept` for video file inputs. Extra extensions force library-only on some phones. */
export const VIDEO_PICKER_ACCEPT = 'video/*';

/** Rear camera when the platform honors `capture` (iOS Safari, Android Chrome). */
export const VIDEO_CAPTURE = 'environment';

export const VIDEO_LIBRARY_LABEL = 'Pick from gallery';
export const VIDEO_RECORD_LABEL = 'Record';

export type MediaPickerMode = 'record' | 'library';

export function isVideoAccept(accept: string): boolean {
  return accept === VIDEO_PICKER_ACCEPT || accept.startsWith('video/');
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
