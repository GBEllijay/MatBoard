import { useState } from 'react';
import { Link } from 'react-router-dom';
import { loadBracketPhotos } from '../../lib/bracketPhoto';
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
import { providerLabel } from '../../lib/academyPathway';
import { copyFilesToStudentDrive } from '../../lib/studentDriveCopy';
import { loadStudentReport, todayIso } from '../../lib/studentEdition';
import { clearFilmBlobs, getFilmBlob, loadFilms, putFilmBlob } from '../../lib/studentFilm';
import { loadAssessments } from '../../lib/studentAssessment';
import { loadScouting } from '../../lib/studentScouting';
import { loadRankPictures } from '../../lib/rankPhotos';
import { loadCoachShelf } from '../../lib/studentTools';
import { BACKUP_GROUP_LABEL, BACKUP_LINKS, CLEAR_STUDENT_LABEL } from '../../lib/studentHubMenu';
import {
  backupStampLabel,
  forgetStudentBackupStamp,
  readStudentBackupStamp,
} from '../../lib/studentBackupStamp';
import { useStudentPath } from './chrome';
import { GroupFrame, MenuList, MenuRow } from './groupChrome';

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
      setStamp(backupStampLabel(readStudentBackupStamp(localStorage)));
      const files = [
        { name: names.json, bytes: new Blob([built.json], { type: 'application/json' }), mime: 'application/json' },
        { name: names.csv, bytes: new Blob([built.csv], { type: 'text/csv' }), mime: 'text/csv' },
        { name: names.progressPdf, bytes: pdfBlob(built.progressPdf), mime: 'application/pdf' },
        { name: names.assessmentPdf, bytes: pdfBlob(built.assessmentPdf), mime: 'application/pdf' },
      ];
      const targets = connectedBackupTargets(localStorage);
      if (!targets.length) {
        setStatus('Saved on this device. No academy folder or personal drive is connected.');
        return;
      }
      const notes: string[] = ['Saved on this device.'];
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
    <GroupFrame title={BACKUP_GROUP_LABEL}>
      <p className="s-backup__stamp">Last backup: {stamp}</p>
      <section className="s-backup" aria-label="Back up and restore">
        <label className="s-backup__check">
          <input type="checkbox" checked={includeVideos} onChange={(event) => setIncludeVideos(event.target.checked)} />
          <span>Include video files kept on this device</span>
        </label>
        <div className="s-backup__actions">
          <button type="button" className="ink-btn ink-btn--save" disabled={busy} onClick={() => void backup()}>
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
          <MenuRow key={item.to} label={item.label} note={item.note} to={item.to} />
        ))}
      </MenuList>
      <Link className="s-clear-link" to={to('/student/backup/clear')}>
        {CLEAR_STUDENT_LABEL}
      </Link>
    </GroupFrame>
  );
}

export function ClearStudentMenu() {
  const to = useStudentPath();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [status, setStatus] = useState('');

  return (
    <GroupFrame title={CLEAR_STUDENT_LABEL}>
      <section className="s-clear" aria-label={CLEAR_STUDENT_LABEL}>
        <p>
          This removes the journal, rank, belt progress, competitor data, weight chart, self-assessment, tournaments,
          scouting, and videos on this device. Academy and personal drive connections stay.
        </p>
        {step === 0 ? (
          <button type="button" className="ink-btn" onClick={() => setStep(1)}>
            {CLEAR_STUDENT_LABEL}
          </button>
        ) : null}
        {step === 1 ? (
          <div role="group" aria-label="Backup recommended">
            <p>{BACKUP_BEFORE_CLEAR}</p>
            <div className="s-backup__actions">
              <Link className="ink-btn ink-btn--save" to={to('/student/backup')}>
                Back up my journal
              </Link>
              <button type="button" className="ink-btn" onClick={() => setStep(2)}>
                Continue to clear
              </button>
              <button type="button" className="ink-btn" onClick={() => setStep(0)}>
                Cancel clear
              </button>
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div role="group" aria-label="Confirm clear">
            <p>Student Edition data on this device will be erased. Coach tools and unlock codes stay.</p>
            <div className="s-backup__actions">
              <button
                type="button"
                className="ink-btn"
                onClick={() => {
                  clearStudentMemory(localStorage);
                  void clearFilmBlobs().catch(() => undefined);
                  forgetStudentBackupStamp(localStorage);
                  setStep(0);
                  setStatus('Student Edition data on this device was cleared.');
                }}
              >
                Confirm clear
              </button>
              <button type="button" className="ink-btn" onClick={() => setStep(0)}>
                Cancel clear
              </button>
            </div>
          </div>
        ) : null}
        {status ? <p role="status">{status}</p> : null}
      </section>
    </GroupFrame>
  );
}
