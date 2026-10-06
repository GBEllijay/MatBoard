import { useState } from 'react';
import { dismissICloudResume, iCloudResumeSnapshot } from '../lib/iCloud';
import { DriveConnectCard } from './DriveConnectCard';
import { Sheet } from './Sheet';

/**
 * Apple sends the browser back to this site after iCloud sign-in.
 * The page that started the tap may have unmounted, so the folder list
 * opens here until the gym picks a folder.
 */
export function ICloudConnectResume() {
  const [mode] = useState(() => iCloudResumeSnapshot());
  const [open, setOpen] = useState(mode !== null);
  if (!open || !mode) return null;
  return (
    <Sheet
      open
      portal
      stacked
      title="Connect with"
      onClose={() => {
        dismissICloudResume();
        setOpen(false);
      }}
    >
      <DriveConnectCard resumeMode={mode} resumeProvider="iCloud" />
    </Sheet>
  );
}
