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
