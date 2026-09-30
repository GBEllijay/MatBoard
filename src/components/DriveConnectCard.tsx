import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  cloudStorage,
  cloudStorageChoices,
  CONNECT_CHOOSE_FOLDER,
  CONNECT_COMING_SOON,
  CONNECT_WITH_BODY,
  CONNECT_WITH_KICKER,
  CONNECT_WITH_TITLE,
  type CloudBinding,
  type CloudFolderRef,
  type CloudStorageConnector,
} from '../lib/cloudStorage';
import {
  CLASS_HISTORY_TITLE,
  DRIVE_DEV_CLIENT_HINT,
  DRIVE_FOLDER_EMPTY,
  driveOwnerFacingError,
  googleClientId,
  ownedGoogleClientId,
  saveGoogleClientId,
} from '../lib/googleDrive';

function connectedBinding(): CloudBinding | null {
  for (const provider of cloudStorageChoices()) {
    const binding = provider.binding();
    if (binding) return binding;
  }
  return null;
}

/**
 * Connect with list: Google Drive signs in and picks a folder.
 * OneDrive, Dropbox, and iCloud stay in that list as coming soon.
 * The build supplies sign-in. Owners do not type a setup code.
 */
export function DriveConnectCard() {
  const owned = ownedGoogleClientId();
  const [devAppId, setDevAppId] = useState(() => (import.meta.env.DEV && !owned ? googleClientId() : ''));
  const [binding, setBinding] = useState<CloudBinding | null>(() => connectedBinding());
  const [pending, setPending] = useState<CloudStorageConnector | null>(null);
  const [folders, setFolders] = useState<CloudFolderRef[] | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    googleClientId();
  }, []);

  const choices = cloudStorageChoices();
  const connected = binding ? cloudStorage(binding.providerId) : null;

  const connect = async (provider: CloudStorageConnector) => {
    if (provider.phase !== 'live' || !provider.isAvailable()) return;
    setBusyId(provider.id);
    setError('');
    try {
      const result = await provider.connect();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPending(provider);
      setSession(result.session);
      setFolders(result.folders);
    } catch (reason) {
      setError(driveOwnerFacingError(reason));
    } finally {
      setBusyId(null);
    }
  };

  const choose = async (folder: CloudFolderRef) => {
    if (!session || !pending) return;
    setBusyId(pending.id);
    setError('');
    try {
      const next = await pending.pickFolder(session, folder);
      setBinding(next);
      setFolders(null);
      setPending(null);
    } catch (reason) {
      setError(driveOwnerFacingError(reason));
    } finally {
      setBusyId(null);
    }
  };

  const createFolder = async () => {
    if (!session || !pending?.createFolder) return;
    setBusyId(pending.id);
    setError('');
    try {
      const created = await pending.createFolder(session);
      const next = await pending.pickFolder(session, created);
      setBinding(next);
      setFolders(null);
      setPending(null);
    } catch (reason) {
      setError(driveOwnerFacingError(reason));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <article className="plan-card">
      <p className="plan-card__kicker">{connected ? connected.displayName : CONNECT_WITH_KICKER}</p>
      <strong>{binding ? binding.folderName : CONNECT_WITH_TITLE}</strong>
      {binding ? (
        <span>
          {binding.accountLabel ? `${binding.accountLabel}. ` : ''}
          Lesson plans and attached training videos save in this folder. This phone keeps a copy of each video for offline play. Advantage does not host the video files.
        </span>
      ) : (
        <span>{CONNECT_WITH_BODY}</span>
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
              connected?.disconnect();
              setBinding(null);
              setPending(null);
              setSession(null);
              setFolders(null);
            }}
          >
            Disconnect
          </button>
        </div>
      ) : folders ? null : (
        <ul className="drive-connect__providers" aria-label={CONNECT_WITH_TITLE}>
          {choices.map((provider) => {
            const comingSoon = provider.phase === 'coming-soon';
            const canConnect = provider.phase === 'live' && provider.isAvailable();
            const opening = busyId === provider.id;
            return (
              <li key={provider.id}>
                <button
                  type="button"
                  className={canConnect ? 'btn' : 'btn btn--ghost'}
                  disabled={!canConnect || busyId !== null}
                  onClick={() => void connect(provider)}
                >
                  {opening ? `Opening ${provider.displayName}…` : provider.displayName}
                  {comingSoon ? <span className="drive-connect__soon">{CONNECT_COMING_SOON}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!binding && !folders
        ? choices
            .filter((provider) => provider.phase === 'live' && !provider.isAvailable())
            .map((provider) => (
              <p key={provider.id} className="drive-connect__note" role="status">
                {provider.unavailableMessage()}
              </p>
            ))
        : null}
      {folders && pending ? (
        <div className="drive-connect__folders">
          <p>{CONNECT_CHOOSE_FOLDER}</p>
          {folders.length ? (
            <ul>
              {folders.map((folder) => (
                <li key={folder.id}>
                  <button type="button" className="btn btn--ghost" disabled={busyId !== null} onClick={() => void choose(folder)}>
                    {folder.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>{DRIVE_FOLDER_EMPTY}</p>
          )}
          {pending.createFolder && pending.createFolderLabel ? (
            <button type="button" className="btn" disabled={busyId !== null || !session} onClick={() => void createFolder()}>
              {pending.createFolderLabel}
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
