import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DriveMediaPicker } from './DriveMediaPicker';
import { GoogleDriveFolderTools } from './GoogleDriveFolderTools';
import { classHistoryHref } from '../lib/submenuNav';
import {
  cloudStorage,
  cloudStorageChoices,
  CONNECT_ACCOUNT_NOTE,
  CONNECT_CHOOSE_FOLDER,
  CONNECT_GOOGLE_UNVERIFIED_NOTE,
  CONNECT_WITH_BODY,
  CONNECT_WITH_KICKER,
  CONNECT_WITH_TITLE,
  type CloudBinding,
  type CloudFolderRef,
  type CloudStorageConnector,
} from '../lib/cloudStorage';
import {
  driveGallerySavedCopy,
  driveImportChunkSize,
  driveImportOutcomeNote,
  driveImportProgressLabel,
  driveImportSaveErrorNote,
  runDriveImport,
  type DriveBrowseMedia,
} from '../lib/driveMediaPicker';
import {
  CLASS_HISTORY_TITLE,
  DRIVE_BROWSE_LABEL,
  DRIVE_CHECKING_LABEL,
  DRIVE_DEV_CLIENT_HINT,
  DRIVE_FOLDER_EMPTY,
  DRIVE_RECONNECT_LABEL,
  DRIVE_RECONNECT_NOTE,
  DRIVE_SCOPE_NOTE,
  downloadDriveFile,
  driveOwnerFacingError,
  driveSignInFailureCopy,
  ensureDriveBrowseAccess,
  getDriveBindingSnapshot,
  googleClientId,
  listDriveFolderLevel,
  openDriveChangeFolder,
  ownedGoogleClientId,
  readDriveBinding,
  requestDriveConsent,
  saveGoogleClientId,
  subscribeDriveBinding,
  tokenForDriveFolderChange,
  type DriveBrowseAccess,
  type DriveFolderLevel,
} from '../lib/googleDrive';
import { PHOTOS_CONNECTED, photosOwnerFacingError } from '../lib/googlePhotos';
import { addDriveMediaFiles } from '../lib/photoStore';
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
 * The list is the live providers only. The build supplies sign-in. Owners do
 * not type a setup code.
 */
let oneDriveResumeStarted = false;

export function DriveConnectCard({
  resumeMode = null,
  onReady,
  changeFolderOnOpen = false,
}: {
  resumeMode?: 'token' | 'error' | null;
  /** Fired after a reconnect grants a token that can browse. */
  onReady?: () => void;
  /** Open the folder picker once, without clearing the connected folder. */
  changeFolderOnOpen?: boolean;
}) {
  const location = useLocation();
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
  const [access, setAccess] = useState<DriveBrowseAccess | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [pickNote, setPickNote] = useState('');
  const [folderLevel, setFolderLevel] = useState<DriveFolderLevel | null>(null);
  const connectRef = useRef<(provider: CloudStorageConnector) => Promise<void>>(async () => {});
  const changeFolderRef = useRef<() => Promise<void>>(async () => {});
  const openedChange = useRef(false);

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
  const googleConnected = binding?.providerId === 'googleDrive';

  useEffect(() => {
    return subscribeDriveBinding(() => {
      setBinding((current) => {
        if (current && current.providerId !== 'googleDrive') return current;
        const stored = getDriveBindingSnapshot();
        if (!stored) return null;
        return cloudStorage('googleDrive').binding();
      });
    });
  }, []);

  useEffect(() => {
    if (!googleConnected) {
      setAccess(null);
      setBrowseOpen(false);
      setFolderLevel(null);
      return;
    }
    let cancelled = false;
    setAccess(null);
    void ensureDriveBrowseAccess().then((next) => {
      if (!cancelled) setAccess(next);
    });
    return () => {
      cancelled = true;
    };
  }, [googleConnected, binding]);

  const changeFolder = async () => {
    setBusyId('googleDrive');
    setError('');
    setPickNote('');
    try {
      const auth = await tokenForDriveFolderChange();
      if (!auth.ok) {
        setError(driveSignInFailureCopy(auth));
        return;
      }
      if (!readDriveBinding()) return;
      const provider = cloudStorage('googleDrive');
      const next = await openDriveChangeFolder(auth.token, binding?.folderId ?? readDriveBinding()?.folderId ?? null);
      if (!readDriveBinding()) return;
      setPending(provider);
      setSession(auth.token);
      setFolders(next.folders);
      setFolderLevel(next.upLabel ? next : null);
      setAccess({ state: 'ready', token: auth.token });
    } catch (reason) {
      setError(driveOwnerFacingError(reason));
    } finally {
      setBusyId(null);
    }
  };
  changeFolderRef.current = changeFolder;

  const goUp = async () => {
    if (!session || !folderLevel?.upLabel) return;
    setBusyId('googleDrive');
    setError('');
    try {
      const parentId = folderLevel.upToAccount ? null : folderLevel.upFolderId;
      const next = await listDriveFolderLevel(session, parentId);
      setFolders(next.folders);
      setFolderLevel(next.upLabel ? next : null);
    } catch (reason) {
      setError(driveOwnerFacingError(reason));
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    if (!changeFolderOnOpen || openedChange.current || !googleConnected) return;
    openedChange.current = true;
    void changeFolderRef.current();
  }, [changeFolderOnOpen, googleConnected]);

  const reconnect = async () => {
    setBusyId('googleDrive');
    setError('');
    setPickNote('');
    try {
      const auth = await requestDriveConsent();
      if (!auth.ok) {
        setError(driveSignInFailureCopy(auth));
        return;
      }
      const next = await ensureDriveBrowseAccess();
      setAccess(next);
      if (next.state === 'ready') onReady?.();
      else setError(next.reason === 'scopes' ? DRIVE_SCOPE_NOTE : DRIVE_RECONNECT_NOTE);
    } catch (reason) {
      setError(driveOwnerFacingError(reason));
    } finally {
      setBusyId(null);
    }
  };

  const importPicked = async (chosen: readonly DriveBrowseMedia[]) => {
    setBrowseOpen(false);
    const picked = [...chosen];
    if (!picked.length) return;
    const token = access?.state === 'ready' ? access.token : null;
    if (!token) {
      setAccess({ state: 'reconnect', reason: 'expired' });
      setPickNote(DRIVE_RECONNECT_NOTE);
      return;
    }
    setBusyId('googleDrive');
    setPickNote(driveImportProgressLabel(0, picked.length));
    setError('');
    try {
      const result = await runDriveImport({
        items: picked,
        chunkSize: driveImportChunkSize('any'),
        download: async (item) => {
          const blob = await downloadDriveFile(token, item.id);
          const type = item.mime || blob.type || 'application/octet-stream';
          return {
            file: new File([blob], item.name || 'Drive file', { type }),
            driveFileId: item.id,
          };
        },
        save: (files, report) => addDriveMediaFiles([...files], 'gallery', { onProgress: report }),
        onLabel: setPickNote,
      });
      if (!result.ok) {
        setPickNote(driveImportSaveErrorNote(result.error, result.outcome.added, result.outcome.picked));
        return;
      }
      setPickNote(driveImportOutcomeNote(result.outcome) ?? driveGallerySavedCopy(result.outcome.added));
    } catch (reason) {
      setPickNote(driveOwnerFacingError(reason));
    } finally {
      setBusyId(null);
    }
  };

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
      setFolderLevel(null);
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
      setFolderLevel(null);
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
            <Link className="btn" to={classHistoryHref(location.pathname, location.search)}>
              {CLASS_HISTORY_TITLE}
            </Link>
          ) : null}
          {googleConnected && access?.state === 'ready' ? (
            <button
              type="button"
              className="btn"
              disabled={busyId !== null}
              onClick={() => {
                setPickNote('');
                setError('');
                setBrowseOpen(true);
              }}
            >
              {DRIVE_BROWSE_LABEL}
            </button>
          ) : null}
          {googleConnected && access?.state === 'reconnect' ? (
            <button type="button" className="btn" disabled={busyId !== null} onClick={() => void reconnect()}>
              {busyId === 'googleDrive' ? 'Opening Google Drive…' : DRIVE_RECONNECT_LABEL}
            </button>
          ) : null}
          {googleConnected ? (
            <GoogleDriveFolderTools
              folderId={binding.folderId}
              busy={busyId !== null}
              picker="external"
              onChangeFolder={changeFolder}
              onDisconnected={() => {
                setBinding(null);
                setPending(null);
                setSession(null);
                setFolders(null);
                setFolderLevel(null);
                setAccess(null);
                setBrowseOpen(false);
                setPickNote('');
                setError('');
              }}
            />
          ) : (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                connected?.disconnect();
                setBinding(null);
                setPending(null);
                setSession(null);
                setFolders(null);
                setFolderLevel(null);
                setAccess(null);
                setBrowseOpen(false);
                setPickNote('');
              }}
            >
              Disconnect
            </button>
          )}
        </div>
      ) : folders ? null : (
        <>
          {choices.some((provider) => provider.id === 'googleDrive' && provider.isAvailable()) ? (
            <p className="drive-connect__note">{CONNECT_GOOGLE_UNVERIFIED_NOTE}</p>
          ) : null}
          <ul className="drive-connect__providers" aria-label={CONNECT_WITH_TITLE}>
            {choices.filter((provider) => provider.id !== 'googlePhotos' || !photosBinding).map((provider) => {
              const waitingForMicrosoft = provider.id === 'oneDrive' && !microsoftChecked;
              const canConnect = provider.phase === 'live' && provider.isAvailable();
              const opening = busyId === provider.id;
              return (
                <li key={provider.id}>
                  <button
                    type="button"
                    className={canConnect ? 'btn' : 'btn btn--ghost btn--unavailable'}
                    disabled={!canConnect || busyId !== null || waitingForMicrosoft}
                    onClick={() => void connect(provider)}
                  >
                    {opening ? `Opening ${provider.displayName}…` : provider.displayName}
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
          {folderLevel?.upLabel ? (
            <button type="button" className="btn btn--ghost" disabled={busyId !== null} onClick={() => void goUp()}>
              {folderLevel.upLabel}
            </button>
          ) : null}
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
      {googleConnected && access === null ? (
        <p className="drive-connect__note" role="status">
          {DRIVE_CHECKING_LABEL}
        </p>
      ) : null}
      {googleConnected && access?.state === 'reconnect' ? (
        <p className="drive-connect__note">{access.reason === 'scopes' ? DRIVE_SCOPE_NOTE : DRIVE_RECONNECT_NOTE}</p>
      ) : null}
      {pickNote ? (
        <p className="drive-connect__note" role="status">
          {pickNote}
        </p>
      ) : null}
      {error ? (
        <p className="drive-connect__error" role="status">
          {error}
        </p>
      ) : null}
      {googleConnected ? (
        <DriveMediaPicker
          open={browseOpen}
          kind="any"
          stacked
          onClose={() => setBrowseOpen(false)}
          onDone={(files) => {
            void importPicked(files);
          }}
        />
      ) : null}
    </article>
  );
}
