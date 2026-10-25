import { useState } from 'react';
import { Link } from 'react-router-dom';
import { loadBracketPhotos } from '../../lib/bracketPhoto';
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
import { clearFilmBlobs, putFilmBlob } from '../../lib/studentFilm';
import { loadRankPictures } from '../../lib/rankPhotos';
import { BACKUP_GROUP_LABEL, BACKUP_LINKS, CLEAR_STUDENT_LABEL } from '../../lib/studentHubMenu';
import { backupStampLabel, readStudentBackupStamp } from '../../lib/studentBackupStamp';
import { UpdateToLatestButton } from '../../components/UpdateToLatestButton';
import { useStudentPath } from './chrome';
import { ExportChoices } from './ExportChoices';
import { GroupFrame, MenuList, MenuRow } from './groupChrome';

export function BackupMenu() {
  const to = useStudentPath();
  const [includeVideos, setIncludeVideos] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busyKind, setBusyKind] = useState<StudentExportKind | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [pending, setPending] = useState<StudentBackupFile | null>(null);
  const [stamp, setStamp] = useState(() => backupStampLabel(readStudentBackupStamp(localStorage)));
  const locked = busyKind !== null || restoreBusy;

  const exportFile = async (kind: StudentExportKind, videos = includeVideos) => {
    setBusyKind(kind);
    setError('');
    setStatus('');
    const result = await runStudentEditionExport(kind, { includeVideos: videos });
    if (result.ok) {
      if (kind === 'json') setStamp(backupStampLabel(readStudentBackupStamp(localStorage)));
      setStatus(result.message);
    } else setError(result.message);
    setBusyKind(null);
  };

  const apply = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    setRestoreBusy(true);
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
      setRestoreBusy(false);
    }
  };

  return (
    <GroupFrame title={BACKUP_GROUP_LABEL}>
      <p className="s-backup__stamp">Last backup: {stamp}</p>
      {/* TEMPORARY UPDATE BUTTON — delete this line with src/components/UpdateToLatestButton.tsx */}
      <UpdateToLatestButton />
      <section className="s-backup" aria-label="Back up and restore">
        <ExportChoices
          variant="arena"
          includeVideos={includeVideos}
          onIncludeVideos={setIncludeVideos}
          locked={locked}
          busyKind={busyKind}
          stamp={stamp}
          showStamp={false}
          onExport={(kind) => void exportFile(kind)}
        />
        <h2 className="s-kicker">Restore from backup</h2>
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
              setStatus('Choose merge or replace. Merge keeps records that are only on this device.');
            });
          }}
        />
        {pending ? (
          <div className="s-backup__actions" role="group" aria-label="Restore choices">
            <p>{BACKUP_REPLACE_WARN}</p>
            <button type="button" className="ink-btn" disabled={locked} onClick={() => void apply('merge')}>
              Merge with this phone
            </button>
            <button type="button" className="ink-btn" disabled={locked} onClick={() => void apply('replace')}>
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
      <MenuList label={BACKUP_GROUP_LABEL}>
        {BACKUP_LINKS.map((item) => (
          <MenuRow key={item.to} skin="ghost" label={item.label} note={item.note} to={item.to} />
        ))}
      </MenuList>
      <Link className="s-clear-link" to={to('/student/backup/clear')}>
        {CLEAR_STUDENT_LABEL}
      </Link>
    </GroupFrame>
  );
}

export function ClearStudentMenu() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [phrase, setPhrase] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const confirmed = phrase.trim() === CLEAR_CONFIRM_PHRASE;

  const reset = () => {
    setStep(0);
    setPhrase('');
  };

  const backUpFirst = async () => {
    setBackupBusy(true);
    setError('');
    const result = await runStudentEditionExport('json', { includeVideos: false });
    if (result.ok) setStatus(result.message);
    else {
      setError(result.message);
      setStatus('');
    }
    setBackupBusy(false);
  };

  return (
    <GroupFrame title={CLEAR_STUDENT_LABEL}>
      <section className="s-clear" aria-label={CLEAR_STUDENT_LABEL}>
        <p>{CLEAR_STUDENT_DEVICE_NOTE}</p>
        {step === 0 ? (
          <button type="button" className="ink-btn ink-btn--danger" onClick={() => setStep(1)}>
            {CLEAR_STUDENT_LABEL}
          </button>
        ) : null}
        {step === 1 ? (
          <div className="s-backup__actions" role="group" aria-label="Back up before clear">
            <p>{BACKUP_BEFORE_CLEAR} Back up first downloads one JSON file, then decide.</p>
            <button type="button" className="s-cta" disabled={backupBusy} onClick={() => void backUpFirst()}>
              {backupBusy ? studentExportBusyLabel('json') : BACK_UP_FIRST_LABEL}
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
          <div className="s-backup__actions" role="group" aria-label="Confirm clear all Student Edition data">
            <p>This erases Student Edition data on this device:</p>
            <ul className="s-clear-list">
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
    </GroupFrame>
  );
}
