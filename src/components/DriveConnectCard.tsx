import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DRIVE_CONNECT_BODY,
  DRIVE_CONNECT_LABEL,
  DRIVE_CONNECT_TITLE,
  DRIVE_FOLDER_EMPTY,
  DRIVE_SETUP_NEEDED,
  DRIVE_SIGN_IN_FAILED,
  LESSON_ROOT_NAME,
  CLASS_HISTORY_TITLE,
  clearDriveSession,
  createLessonRoot,
  driveAccountEmail,
  googleClientId,
  listDriveFolders,
  readDriveBinding,
  requestDriveToken,
  saveGoogleClientId,
  writeDriveBinding,
  type DriveBinding,
  type DriveFolderChoice,
} from '../lib/googleDrive';

/**
 * Connect this browser to the caller's Google Drive and pick a real folder.
 * The list is whatever Drive returns. An empty response stays empty.
 */
export function DriveConnectCard() {
  const envClient = import.meta.env?.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
  const [clientId, setClientId] = useState(() => googleClientId());
  const [binding, setBinding] = useState<DriveBinding | null>(() => readDriveBinding());
  const [folders, setFolders] = useState<DriveFolderChoice[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const connect = async () => {
    saveGoogleClientId(clientId);
    if (!googleClientId()) {
      setAdvancedOpen(true);
      setError(DRIVE_SETUP_NEEDED);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await requestDriveToken('consent');
      if (!next) {
        setError(DRIVE_SIGN_IN_FAILED);
        return;
      }
      setToken(next);
      setFolders(await listDriveFolders(next));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Google Drive could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const choose = async (folder: DriveFolderChoice) => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const email = await driveAccountEmail(token).catch(() => null);
      const next = { folderId: folder.id, folderName: folder.name, email };
      writeDriveBinding(next);
      setBinding(next);
      setFolders(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That folder could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const created = await createLessonRoot(token);
      await choose(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Google Drive could not create the folder.');
      setBusy(false);
    }
  };

  return (
    <article className="plan-card">
      <p className="plan-card__kicker">Google Drive</p>
      <strong>{binding ? binding.folderName : DRIVE_CONNECT_TITLE}</strong>
      {binding ? (
        <span>
          {binding.email ? `${binding.email}. ` : ''}
          Lesson plans save in this folder. Photos and videos stay in your Google Drive. Advantage only keeps the lesson text and links to those files.
        </span>
      ) : (
        <span>{DRIVE_CONNECT_BODY}</span>
      )}
      {envClient ? null : (
        <details
          className="drive-connect__advanced"
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          <summary>Advanced</summary>
          <p>For the person setting up this website. Gym owners can leave this closed.</p>
          <label className="drive-connect__field">
            Google OAuth client id
            <input
              value={clientId}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setClientId(event.target.value)}
            />
          </label>
        </details>
      )}
      {binding ? (
        <div className="drive-connect__actions">
          <Link className="btn" to="/class-history">
            {CLASS_HISTORY_TITLE}
          </Link>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              clearDriveSession();
              setBinding(null);
              setToken(null);
              setFolders(null);
            }}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button type="button" className="btn" disabled={busy} onClick={() => void connect()}>
          {busy ? 'Opening Google…' : DRIVE_CONNECT_LABEL}
        </button>
      )}
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
          <button type="button" className="btn" disabled={busy || !token} onClick={() => void createFolder()}>
            Create {LESSON_ROOT_NAME}
          </button>
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
