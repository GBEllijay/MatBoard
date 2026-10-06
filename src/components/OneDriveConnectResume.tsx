import { useState } from 'react';
import { dismissOneDriveResume, oneDriveResumeSnapshot } from '../lib/oneDrive';
import { DriveConnectCard } from './DriveConnectCard';
import { Sheet } from './Sheet';

/**
 * Microsoft sends the browser back to this site after OneDrive sign-in.
 * The page that started the tap may have unmounted, so the folder list
 * opens here until the gym picks a folder.
 */
export function OneDriveConnectResume() {
  const [mode] = useState(() => oneDriveResumeSnapshot());
  const [open, setOpen] = useState(mode !== null);
  if (!open || !mode) return null;
  return (
    <Sheet
      open
      portal
      stacked
      title="Connect with"
      onClose={() => {
        dismissOneDriveResume();
        setOpen(false);
      }}
    >
      <DriveConnectCard resumeMode={mode} />
    </Sheet>
  );
}
