/**
 * Camera vs gallery file-input handoff.
 *
 * Take photo uses a separate input with `capture`. A submit of that input's
 * form reloads the page (Media Console jumps back to the top). Clearing
 * `input.value` before the photo is compressed drops the camera file, and
 * copying the whole shot into a second buffer throws WebKit's
 * "Unable to complete previous operation due to low memory". Snapshot the
 * File and keep the input filled until the save finishes.
 */

export type FileInputLike = {
  files: FileList | null;
  value: string;
};

export function filesFromList(list: FileList | null): File[] {
  return list ? Array.from(list) : [];
}

/**
 * The files currently on the input. Does not read their bytes and does not
 * clear the control — call {@link releaseInputFiles} after the save settles.
 */
export function takeInputFiles(input: FileInputLike): File[] {
  return filesFromList(input.files);
}

/** Clear the input so the same shot or library pick can be chosen again. */
export function releaseInputFiles(input: FileInputLike): void {
  input.value = '';
}

const CAPTURE_FOLDER_KEY = 'matboard.captureFolder';

/** Remember which folder a camera shot belongs to if the page is discarded. */
export function rememberCaptureFolder(folderId: string): void {
  try {
    sessionStorage.setItem(CAPTURE_FOLDER_KEY, folderId);
  } catch {
    /* private mode */
  }
}

export function readCaptureFolder(): string | null {
  try {
    return sessionStorage.getItem(CAPTURE_FOLDER_KEY);
  } catch {
    return null;
  }
}

export function forgetCaptureFolder(): void {
  try {
    sessionStorage.removeItem(CAPTURE_FOLDER_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * How far to scroll a folder back into its sheet. Positive moves the scroller
 * down. A folder taller than the sheet pins to the top so Pro Shop stays in
 * view instead of the Media Console settings block.
 */
export function deltaToShowChild(
  childTop: number,
  childBottom: number,
  viewTop: number,
  viewBottom: number,
  pad = 12,
): number {
  const viewHeight = viewBottom - viewTop;
  const childHeight = childBottom - childTop;
  if (childTop >= viewTop + pad && childBottom <= viewBottom - pad) return 0;
  if (childHeight > viewHeight - pad * 2) return childTop - (viewTop + pad);
  if (childTop < viewTop + pad) return childTop - (viewTop + pad);
  return childBottom - (viewBottom - pad);
}
