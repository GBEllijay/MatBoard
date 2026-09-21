/**
 * Shared device media picker used by Gallery → Videos and Daily Training Videos.
 *
 * How Videos requests camera: a file input with `accept="video/*"`.
 * Not `capture` (that skips the library) and not getUserMedia.
 * Phones can then Record / Take Video or pick an existing clip.
 *
 * Keep extra gym-TV extensions out of `accept` — `.mp4,.mov,…` makes iOS
 * open Files (library-only). JS still allows those types after pick.
 */

/** HTML `accept` for video file inputs. Extra extensions force library-only on some phones. */
export const VIDEO_PICKER_ACCEPT = 'video/*';

export function openDeviceMediaPicker(
  input: HTMLInputElement | null,
  options: { accept: string },
): void {
  if (!input) return;
  input.accept = options.accept;
  input.removeAttribute('capture');
  input.click();
}
