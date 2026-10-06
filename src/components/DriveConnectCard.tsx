import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import {
  cloudStorage,
  cloudStorageChoices,
  CONNECT_ACCOUNT_NOTE,
  CONNECT_CHOOSE_FOLDER,
  CONNECT_GOOGLE_UNVERIFIED_NOTE,
  CONNECT_LAUNCH_BADGE,
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
import { PHOTOS_CONNECTED, photosOwnerFacingError } from '../lib/googlePhotos';
import {
  clearOneDriveResumeFlag,
  loadMicrosoftClientId,
  microsoftClientId,
  ONEDRIVE_DEV_CLIENT_HINT,
  oneDriveOwnerFacingError,
  ownedMicrosoftClientId,
  saveMicrosoftClientId,
  subscribeMicrosoftClientId,
  takeOneDriveResumeError,
} from '../lib/oneDrive';

function connectedBinding(): CloudBinding | null {
  for (const provider of cloudStorageChoices()) {
    if (provider.id === 'googlePhotos') continue;
    const binding = provider.binding();
    if (binding) return binding;
  }
  return null;
}

function ownerError(provider: CloudStorageConnector | null, reason: unknown): string {
  if (provider?.id === 'oneDrive') return oneDriveOwnerFacingError(reason);
  if (provider?.id === 'googlePhotos') return photosOwnerFacingError(reason);
  return driveOwnerFacingError(reason);
}

function connectedDetail(binding: CloudBinding): string {
  const who = binding.accountLabel ? `${binding.accountLabel}. ` : '';
  if (binding.providerId === 'oneDrive') {
    return `${who}This OneDrive folder is connected. A small connect file was saved there. Lesson packages on OneDrive are not in this build yet. Advantage does not host the files.`;
  }
  return `${who}Lesson plans and attached training videos save in this folder. This phone keeps a copy of each video for offline play. Advantage does not host the video files.`;
}

/**
 * Connect with list for Coach Unlimited and Advantage Pro.
 * Google Drive signs in and picks a folder. OneDrive does the same when this
 * build has Microsoft sign-in: the tap leaves for Microsoft, then comes back
 * to this list. Google Photos connects the gym library beside that folder.
 * iCloud stays disabled until it works. The build supplies sign-in.
 * Owners do not type a setup code.
 */
let oneDriveResumeStarted = false;

export function DriveConnectCard({ resumeMode = null }: { resumeMode?: 'token' | 'error' | null }) {
  const owned = ownedGoogleClientId();
  const ownedMicrosoft = ownedMicrosoftClientId();
  const [devAppId, setDevAppId] = useState(() => (import.meta.env.DEV && !owned ? googleClientId() : ''));
  const [devMicrosoftId, setDevMicrosoftId] = useState(() =>
    import.meta.env.DEV && !ownedMicrosoft ? microsoftClientId() : '',
  );
  const [microsoftChecked, setMicrosoftChecked] = useState(
    () => Boolean(ownedMicrosoftClientId()) || import.meta.env.DEV,
  );
  const [binding, setBinding] = useState<CloudBinding | null>(() => connectedBinding());
  const [pending, setPending] = useState<CloudStorageConnector | null>(null);
  const [folders, setFolders] = useState<CloudFolderRef[] | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const connectRef = useRef<(provider: CloudStorageConnector) => Promise<void>>(async () => {});

  useEffect(() => {
    googleClientId();
    let alive = true;
    const stop = subscribeMicrosoftClientId(() => {
      if (alive) setMicrosoftChecked(true);
    });
    void loadMicrosoftClientId().finally(() => {
      if (alive) setMicrosoftChecked(true);
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  const choices = cloudStorageChoices();
  const photos = cloudStorage('googlePhotos');
  const photosBinding = useSyncExternalStore(photos.subscribe, photos.getBindingSnapshot, () => null);
  const connected = binding ? cloudStorage(binding.providerId) : null;

  const connect = async (provider: CloudStorageConnector) => {
    if (provider.phase !== 'live' || !provider.isAvailable()) return;
    setBusyId(provider.id);
    setError('');
    let leaving = false;
    try {
      const result = await provider.connect();
      if (!result.ok) {
        if (result.reason === 'redirecting') {
          leaving = true;
          return;
        }
        setError(result.message);
        return;
      }
      setPending(provider);
      setSession(result.session);
      setFolders(result.folders);
    } catch (reason) {
      setError(ownerError(provider, reason));
    } finally {
      if (!leaving) setBusyId(null);
    }
  };
  connectRef.current = connect;

  useEffect(() => {
    if (!resumeMode || oneDriveResumeStarted) return;
    if (resumeMode === 'error') {
      oneDriveResumeStarted = true;
      setError(takeOneDriveResumeError());
      return;
    }
    const provider = cloudStorage('oneDrive');
    if (!provider.isAvailable()) return;
    oneDriveResumeStarted = true;
    clearOneDriveResumeFlag();
    void connectRef.current(provider);
  }, [resumeMode, microsoftChecked]);

  const choose = async (folder: CloudFolderRef) => {
    if (!session || !pending) return;
    setBusyId(pending.id);
    setError('');
    try {
      const next = await pending.pickFolder(session, folder);
      setFolders(null);
      setPending(null);
      setSession(null);
      if (next.providerId !== 'googlePhotos') setBinding(next);
    } catch (reason) {
      setError(ownerError(pending, reason));
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
      setError(ownerError(pending, reason));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <article className="plan-card">
      <p className="plan-card__kicker">{connected ? connected.displayName : CONNECT_WITH_KICKER}</p>
      <strong>{binding ? binding.folderName : CONNECT_WITH_TITLE}</strong>
      {binding ? <span>{connectedDetail(binding)}</span> : <span>{CONNECT_WITH_BODY}</span>}
      <p className="drive-connect__note">{CONNECT_ACCOUNT_NOTE}</p>
      {import.meta.env.DEV && (!owned || !ownedMicrosoft) ? (
        <details className="drive-connect__advanced">
          <summary>Advanced</summary>
          <div className="drive-connect__dev">
            {!owned ? (
              <>
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
              </>
            ) : null}
            {!ownedMicrosoft ? (
              <>
                <p>{ONEDRIVE_DEV_CLIENT_HINT}</p>
                <label className="drive-connect__field">
                  OneDrive app id
                  <input
                    value={devMicrosoftId}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => {
                      const next = event.target.value;
                      setDevMicrosoftId(next);
                      saveMicrosoftClientId(next);
                    }}
                  />
                </label>
              </>
            ) : null}
          </div>
        </details>
      ) : null}
      {binding ? (
        <div className="drive-connect__actions">
          {binding.providerId === 'googleDrive' ? (
            <Link className="btn" to="/class-history">
              {CLASS_HISTORY_TITLE}
            </Link>
          ) : null}
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
        <>
          {choices.some((provider) => provider.id === 'googleDrive' && provider.isAvailable()) ? (
            <p className="drive-connect__note">{CONNECT_GOOGLE_UNVERIFIED_NOTE}</p>
          ) : null}
          <ul className="drive-connect__providers" aria-label={CONNECT_WITH_TITLE}>
            {choices.filter((provider) => provider.id !== 'googlePhotos' || !photosBinding).map((provider) => {
              const comingForLaunch = provider.phase === 'coming-for-launch';
              const waitingForMicrosoft = provider.id === 'oneDrive' && !microsoftChecked;
              const canConnect = provider.phase === 'live' && provider.isAvailable();
              const opening = busyId === provider.id;
              return (
                <li key={provider.id}>
                  <button
                    type="button"
                    className={canConnect ? 'btn' : comingForLaunch ? 'btn btn--ghost' : 'btn btn--ghost btn--unavailable'}
                    disabled={!canConnect || busyId !== null || waitingForMicrosoft}
                    onClick={() => void connect(provider)}
                  >
                    {opening ? `Opening ${provider.displayName}…` : provider.displayName}
                    {comingForLaunch ? <span className="drive-connect__soon">{CONNECT_LAUNCH_BADGE}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {!binding && !folders
        ? choices
            .filter((provider) => {
              if (provider.id === 'oneDrive' && !microsoftChecked) return false;
              return provider.phase === 'live' && !provider.isAvailable();
            })
            .map((provider) => (
              <p key={provider.id} className="drive-connect__note" role="status">
                {provider.unavailableMessage()}
              </p>
            ))
        : null}
      {!folders && photosBinding ? (
        <div className="drive-connect__actions">
          <p className="drive-connect__note">
            {photosBinding.accountLabel ? `${photosBinding.accountLabel}. ` : ''}
            {PHOTOS_CONNECTED}
          </p>
          <a className="btn btn--ghost" href={photos.openFolderUrl(photosBinding.folderId) ?? undefined} target="_blank" rel="noreferrer">
            Open Google Photos
          </a>
          <button type="button" className="btn btn--ghost" onClick={() => photos.disconnect()}>
            Disconnect Google Photos
          </button>
        </div>
      ) : null}
      {!folders && binding && !photosBinding && photos.phase === 'live' ? (
        photos.isAvailable() ? (
          <>
            <p className="drive-connect__note">{CONNECT_GOOGLE_UNVERIFIED_NOTE}</p>
            <button
              type="button"
              className="btn"
              disabled={busyId !== null}
              onClick={() => void connect(photos)}
            >
              {busyId === 'googlePhotos' ? 'Opening Google Photos…' : 'Google Photos'}
            </button>
          </>
        ) : (
          <p className="drive-connect__note" role="status">
            {photos.unavailableMessage()}
          </p>
        )
      ) : null}
      {folders && pending ? (
        <div className="drive-connect__folders">
          <p>{pending.choosePrompt ?? CONNECT_CHOOSE_FOLDER}</p>
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
            <p>{pending.emptyFolderMessage ?? DRIVE_FOLDER_EMPTY}</p>
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
