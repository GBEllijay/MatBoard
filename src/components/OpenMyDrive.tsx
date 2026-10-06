import { useState, useSyncExternalStore } from 'react';
import { DriveConnectCard } from './DriveConnectCard';
import { Sheet } from './Sheet';
import { cloudStorage, CONNECT_WITH_TITLE } from '../lib/cloudStorage';
import { OPEN_MY_DRIVE_CONNECT, OPEN_MY_DRIVE_LABEL } from '../lib/openMyDrive';

type Props = {
  /** Label once a gym folder is connected. Defaults to Open my Drive. */
  openLabel?: string;
  /** Label before a folder is connected. Defaults to Open my Drive. */
  connectLabel?: string;
  /** Sheet title before a folder is connected. */
  connectTitle?: string;
  /** Sheet helper before a folder is connected. */
  connectHint?: string;
};

/**
 * Opens the gym's connected Drive folder in the browser.
 * With no folder yet, the same tap asks to connect instead of doing nothing.
 * Daily Training Videos passes share labels so this is the day-save handoff.
 */
export function OpenMyDrive({
  openLabel = OPEN_MY_DRIVE_LABEL,
  connectLabel = OPEN_MY_DRIVE_LABEL,
  connectTitle = CONNECT_WITH_TITLE,
  connectHint = OPEN_MY_DRIVE_CONNECT,
}: Props = {}) {
  const drive = cloudStorage();
  const binding = useSyncExternalStore(drive.subscribe, drive.getBindingSnapshot, () => null);
  const href = binding ? drive.openFolderUrl(binding.folderId) : null;
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <>
      {href ? (
        <a className="btn btn--ghost open-drive" href={href} target="_blank" rel="noopener noreferrer">
          {openLabel}
        </a>
      ) : (
        <button type="button" className="btn btn--ghost open-drive" onClick={() => setConnectOpen(true)}>
          {connectLabel}
        </button>
      )}
      <Sheet open={connectOpen && !href} title={connectTitle} onClose={() => setConnectOpen(false)} stacked>
        <p className="saver-sound-hint">{connectHint}</p>
        <DriveConnectCard />
      </Sheet>
    </>
  );
}
