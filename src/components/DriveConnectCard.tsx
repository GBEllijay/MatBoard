import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cloudStorage, type CloudBinding, type CloudFolderRef } from '../lib/cloudStorage';
import {
  CLASS_HISTORY_TITLE,
  DRIVE_CONNECT_BODY,
  DRIVE_CONNECT_LABEL,
  DRIVE_CONNECT_TITLE,
  DRIVE_DEV_CLIENT_HINT,
  DRIVE_FOLDER_EMPTY,
  driveOwnerFacingError,
  googleClientId,
  ownedGoogleClientId,
  saveGoogleClientId,
} from '../lib/googleDrive';

/**
 * Connect this browser to the caller's Google Drive and pick a real folder.
 * The list is whatever Drive returns. An empty response stays empty.
 * The sign-in app id comes from the build. Owners are not asked for one.
 */
export function DriveConnectCard() {
  const drive = cloudStorage();
  const owned = ownedGoogleClientId();
  const [devAppId, setDevAppId] = useState(() => (import.meta.env.DEV && !owned ? googleClientId() : ''));
  const [binding, setBinding] = useState<CloudBinding | null>(() => drive.binding());
  const [folders, setFolders] = useState<CloudFolderRef[] | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    googleClientId();
  }, []);

  const available = drive.isAvailable();

  const connect = async () => {
    if (!drive.isAvailable()) {
      setError(drive.unavailableMessage());
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await drive.connect();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSession(result.session);
      setFolders(result.folders);
    } catch (reason) {
      setError(driveOwnerFacingError(reason));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (folder: CloudFolderRef) => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const next = await drive.pickFolder(session, folder);
      setBinding(next);
      setFolders(null);
    } catch (reason) {
      setError(driveOwnerFacingError(reason));
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async () => {
    if (!session || !drive.createFolder) return;
    setBusy(true);
    setError('');
    try {
      const created = await drive.createFolder(session);
      const next = await drive.pickFolder(session, created);
      setBinding(next);
      setFolders(null);
    } catch (reason) {
      setError(driveOwnerFacingError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="plan-card">
      <p className="plan-card__kicker">{drive.displayName}</p>
      <strong>{binding ? binding.folderName : DRIVE_CONNECT_TITLE}</strong>
      {binding ? (
        <span>
          {binding.accountLabel ? `${binding.accountLabel}. ` : ''}
          Lesson plans save in this folder. Photos and videos stay in your Google Drive. Advantage only keeps the lesson text and links to those files.
        </span>
      ) : (
        <span>{DRIVE_CONNECT_BODY}</span>
      )}
      {import.meta.env.DEV && !owned ? (
        <div className="drive-connect__dev">
          <p>{DRIVE_DEV_CLIENT_HINT}</p>
          <label className="drive-connect__field">
            App id
            <input
              value={devAppId}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                const next = event.target.value;
                setDevAppId(next);
                saveGoogleClientId(next);
              }}
            />
          </label>
        </div>
      ) : null}
      {binding ? (
        <div className="drive-connect__actions">
          <Link className="btn" to="/class-history">
            {CLASS_HISTORY_TITLE}
          </Link>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              drive.disconnect();
              setBinding(null);
              setSession(null);
              setFolders(null);
            }}
          >
            Disconnect
          </button>
        </div>
      ) : available || import.meta.env.DEV ? (
        <button type="button" className="btn" disabled={busy || !available} onClick={() => void connect()}>
          {busy ? 'Opening Google…' : DRIVE_CONNECT_LABEL}
        </button>
      ) : null}
      {!available ? (
        <p className="drive-connect__note" role="status">
          {drive.unavailableMessage()}
        </p>
      ) : null}
      {folders ? (
        <div className="drive-connect__folders">
          <p>Choose a folder in your Google Drive.</p>
          {folders.length ? (
            <ul>
              {folders.map((folder) => (
                <li key={folder.id}>
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void choose(folder)}>
                    {folder.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>{DRIVE_FOLDER_EMPTY}</p>
          )}
          {drive.createFolder && drive.createFolderLabel ? (
            <button type="button" className="btn" disabled={busy || !session} onClick={() => void createFolder()}>
              {drive.createFolderLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="drive-connect__error" role="status">
          {error}
        </p>
      ) : null}
    </article>
  );
}
