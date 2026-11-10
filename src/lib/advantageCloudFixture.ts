import type { CloudHomeView } from './advantageCloudMedia.ts';

/** Dev-server sample. Not imported by a production or Pages build. */
export function fixtureCloudHome(): CloudHomeView {
  return {
    phase: 'ready',
    canUpload: true,
    licenseUsedBytes: 96_000_000,
    bucketUsedBytes: 397_000_000,
    capBytes: 8_000_000_000,
  };
}
