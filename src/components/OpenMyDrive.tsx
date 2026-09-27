import { useState, useSyncExternalStore } from 'react';
import { DriveConnectCard } from './DriveConnectCard';
import { Sheet } from './Sheet';
import { getDriveBindingSnapshot, subscribeDriveBinding } from '../lib/googleDrive';
import { OPEN_MY_DRIVE_CONNECT, OPEN_MY_DRIVE_LABEL, driveFolderWebUrl } from '../lib/openMyDrive';

/**
 * Opens the gym's connected Drive folder in the browser.
 * With no folder yet, the same tap asks to connect instead of doing nothing.
 */
export function OpenMyDrive() {
  const binding = useSyncExternalStore(subscribeDriveBinding, getDriveBindingSnapshot, () => null);
  const href = driveFolderWebUrl(binding?.folderId);
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <>
      {href ? (
        <a className="btn btn--ghost open-drive" href={href} target="_blank" rel="noopener noreferrer">
          {OPEN_MY_DRIVE_LABEL}
        </a>
      ) : (
        <button type="button" className="btn btn--ghost open-drive" onClick={() => setConnectOpen(true)}>
          {OPEN_MY_DRIVE_LABEL}
        </button>
      )}
      <Sheet open={connectOpen && !href} title="Connect your Google Drive folder" onClose={() => setConnectOpen(false)} stacked>
        <p className="saver-sound-hint">{OPEN_MY_DRIVE_CONNECT}</p>
        <DriveConnectCard />
      </Sheet>
    </>
  );
}
