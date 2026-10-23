import { useState } from 'react';
import { CONNECT_CHOOSE_FOLDER } from '../lib/cloudStorage';
import { disconnectGoogleDrive } from '../lib/driveSession';
import {
  DRIVE_CHANGE_FOLDER_LABEL,
  DRIVE_DISCONNECT_CONFIRM,
  DRIVE_DISCONNECT_LABEL,
  DRIVE_FOLDER_EMPTY,
  driveSignInFailureCopy,
  listDriveFolderLevel,
  openDriveChangeFolder,
  tokenForDriveFolderChange,
  type DriveFolderChoice,
  type DriveFolderLevel,
} from '../lib/googleDrive';

type Props = {
  folderId: string | null;
  busy?: boolean;
  className?: string;
  buttonClassName?: string;
  primaryClassName?: string;
  /**
   * `external` asks the parent to open the existing folder picker.
   * `inline` lists folders here, including Up from the current folder.
   */
  picker?: 'external' | 'inline';
  onChangeFolder?: () => void | Promise<void>;
  onPick?: (folder: DriveFolderChoice, token: string) => void | Promise<void>;
  onDisconnected?: () => void;
};

/**
 * Change folder and Disconnect Google Drive.
 * Disconnect asks once, then revokes the token and clears Drive folder state.
 */
export function GoogleDriveFolderTools({
  folderId,
  busy = false,
  className = 'drive-session-actions',
  buttonClassName = 'btn btn--ghost',
  primaryClassName = 'btn',
  picker = 'external',
  onChangeFolder,
  onPick,
  onDisconnected,
}: Props) {
  const [disconnectAsk, setDisconnectAsk] = useState(false);
  const [changing, setChanging] = useState(false);
  const [level, setLevel] = useState<DriveFolderLevel | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const startChange = async () => {
    setDisconnectAsk(false);
    setNote('');
    if (picker === 'external') {
      setChanging(true);
      try {
        await onChangeFolder?.();
      } finally {
        setChanging(false);
      }
      return;
    }
    setChanging(true);
    try {
      const auth = await tokenForDriveFolderChange();
      if (!auth.ok) {
        setNote(driveSignInFailureCopy(auth));
        return;
      }
      const next = await openDriveChangeFolder(auth.token, folderId);
      setToken(auth.token);
      setLevel(next);
    } catch (reason) {
      setNote(reason instanceof Error ? reason.message : 'Google Drive could not be opened.');
    } finally {
      setChanging(false);
    }
  };

  const goUp = async () => {
    if (!token || !level?.upLabel) return;
    setChanging(true);
    setNote('');
    try {
      const parentId = level.upToAccount ? null : level.upFolderId;
      const next = await listDriveFolderLevel(token, parentId);
      setLevel(next);
    } catch (reason) {
      setNote(reason instanceof Error ? reason.message : 'Google Drive could not be opened.');
    } finally {
      setChanging(false);
    }
  };

  const pick = async (folder: DriveFolderChoice) => {
    if (!token) return;
    setChanging(true);
    setNote('');
    try {
      await onPick?.(folder, token);
      setLevel(null);
    } catch (reason) {
      setNote(reason instanceof Error ? reason.message : 'That folder could not be chosen.');
    } finally {
      setChanging(false);
    }
  };

  const commitDisconnect = async () => {
    setChanging(true);
    setNote('');
    try {
      await disconnectGoogleDrive();
      setLevel(null);
      setToken(null);
      setDisconnectAsk(false);
      onDisconnected?.();
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className={className}>
      {disconnectAsk ? (
        <div className="drive-session-confirm" role="group" aria-label={DRIVE_DISCONNECT_LABEL}>
          <p>{DRIVE_DISCONNECT_CONFIRM}</p>
          <button type="button" className={primaryClassName} disabled={busy || changing} onClick={() => void commitDisconnect()}>
            {DRIVE_DISCONNECT_LABEL}
          </button>
          <button type="button" className={buttonClassName} disabled={busy || changing} onClick={() => setDisconnectAsk(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button type="button" className={buttonClassName} disabled={busy || changing} onClick={() => void startChange()}>
            {changing ? 'Opening folders…' : DRIVE_CHANGE_FOLDER_LABEL}
          </button>
          <button type="button" className={buttonClassName} disabled={busy || changing} onClick={() => setDisconnectAsk(true)}>
            {DRIVE_DISCONNECT_LABEL}
          </button>
        </>
      )}
      {level ? (
        <div className="drive-connect__folders">
          <p>{CONNECT_CHOOSE_FOLDER}</p>
          {level.upLabel ? (
            <button type="button" className={buttonClassName} disabled={changing} onClick={() => void goUp()}>
              {level.upLabel}
            </button>
          ) : null}
          {level.folders.length ? (
            <ul>
              {level.folders.map((folder) => (
                <li key={folder.id}>
                  <button type="button" className={buttonClassName} disabled={changing} onClick={() => void pick(folder)}>
                    {folder.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>{DRIVE_FOLDER_EMPTY}</p>
          )}
        </div>
      ) : null}
      {note ? (
        <p className="drive-connect__error" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
