import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AcademyQrScanner } from '../../components/AcademyQrScanner';
import { GoogleDriveFolderTools } from '../../components/GoogleDriveFolderTools';
import { loadBracketPhotos } from '../../lib/bracketPhoto';
import {
  ACADEMY_ACCESS_ERROR,
  ACADEMY_CONNECT_LABEL,
  ACADEMY_FREE_NOTE,
  STUDENT_ONEDRIVE_INTENT_KEY,
  clearPendingPathway,
  clearStudentDriveLink,
  loadAcademyLink,
  loadPersonalDrive,
  parseAcademyInput,
  probeGoogleFolder,
  probeOneDriveFolder,
  providerLabel,
  readPendingPathway,
  rememberPendingPathway,
  rememberStudentOneDriveIntent,
  saveStudentDriveLink,
  takeStudentOneDriveIntent,
  type AcademyPathway,
  type StudentDriveLink,
} from '../../lib/academyPathway';
import { subscribeGoogleDriveDisconnect } from '../../lib/driveSession';
import { driveAccountEmail, driveSignInFailureCopy, listDriveFolders, requestDriveConsent } from '../../lib/googleDrive';
import {
  dismissOneDriveResume,
  listOneDriveItems,
  oneDriveAccountLabel,
  oneDriveSignInFailureCopy,
  readOneDriveSession,
} from '../../lib/oneDrive';
import { requestOneDriveConsent } from '../../lib/oneDriveAuth';
import { loadRankPictures } from '../../lib/rankPhotos';
import {
  BACKUP_BEFORE_CLEAR,
  BACK_UP_FIRST_LABEL,
  BACKUP_REPLACE_WARN,
  CLEAR_CONFIRM_PHRASE,
  CLEAR_STUDENT_DATA_ITEMS,
  CLEAR_STUDENT_DEVICE_NOTE,
  applyBackupToMemory,
  clearStudentMemory,
  filmBlobsFromBackup,
  parseStudentBackup,
  studentExportBusyLabel,
  type StudentBackupFile,
  type StudentExportKind,
} from '../../lib/studentBackup';
import { runStudentEditionExport } from '../../lib/studentBackupExport';
import { backupStampLabel, readStudentBackupStamp } from '../../lib/studentBackupStamp';
import { clearFilmBlobs, putFilmBlob } from '../../lib/studentFilm';
import { LeatherHeader, StudentMarks, useStudentPath } from './chrome';
import { ExportChoices } from './ExportChoices';

export function AcademyConnectPage() {
  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title={ACADEMY_CONNECT_LABEL} />
      <div className="student-paper">
        <div className="student-sheet student-connections">
          <AcademyConnect showHeading={false} />
        </div>
      </div>
    </main>
  );
}

export function ConnectionsPage() {
  const to = useStudentPath();
  const [includeVideos, setIncludeVideos] = useState(false);
  const [busyKind, setBusyKind] = useState<StudentExportKind | null>(null);
  const [stamp, setStamp] = useState(() => backupStampLabel(readStudentBackupStamp(localStorage)));
  const exportFile = async (kind: StudentExportKind) => {
    setBusyKind(kind);
    try {
      const result = await runStudentEditionExport(kind, { includeVideos });
      if (kind === 'json' && result.ok) setStamp(backupStampLabel(readStudentBackupStamp(localStorage)));
      return result;
    } finally {
      setBusyKind(null);
    }
  };
  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Connections" />
      <div className="student-paper">
        <div className="student-sheet student-connections">
          <AcademyConnect />
          <PersonalDrive />
          <ExportAndPrint
            to={to}
            includeVideos={includeVideos}
            setIncludeVideos={setIncludeVideos}
            busyKind={busyKind}
            stamp={stamp}
            onExport={exportFile}
          />
          <section className="ink" aria-label="Import from coach">
            <h2>Import from coach</h2>
            <p className="student-quiet">
              Import from coach takes a coach plan or coach feedback file, the file a coach sends back. It is a suggestion and does not change your rubric marks, checkpoints, journal, or goals. The progress file you make for your coach is a different file. On that page it is not imported as a coach file. You can merge it after you confirm. A backup restores from Restore from backup above.
            </p>
            <Link className="ink-btn" to={to('/student/share#import')}>
              Import from coach
            </Link>
          </section>
          <ClearStudentData busyKind={busyKind} onBackup={() => exportFile('json')} />
        </div>
      </div>
    </main>
  );
}

function AcademyConnect({ showHeading = true }: { showHeading?: boolean }) {
  const [params] = useSearchParams();
  const [text, setText] = useState('');
  const [pathway, setPathway] = useState<AcademyPathway | null>(null);
  const [linked, setLinked] = useState<StudentDriveLink | null>(() => loadAcademyLink(localStorage));
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeGoogleDriveDisconnect(() => setLinked(loadAcademyLink(localStorage))), []);

  const useLink = (value: string) => {
    const parsed = parseAcademyInput(value);
    if (!parsed) {
      setPathway(null);
      setError('That is not an academy link. Paste the link from your coach, or open the QR on this phone.');
      return;
    }
    setPathway(parsed);
    setError('');
    setStatus(`${parsed.folderName} on ${providerLabel(parsed.provider)}. ${ACADEMY_FREE_NOTE}`);
  };

  const finish = async (next: AcademyPathway) => {
    setBusy(true);
    setError('');
    try {
      if (next.provider === 'googleDrive') {
        const auth = await requestDriveConsent();
        if (!auth.ok) {
          setError(driveSignInFailureCopy(auth));
          return;
        }
        const probed = await probeGoogleFolder(auth.token, next.folderId);
        if (!probed.ok) {
          setError(probed.error || ACADEMY_ACCESS_ERROR);
          return;
        }
        const email = await driveAccountEmail(auth.token).catch(() => null);
        const saved = saveStudentDriveLink(localStorage, {
          role: 'academy',
          provider: 'googleDrive',
          folderId: next.folderId,
          folderName: probed.name || next.folderName,
          accountLabel: email,
          gymName: next.gymName,
        });
        setLinked(saved);
        setStatus(`Connected to ${saved.folderName}. ${ACADEMY_FREE_NOTE}`);
        clearPendingPathway();
        return;
      }
      rememberPendingPathway(next);
      rememberStudentOneDriveIntent('academy');
      const auth = await requestOneDriveConsent();
      if (!auth.ok) {
        if (auth.code === 'redirecting') return;
        setError(oneDriveSignInFailureCopy(auth));
        return;
      }
      const probed = await probeOneDriveFolder(auth.token, next.folderId);
      if (!probed.ok) {
        setError(probed.error || ACADEMY_ACCESS_ERROR);
        return;
      }
      const saved = saveStudentDriveLink(localStorage, {
        role: 'academy',
        provider: 'oneDrive',
        folderId: next.folderId,
        folderName: probed.name || next.folderName,
        accountLabel: auth.accountLabel,
        gymName: next.gymName,
      });
      setLinked(saved);
      setStatus(`Connected to ${saved.folderName}. ${ACADEMY_FREE_NOTE}`);
      clearPendingPathway();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const fromQuery = params.get('academy');
    if (fromQuery) useLink(fromQuery);
    let intent: string | null = null;
    try {
      intent = sessionStorage.getItem(STUDENT_ONEDRIVE_INTENT_KEY);
    } catch {
      intent = null;
    }
    if (intent !== 'academy') return;
    takeStudentOneDriveIntent();
    dismissOneDriveResume();
    const pending = readPendingPathway();
    if (pending) {
      setPathway(pending);
      void finish(pending);
    }
    // finish is recreated each render; this resume runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="ink" aria-label={ACADEMY_CONNECT_LABEL}>
      {showHeading ? <h2>{ACADEMY_CONNECT_LABEL}</h2> : null}
      <p className="student-quiet">
        Scan the academy QR, take a photo of it, or paste the academy link. You sign in to that Google Drive or OneDrive folder. {ACADEMY_FREE_NOTE}
      </p>
      <AcademyQrScanner onScan={useLink} />
      {linked ? (
        <p role="status">
          Connected to {linked.folderName} on {providerLabel(linked.provider)}
          {linked.gymName ? ` · ${linked.gymName}` : ''}.
        </p>
      ) : null}
      <label className="ink">
        <span className="ink__label">Academy link</span>
        <input
          aria-label="Academy link"
          value={text}
          placeholder="Paste the academy link"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div className="student-clip__actions">
        <button type="button" className="ink-btn" onClick={() => useLink(text)}>
          Use this academy link
        </button>
        {pathway ? (
          <button type="button" className="ink-btn ink-btn--save ink-btn--keep" disabled={busy} onClick={() => void finish(pathway)}>
            {busy ? 'Connecting…' : `Sign in to ${providerLabel(pathway.provider)}`}
          </button>
        ) : null}
        {linked ? (
          <button
            type="button"
            className="ink-btn"
            onClick={() => {
              clearStudentDriveLink(localStorage, 'academy');
              setLinked(null);
              setStatus('Academy folder disconnected on this phone. The folder itself is unchanged.');
            }}
          >
            Disconnect academy folder
          </button>
        ) : null}
      </div>
      {linked?.provider === 'googleDrive' ? (
        <GoogleDriveFolderTools
          folderId={linked.folderId}
          buttonClassName="ink-btn"
          primaryClassName="ink-btn ink-btn--save ink-btn--keep"
          picker="inline"
          onPick={(folder) => {
            const saved = saveStudentDriveLink(localStorage, {
              ...linked,
              folderId: folder.id,
              folderName: folder.name,
            });
            setLinked(saved);
            setStatus(`Connected to ${saved.folderName}. ${ACADEMY_FREE_NOTE}`);
          }}
          onDisconnected={() => {
            setLinked(loadAcademyLink(localStorage));
            setStatus('Google Drive is disconnected on this device. Connect again to pick a folder or account.');
          }}
        />
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function PersonalDrive() {
  const [linked, setLinked] = useState<StudentDriveLink | null>(() => loadPersonalDrive(localStorage));
  const [folders, setFolders] = useState<{ id: string; name: string; provider: 'googleDrive' | 'oneDrive' }[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeGoogleDriveDisconnect(() => setLinked(loadPersonalDrive(localStorage))), []);

  const pick = async (provider: 'googleDrive' | 'oneDrive', folderId: string, folderName: string, accountLabel: string | null) => {
    const saved = saveStudentDriveLink(localStorage, {
      role: 'personal',
      provider,
      folderId,
      folderName,
      accountLabel,
      gymName: '',
    });
    setLinked(saved);
    setFolders([]);
    setStatus(`Personal backups can save to ${saved.folderName} on ${providerLabel(provider)}.`);
  };

  const connectGoogle = async () => {
    setBusy(true);
    setError('');
    try {
      const auth = await requestDriveConsent();
      if (!auth.ok) {
        setError(driveSignInFailureCopy(auth));
        return;
      }
      const listed = await listDriveFolders(auth.token);
      const email = await driveAccountEmail(auth.token).catch(() => null);
      setAccount(email);
      setFolders(listed.map((folder) => ({ id: folder.id, name: folder.name, provider: 'googleDrive' as const })));
      if (!listed.length) setError('Google Drive did not list a folder. Create one in Drive, then try again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Drive could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const connectOne = async () => {
    setBusy(true);
    setError('');
    rememberStudentOneDriveIntent('personal');
    try {
      const auth = await requestOneDriveConsent();
      if (!auth.ok) {
        if (auth.code === 'redirecting') return;
        setError(oneDriveSignInFailureCopy(auth));
        return;
      }
      await showOneDriveFolders(auth.token);
    } finally {
      setBusy(false);
    }
  };

  const showOneDriveFolders = async (token: string) => {
    const listed = await listOneDriveItems(token, { foldersOnly: true });
    const email = await oneDriveAccountLabel(token).catch(() => null);
    setAccount(email);
    setFolders(listed.map((folder) => ({ id: folder.id, name: folder.name, provider: 'oneDrive' as const })));
    setStatus(email ? `Signed in as ${email}. Choose a folder.` : 'Choose a folder.');
    if (!listed.length) setError('OneDrive did not list a folder.');
  };

  useEffect(() => {
    const intent = sessionStorage.getItem(STUDENT_ONEDRIVE_INTENT_KEY);
    if (intent !== 'personal') return;
    const session = readOneDriveSession();
    if (!session) return;
    takeStudentOneDriveIntent();
    dismissOneDriveResume();
    void showOneDriveFolders(session.token);
  }, []);

  return (
    <section className="ink ink--wobble" aria-label="My own drive">
      <h2>My own drive</h2>
      <p className="student-quiet">
        Connect a drive you own for personal backups. This is separate from the academy folder. Google Photos and iCloud are not a backup folder in this build yet.
      </p>
      {linked ? (
        <p role="status">
          {providerLabel(linked.provider)} · {linked.folderName}
          {linked.accountLabel ? ` · ${linked.accountLabel}` : ''}
        </p>
      ) : null}
      <div className="student-clip__actions">
        <button type="button" className="ink-btn" disabled={busy} onClick={() => void connectGoogle()}>
          Connect Google Drive
        </button>
        <button type="button" className="ink-btn" disabled={busy} onClick={() => void connectOne()}>
          Connect OneDrive
        </button>
        {linked ? (
          <button
            type="button"
            className="ink-btn"
            onClick={() => {
              clearStudentDriveLink(localStorage, 'personal');
              setLinked(null);
              setStatus('Personal drive disconnected on this phone. Files already in that folder stay there.');
            }}
          >
            Disconnect my drive
          </button>
        ) : null}
      </div>
      {linked?.provider === 'googleDrive' ? (
        <GoogleDriveFolderTools
          folderId={linked.folderId}
          buttonClassName="ink-btn"
          primaryClassName="ink-btn ink-btn--save ink-btn--keep"
          picker="inline"
          onPick={(folder) => {
            const saved = saveStudentDriveLink(localStorage, {
              ...linked,
              folderId: folder.id,
              folderName: folder.name,
            });
            setLinked(saved);
            setFolders([]);
            setStatus(`Personal backups can save to ${saved.folderName} on ${providerLabel('googleDrive')}.`);
          }}
          onDisconnected={() => {
            setLinked(loadPersonalDrive(localStorage));
            setFolders([]);
            setStatus('Google Drive is disconnected on this device. Connect again to pick a folder or account.');
          }}
        />
      ) : null}
      {folders.length ? (
        <ul className="student-connections__folders">
          {folders.map((folder) => (
            <li key={folder.id}>
              <button type="button" className="ink-btn" onClick={() => void pick(folder.provider, folder.id, folder.name, account)}>
                {`Use ${folder.name}`}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="student-connections__later">
        <li>Google Photos — coming later for personal backups</li>
        <li>iCloud — coming later for personal backups</li>
      </ul>
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function ExportAndPrint({
  to,
  includeVideos,
  setIncludeVideos,
  busyKind,
  stamp,
  onExport,
}: {
  to: (path: string) => string;
  includeVideos: boolean;
  setIncludeVideos: (value: boolean) => void;
  busyKind: StudentExportKind | null;
  stamp: string;
  onExport: (kind: StudentExportKind) => Promise<{ ok: boolean; message: string }>;
}) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<StudentBackupFile | null>(null);
  const working = busy || busyKind !== null;

  const exportFile = async (kind: StudentExportKind) => {
    setError('');
    setStatus('');
    const result = await onExport(kind);
    if (result.ok) setStatus(result.message);
    else setError(result.message);
  };

  const apply = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'replace') await clearFilmBlobs().catch(() => undefined);
      const result = applyBackupToMemory(localStorage, pending, mode, {
        rank: loadRankPictures(),
        bracket: loadBracketPhotos(),
      });
      for (const item of filmBlobsFromBackup(pending)) await putFilmBlob(item.id, item.blob);
      setStatus(result.note);
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore that backup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ink" aria-label="Export and print">
      <h2>Export and print</h2>
      <p className="student-quiet">
        Back up my journal downloads one JSON file. That file restores this phone. Each other button downloads one file. If your gym does not use Advantage, print the progress report or the self-assessment and hand that page to your instructor.
      </p>
      <ExportChoices
        variant="paper"
        includeVideos={includeVideos}
        onIncludeVideos={setIncludeVideos}
        locked={working}
        busyKind={busyKind}
        stamp={stamp}
        showStamp
        onExport={(kind) => void exportFile(kind)}
      />
      <div className="student-export">
        <Link className="ink-btn" to={to('/student/print/progress')}>
          Print progress report
        </Link>
        <Link className="ink-btn" to={to('/student/print/assessment')}>
          Print self-assessment
        </Link>
      </div>
      <h3>Restore from backup</h3>
      <input
        type="file"
        accept="application/json,.json"
        aria-label="Restore from backup"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void file.text().then((text) => {
            const parsed = parseStudentBackup(text);
            if (!parsed.ok) {
              setError(parsed.error);
              setPending(null);
              return;
            }
            setPending(parsed.file);
            setError('');
            setStatus('Choose merge or replace. Merge keeps records that are only on this phone.');
          });
        }}
      />
      {pending ? (
        <div className="student-confirm" role="group" aria-label="Restore choices">
          <p>{BACKUP_REPLACE_WARN}</p>
          <button type="button" className="ink-btn" disabled={busy} onClick={() => void apply('merge')}>
            Merge with this phone
          </button>
          <button type="button" className="ink-btn" disabled={busy} onClick={() => void apply('replace')}>
            Replace this phone
          </button>
          <button type="button" className="ink-btn" onClick={() => setPending(null)}>
            Cancel restore
          </button>
        </div>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function ClearStudentData({
  busyKind,
  onBackup,
}: {
  busyKind: StudentExportKind | null;
  onBackup: () => Promise<{ ok: boolean; message: string }>;
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [phrase, setPhrase] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const confirmed = phrase.trim() === CLEAR_CONFIRM_PHRASE;

  const reset = () => {
    setStep(0);
    setPhrase('');
  };

  return (
    <section className="student-clear-zone" aria-label="Clear all Student Edition data">
      <h2>Clear all Student Edition data</h2>
      <p>{CLEAR_STUDENT_DEVICE_NOTE}</p>
      {step === 0 ? (
        <button type="button" className="ink-btn ink-btn--danger" onClick={() => setStep(1)}>
          Clear all Student Edition data
        </button>
      ) : null}
      {step === 1 ? (
        <div className="student-confirm" role="group" aria-label="Back up before clear">
          <p>{BACKUP_BEFORE_CLEAR} Back up first downloads one JSON file, then decide.</p>
          <button
            type="button"
            className="ink-btn ink-btn--save"
            disabled={busyKind !== null}
            autoFocus
            onClick={() =>
              void onBackup().then((result) => {
                if (result.ok) {
                  setStatus(result.message);
                  setError('');
                } else {
                  setError(result.message);
                  setStatus('');
                }
              })
            }
          >
            {busyKind === 'json' ? studentExportBusyLabel('json') : BACK_UP_FIRST_LABEL}
          </button>
          <button type="button" className="ink-btn" onClick={() => setStep(2)}>
            Continue without a backup
          </button>
          <button type="button" className="ink-btn" onClick={reset}>
            Cancel
          </button>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="student-confirm" role="group" aria-label="Confirm clear all Student Edition data">
          <p>This erases Student Edition data on this device:</p>
          <ul className="student-clear-list">
            {CLEAR_STUDENT_DATA_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{CLEAR_STUDENT_DEVICE_NOTE}</p>
          <label>
            <span className="ink__label">Type CLEAR to confirm</span>
            <input
              type="text"
              aria-label="Type CLEAR to confirm"
              value={phrase}
              autoComplete="off"
              onChange={(event) => setPhrase(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="ink-btn ink-btn--danger"
            disabled={!confirmed}
            onClick={() => {
              if (phrase.trim() !== CLEAR_CONFIRM_PHRASE) return;
              clearStudentMemory(localStorage);
              void clearFilmBlobs().catch(() => undefined);
              reset();
              setStatus('Student Edition data on this device was cleared.');
              setError('');
            }}
          >
            Erase Student Edition data
          </button>
          <button type="button" className="ink-btn" onClick={reset}>
            Cancel
          </button>
        </div>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
