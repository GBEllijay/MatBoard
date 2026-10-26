import { useEffect, useState, useSyncExternalStore } from 'react';
import { DriveConnectCard } from './DriveConnectCard';
import { GoogleDriveFolderTools } from './GoogleDriveFolderTools';
import { Sheet } from './Sheet';
import { cloudStorage, CONNECT_WITH_TITLE } from '../lib/cloudStorage';
import { DRIVE_CHANGE_FOLDER_LABEL } from '../lib/googleDrive';
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
  const [sheet, setSheet] = useState<null | 'connect' | 'change'>(null);

  useEffect(() => {
    if (!binding && sheet === 'change') setSheet(null);
  }, [binding, sheet]);

  const sheetOpen = sheet === 'change' || (sheet === 'connect' && !href);

  return (
    <div className="open-drive-wrap">
      {href ? (
        <a className="btn btn--ghost open-drive" href={href} target="_blank" rel="noopener noreferrer">
          {openLabel}
        </a>
      ) : (
        <button type="button" className="btn btn--ghost open-drive" onClick={() => setSheet('connect')}>
          {connectLabel}
        </button>
      )}
      {binding?.providerId === 'googleDrive' ? (
        <GoogleDriveFolderTools
          folderId={binding.folderId}
          picker="external"
          onChangeFolder={() => setSheet('change')}
          onDisconnected={() => setSheet(null)}
        />
      ) : null}
      <Sheet
        open={sheetOpen}
        title={sheet === 'change' ? DRIVE_CHANGE_FOLDER_LABEL : connectTitle}
        onClose={() => setSheet(null)}
        stacked
      >
        <p className="saver-sound-hint">{connectHint}</p>
        <DriveConnectCard changeFolderOnOpen={sheet === 'change'} />
      </Sheet>
    </div>
  );
}
