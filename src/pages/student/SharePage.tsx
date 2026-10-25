import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentProgressReport } from '../../lib/progress/types';
import {
  applyCoachFile,
  loadCoachShelf,
  mergeOwnStudentFile,
  OWN_SEND_FILE_MESSAGE,
  progressReportFiles,
  sampleCoachPlanFile,
  saveCoachShelf,
  SEND_TO_COACH_MERGE_PROMPT,
  SHARE_SUBJECT,
} from '../../lib/studentTools';
import { COACH_FILE_HINT, COACH_FILE_LABEL } from '../../lib/studentHubMenu';
import { LeatherHeader, StudentMarks, useScrollToHash, useStudentFile, useStudentPath } from './chrome';

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function SharePage() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  useScrollToHash();
  const [shelf, setShelf] = useState(() => loadCoachShelf(localStorage));
  const [includeCsv, setIncludeCsv] = useState(false);
  const [sendNote, setSendNote] = useState('');
  const [importNote, setImportNote] = useState('');
  const [error, setError] = useState('');
  const [pendingOwn, setPendingOwn] = useState<StudentProgressReport | null>(null);
  const files = progressReportFiles(report);

  const mergeOwn = () => {
    if (!pendingOwn) return;
    const result = mergeOwnStudentFile(report, pendingOwn);
    if (result.error) {
      setError(result.error);
      setImportNote('');
      return;
    }
    commit(result.report);
    setPendingOwn(null);
    setError('');
    setImportNote(result.message);
  };

  const send = async () => {
    setError('');
    setImportNote('');
    const jsonFile = new File([files.json], files.jsonName, { type: 'application/json' });
    const sharedFiles = [jsonFile];
    if (includeCsv) sharedFiles.push(new File([files.csv], files.csvName, { type: 'text/csv' }));
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: sharedFiles })) {
      try {
        await nav.share({ files: sharedFiles, title: SHARE_SUBJECT, text: 'Student progress report' });
        setSendNote('Shared from this device. Advantage does not host the file.');
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    downloadText(files.jsonName, files.json, 'application/json');
    if (includeCsv) downloadText(files.csvName, files.csv, 'text/csv');
    setSendNote('Downloaded the progress file on this device. Email it from your mail app, or put it in the gym Drive folder.');
  };

  const downloadSample = () => {
    const sample = sampleCoachPlanFile(report.studentId);
    downloadText(sample.name, sample.json, 'application/json');
    setError('');
    setPendingOwn(null);
    setSendNote('');
    setImportNote('Downloaded a sample coach plan. That is the kind of file Import from coach reads. Your journal was not changed.');
  };

  return (
    <main className="student student-frame student-share">
      <StudentMarks />
      <LeatherHeader title={COACH_FILE_LABEL} />
      <div className="student-paper">
        <div className="student-sheet">
          <section className="student-share-card" aria-label={COACH_FILE_LABEL}>
            <h2>{COACH_FILE_LABEL}</h2>
            <p>{COACH_FILE_HINT}</p>
            <p>
              The progress file stays on this device. Advantage does not host it. It includes your journal, tournaments, A/B/C game, weights, competition results, video library links, rank, and lineage. Promotion photos are included when the file has room. The ones that do not fit stay on this device, and the file says so. A bracket photo stays on this device and is not in the file. Share it with your mail app or the gym Google Drive folder.
            </p>
            <label className="student-share-check">
              <input type="checkbox" checked={includeCsv} onChange={(event) => setIncludeCsv(event.target.checked)} />
              <span>Also include the spreadsheet</span>
            </label>
            <button type="button" className="ink-btn ink-btn--save" onClick={() => void send()}>
              {COACH_FILE_LABEL}
            </button>
            {sendNote ? <p role="status">{sendNote}</p> : null}
            <div className="student-share-other" role="group" aria-label="Different action">
              <p className="student-share-other__label">Different action</p>
              <p>This opens your mail app with a note about the file. It does not make the file, and it does not attach it.</p>
              <a className="ink-btn" href={files.mailto}>
                Email the file
              </a>
            </div>
          </section>
          <section className="student-import-confirm" id="import">
            <h2>Import from coach</h2>
            <p>
              This takes a coach plan or coach feedback file. That is the JSON file a coach sends back to you. It is not the progress file from Make a file for my coach.
            </p>
            <p>
              A coach plan or coach feedback file is a suggestion. Importing it does not change your rubric marks, checkpoints, journal, or goals. A backup from Back up my journal restores from Connections.
            </p>
            <button type="button" className="ink-btn ink-btn--save" onClick={downloadSample}>
              Download a sample coach file
            </button>
            <p>Choose the coach&apos;s file.</p>
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Import from coach"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void file.text().then((text) => {
                  const result = applyCoachFile(report, shelf, text);
                  if (result.pendingReport) {
                    setPendingOwn(result.pendingReport);
                    setError('');
                    setImportNote('');
                    setSendNote('');
                    return;
                  }
                  setPendingOwn(null);
                  if (result.error) {
                    setError(result.error);
                    setImportNote('');
                    return;
                  }
                  saveCoachShelf(localStorage, result.shelf);
                  setShelf(result.shelf);
                  setError('');
                  setSendNote('');
                  setImportNote(result.message);
                });
              }}
            />
            {pendingOwn ? (
              <div className="student-confirm" role="group" aria-label="Merge progress file">
                <p role="status">{OWN_SEND_FILE_MESSAGE}</p>
                <p>{SEND_TO_COACH_MERGE_PROMPT}</p>
                <div className="student-actions">
                  <button type="button" className="ink-btn ink-btn--save" onClick={mergeOwn}>
                    Merge into my journal
                  </button>
                  <Link className="ink-btn" to={to('/student/connections')}>
                    Open Connections
                  </Link>
                  <button type="button" className="ink-btn" onClick={() => setPendingOwn(null)}>
                    Cancel merge
                  </button>
                </div>
              </div>
            ) : null}
            {pendingOwn ? null : importNote ? <p role="status">{importNote}</p> : null}
            {error ? <p role="alert">{error}</p> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
