import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { pdfBlob } from '../../lib/simplePdf';
import {
  BACKUP_BEFORE_CLEAR,
  BACKUP_REPLACE_WARN,
  applyBackupToMemory,
  backupVideoTooLargeMessage,
  buildStudentBackup,
  clearStudentMemory,
  connectedBackupTargets,
  filmBlobsFromBackup,
  parseStudentBackup,
  studentBackupNames,
  type StudentBackupFile,
} from '../../lib/studentBackup';
import { copyFilesToStudentDrive } from '../../lib/studentDriveCopy';
import { loadStudentReport, todayIso } from '../../lib/studentEdition';
import { clearFilmBlobs, getFilmBlob, loadFilms, putFilmBlob } from '../../lib/studentFilm';
import { loadAssessments } from '../../lib/studentAssessment';
import { loadScouting } from '../../lib/studentScouting';
import { loadCoachShelf } from '../../lib/studentTools';
import { LeatherHeader, StudentMarks, useStudentPath } from './chrome';

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ConnectionsPage() {
  const to = useStudentPath();
  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Connections" />
      <div className="student-paper">
        <div className="student-sheet student-connections">
          <AcademyConnect />
          <PersonalDrive />
          <ExportAndPrint to={to} />
          <section className="ink" aria-label="Import from coach">
            <h2>Import from coach</h2>
            <p className="student-quiet">
              A coach plan or coach feedback file is a suggestion. Importing it does not change your rubric marks, checkpoints, journal, or goals.
            </p>
            <Link className="ink-btn" to={to('/student/share#import')}>
              Import from coach
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}

function AcademyConnect() {
  const [params] = useSearchParams();
  const [text, setText] = useState('');
  const [pathway, setPathway] = useState<AcademyPathway | null>(null);
  const [linked, setLinked] = useState<StudentDriveLink | null>(() => loadAcademyLink(localStorage));
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

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
      <h2>{ACADEMY_CONNECT_LABEL}</h2>
      <p className="student-quiet">
        Paste the academy link from your coach, or open the QR on this phone. You sign in to that Google Drive or OneDrive folder. {ACADEMY_FREE_NOTE}
      </p>
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
          <button type="button" className="ink-btn ink-btn--save" disabled={busy} onClick={() => void finish(pathway)}>
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

function ExportAndPrint({ to }: { to: (path: string) => string }) {
  const [includeVideos, setIncludeVideos] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<StudentBackupFile | null>(null);
  const [clearStep, setClearStep] = useState<0 | 1 | 2>(0);

  const backup = async () => {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const films = loadFilms(localStorage);
      const blobs = includeVideos
        ? await Promise.all(films.map(async (film) => ({ id: film.id, blob: await getFilmBlob(film.id).catch(() => null) })))
        : [];
      const built = await buildStudentBackup({
        report: loadStudentReport(localStorage),
        assessment: loadAssessments(localStorage),
        scouting: loadScouting(localStorage),
        rankPhotos: loadRankPictures(),
        bracketPhotos: loadBracketPhotos(),
        shelf: loadCoachShelf(localStorage),
        films,
        blobs,
        includeVideos,
      });
      const names = studentBackupNames(todayIso());
      downloadBlob(names.json, new Blob([built.json], { type: 'application/json' }));
      downloadBlob(names.csv, new Blob([built.csv], { type: 'text/csv' }));
      downloadBlob(names.progressPdf, pdfBlob(built.progressPdf));
      downloadBlob(names.assessmentPdf, pdfBlob(built.assessmentPdf));
      const files = [
        { name: names.json, bytes: new Blob([built.json], { type: 'application/json' }), mime: 'application/json' },
        { name: names.csv, bytes: new Blob([built.csv], { type: 'text/csv' }), mime: 'text/csv' },
        { name: names.progressPdf, bytes: pdfBlob(built.progressPdf), mime: 'application/pdf' },
        { name: names.assessmentPdf, bytes: pdfBlob(built.assessmentPdf), mime: 'application/pdf' },
      ];
      const targets = connectedBackupTargets(localStorage);
      if (!targets.length) {
        setStatus('Saved on this phone. No academy folder or personal drive is connected.');
        return;
      }
      const notes: string[] = ['Saved on this phone.'];
      for (const target of targets) {
        const copied = await copyFilesToStudentDrive(target, files);
        if (copied.error) notes.push(`${providerLabel(target.provider)} did not take the copy. ${copied.error}`);
        else notes.push(`Also saved in ${target.folderName} on ${providerLabel(target.provider)}.`);
      }
      setStatus(notes.join(' '));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not build the backup.';
      setError(message.includes('too large') ? message : message || backupVideoTooLargeMessage(0));
    } finally {
      setBusy(false);
    }
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
        Back up my journal saves the journal, rank and stripes with dates, belt progress, competitor data, weight chart, self-assessment, tournaments, scouting, and video library. If your gym does not use Advantage, print the progress report or the self-assessment and hand that page to your instructor.
      </p>
      <label className="cal-gym-toggle">
        <input type="checkbox" checked={includeVideos} onChange={(event) => setIncludeVideos(event.target.checked)} />
        <span>Include video files kept on this phone</span>
      </label>
      <div className="student-clip__actions">
        <button type="button" className="ink-btn ink-btn--save" disabled={busy} onClick={() => void backup()}>
          {busy ? 'Building backup…' : 'Back up my journal'}
        </button>
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
      <h3>Clear journal on this phone</h3>
      {clearStep === 0 ? (
        <button type="button" className="ink-btn" onClick={() => setClearStep(1)}>
          Clear journal on this phone
        </button>
      ) : null}
      {clearStep === 1 ? (
        <div className="student-confirm" role="group" aria-label="Backup recommended">
          <p>{BACKUP_BEFORE_CLEAR}</p>
          <button type="button" className="ink-btn ink-btn--save" onClick={() => void backup()}>
            Back up my journal
          </button>
          <button type="button" className="ink-btn" onClick={() => setClearStep(2)}>
            Continue to clear
          </button>
          <button type="button" className="ink-btn" onClick={() => setClearStep(0)}>
            Cancel clear
          </button>
        </div>
      ) : null}
      {clearStep === 2 ? (
        <div className="student-confirm" role="group" aria-label="Confirm clear journal">
          <p>
            This removes the journal, rank, belt progress, competitor data, weight chart, self-assessment, tournaments, scouting, and videos on this phone. Academy and personal drive connections stay.
          </p>
          <button
            type="button"
            className="ink-btn"
            onClick={() => {
              clearStudentMemory(localStorage);
              void clearFilmBlobs().catch(() => undefined);
              setClearStep(0);
              setStatus('The journal on this phone was cleared.');
            }}
          >
            Confirm clear journal
          </button>
          <button type="button" className="ink-btn" onClick={() => setClearStep(0)}>
            Cancel clear
          </button>
        </div>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
