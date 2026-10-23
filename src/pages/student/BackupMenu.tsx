import { useState } from 'react';
import { Link } from 'react-router-dom';
import { loadBracketPhotos } from '../../lib/bracketPhoto';
import { pdfBlob } from '../../lib/simplePdf';
import {
  BACKUP_BEFORE_CLEAR,
  BACKUP_REPLACE_WARN,
  CLEAR_CONFIRM_PHRASE,
  CLEAR_STUDENT_DATA_ITEMS,
  CLEAR_STUDENT_DEVICE_NOTE,
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
import { providerLabel } from '../../lib/academyPathway';
import { copyFilesToStudentDrive } from '../../lib/studentDriveCopy';
import { loadStudentReport, todayIso } from '../../lib/studentEdition';
import { clearFilmBlobs, getFilmBlob, loadFilms, putFilmBlob } from '../../lib/studentFilm';
import { loadAssessments } from '../../lib/studentAssessment';
import { loadScouting } from '../../lib/studentScouting';
import { loadRankPictures } from '../../lib/rankPhotos';
import { loadCoachShelf } from '../../lib/studentTools';
import { BACKUP_GROUP_LABEL, BACKUP_LINKS, CLEAR_STUDENT_LABEL } from '../../lib/studentHubMenu';
import { backupStampLabel, readStudentBackupStamp } from '../../lib/studentBackupStamp';
import { useStudentPath } from './chrome';
import { GroupFrame, MenuList, MenuRow } from './groupChrome';

async function runMenuBackup(includeVideos: boolean): Promise<{ ok: boolean; message: string }> {
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
    if (!targets.length) return { ok: true, message: 'Saved on this device. No academy folder or personal drive is connected.' };
    const notes = ['Saved on this device.'];
    for (const target of targets) {
      const copied = await copyFilesToStudentDrive(target, files);
      if (copied.error) notes.push(`${providerLabel(target.provider)} did not take the copy. ${copied.error}`);
      else notes.push(`Also saved in ${target.folderName} on ${providerLabel(target.provider)}.`);
    }
    return { ok: true, message: notes.join(' ') };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not build the backup.';
    return { ok: false, message: message.includes('too large') ? message : message || backupVideoTooLargeMessage(0) };
  }
}

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

export function BackupMenu() {
  const to = useStudentPath();
  const [includeVideos, setIncludeVideos] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<StudentBackupFile | null>(null);
  const [stamp, setStamp] = useState(() => backupStampLabel(readStudentBackupStamp(localStorage)));

  const backup = async () => {
    setBusy(true);
    setError('');
    setStatus('');
    const result = await runMenuBackup(includeVideos);
    if (result.ok) {
      setStamp(backupStampLabel(readStudentBackupStamp(localStorage)));
      setStatus(result.message);
    } else setError(result.message);
    setBusy(false);
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
    <GroupFrame title={BACKUP_GROUP_LABEL}>
      <p className="s-backup__stamp">Last backup: {stamp}</p>
      <section className="s-backup" aria-label="Back up and restore">
        <label className="s-backup__check">
          <input type="checkbox" checked={includeVideos} onChange={(event) => setIncludeVideos(event.target.checked)} />
          <span>Include video files kept on this device</span>
        </label>
        <div className="s-backup__actions">
          <button type="button" className="s-cta" disabled={busy} onClick={() => void backup()}>
            {busy ? 'Building backup…' : 'Back up my journal'}
          </button>
        </div>
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
    const result = await runMenuBackup(false);
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
            <p>{BACKUP_BEFORE_CLEAR} Back up first, then decide.</p>
            <button type="button" className="s-cta" disabled={backupBusy} onClick={() => void backUpFirst()}>
              {backupBusy ? 'Building backup…' : 'Back up first'}
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
