/**
 * Where the slideshow and Media Console play gallery/approved.
 * Advantage Cloud first, then the gym's Google Drive or OneDrive, then this phone.
 * Google Photos is not a home. Albums stay on the picker.
 */

export type GymHomeId = 'advantage-cloud' | 'google-drive' | 'onedrive' | 'phone';

export function chooseGymHome(input: {
  plusCloudActive: boolean;
  cloudBound: boolean;
  cloudLapsed?: boolean;
  driveConnected: boolean;
  oneDriveConnected: boolean;
}): GymHomeId {
  if (input.plusCloudActive && input.cloudBound && input.cloudLapsed !== true) return 'advantage-cloud';
  if (input.driveConnected) return 'google-drive';
  if (input.oneDriveConnected) return 'onedrive';
  return 'phone';
}

/**
 * Drive connect is hidden for a Cloud customer who has no Drive folder yet,
 * and while a saved pass is still being checked.
 * A folder that is already connected stays connected. This does not read or write it.
 */
export function mediaConsoleDriveActions(input: {
  settled: boolean;
  cloudEntitled: boolean;
  driveConnected: boolean;
}): { connect: boolean; importExisting: boolean } {
  if (!input.settled) return { connect: false, importExisting: false };
  if (input.driveConnected) return { connect: false, importExisting: true };
  if (input.cloudEntitled) return { connect: false, importExisting: false };
  return { connect: true, importExisting: false };
}

export function mediaConsoleGalleryLead(input: { cloudEntitled: boolean; driveConnected: boolean }): string {
  if (!input.cloudEntitled) {
    return 'Add photos opens Take photo or Pick from gallery on this phone. Pick from Google Photos uses the connected library, including albums. Pick from Google Drive is an extra source. Photos and clips stay on this phone or computer. Photos loop fullscreen; clips play through, muted by default. Press F for fullscreen on a computer plugged into the TV.';
  }
  const drive = input.driveConnected
    ? ' Import from Google Drive copies files onto this phone. The folder that is already connected stays connected.'
    : '';
  return `Add photos and Add videos stay on this phone. Advantage Cloud is this gym's storage when the status below says it is ready.${drive} Optional import copies files from Google Photos onto this phone. It does not replace Advantage Cloud. Photos loop fullscreen; clips play through, muted by default. Press F for fullscreen on a computer plugged into the TV.`;
}

export function playingFromCopy(home: GymHomeId): string {
  if (home === 'advantage-cloud') return 'Playing from Advantage Cloud.';
  if (home === 'google-drive') return 'Playing from Google Drive.';
  if (home === 'onedrive') return 'Playing from OneDrive.';
  return 'Playing from this phone. Connect Google Drive, OneDrive, Advantage Cloud, or a folder on this PC to use the same files on another device.';
}

/** Ask the Worker whether R2 is bound. A missing binding, a 404, or HTML is not Cloud. */
export async function probeAdvantageCloud(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher('/api/gym/media?probe=1');
    if (!response.ok) return false;
    const body = (await response.json()) as { bound?: unknown };
    return body.bound === true;
  } catch {
    return false;
  }
}
