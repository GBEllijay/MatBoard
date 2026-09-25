/**
 * Camera vs gallery file-input handoff.
 *
 * Take photo uses a separate input with `capture`. On Android and iOS the
 * camera result is often a content URI: clearing `input.value` before the
 * bytes are copied drops the photo, and a submit of the input's form reloads
 * the page (Media Console jumps back to the top). Gallery picks are real
 * in-memory files, so they keep working if we only special-case capture.
 */

export type FileInputLike = {
  files: FileList | null;
  value: string;
};

/** Independent bytes. The camera URI can die once the input is cleared. */
export async function copyDeviceFiles(files: readonly File[]): Promise<File[]> {
  const copied: File[] = [];
  for (const file of files) {
    try {
      const bytes = await file.arrayBuffer();
      copied.push(
        new File([bytes], file.name || 'capture', {
          type: file.type,
          lastModified: file.lastModified,
        }),
      );
    } catch {
      copied.push(file);
    }
  }
  return copied;
}

export function filesFromList(list: FileList | null): File[] {
  return list ? Array.from(list) : [];
}

/**
 * Read the chosen files, then clear the input so the same shot can be taken
 * again. Capture waits for a byte copy first. Library keeps the original
 * File objects — those already survive a value reset.
 */
export async function takeInputFiles(input: FileInputLike, capture: boolean): Promise<File[]> {
  const listed = filesFromList(input.files);
  if (!listed.length) return [];
  if (!capture) {
    input.value = '';
    return listed;
  }
  const files = await copyDeviceFiles(listed);
  input.value = '';
  return files;
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
