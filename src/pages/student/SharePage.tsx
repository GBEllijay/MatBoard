import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentProgressReport } from '../../lib/progress/types';
import {
  applyCoachFile,
  loadCoachShelf,
  mergeOwnStudentFile,
  progressReportFiles,
  saveCoachShelf,
  SEND_TO_COACH_MERGE_PROMPT,
  SHARE_SUBJECT,
} from '../../lib/studentTools';
import { COACH_FILE_HINT, COACH_FILE_LABEL } from '../../lib/studentHubMenu';
import { LeatherHeader, StudentMarks, useStudentFile, useStudentPath } from './chrome';

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
  const [shelf, setShelf] = useState(() => loadCoachShelf(localStorage));
  const [includeCsv, setIncludeCsv] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pendingOwn, setPendingOwn] = useState<StudentProgressReport | null>(null);
  const files = progressReportFiles(report);

  const mergeOwn = () => {
    if (!pendingOwn) return;
    const result = mergeOwnStudentFile(report, pendingOwn);
    if (result.error) {
      setError(result.error);
      setStatus('');
      return;
    }
    commit(result.report);
    setPendingOwn(null);
    setError('');
    setStatus(result.message);
  };

  const send = async () => {
    setError('');
    const jsonFile = new File([files.json], files.jsonName, { type: 'application/json' });
    const sharedFiles = [jsonFile];
    if (includeCsv) sharedFiles.push(new File([files.csv], files.csvName, { type: 'text/csv' }));
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: sharedFiles })) {
      try {
        await nav.share({ files: sharedFiles, title: SHARE_SUBJECT, text: 'Student progress report' });
        setStatus('Shared from this device. Advantage does not host the file.');
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    downloadText(files.jsonName, files.json, 'application/json');
    if (includeCsv) downloadText(files.csvName, files.csv, 'text/csv');
    setStatus('Downloaded the progress file on this device. Email it from your mail app, or put it in the gym Drive folder.');
  };

  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title={COACH_FILE_LABEL} />
      <div className="student-paper">
        <div className="student-sheet">
          <section className="ink" aria-label={COACH_FILE_LABEL}>
            <p className="ink__label">{COACH_FILE_LABEL}</p>
            <p className="student-quiet">{COACH_FILE_HINT}</p>
            <p className="student-quiet">
              The progress file stays on this device. Advantage does not host it. It includes your journal, tournaments, A/B/C game, weights, competition results, video library links, rank, and lineage. Promotion photos are included when the file has room. The ones that do not fit stay on this device, and the file says so. A bracket photo stays on this device and is not in the file. Share it with your mail app or the gym Google Drive folder.
            </p>
            <label className="cal-gym-toggle">
              <input type="checkbox" checked={includeCsv} onChange={(event) => setIncludeCsv(event.target.checked)} />
              <span>Also include the spreadsheet</span>
            </label>
            <div className="student-actions">
              <button type="button" className="ink-btn ink-btn--save" onClick={() => void send()}>
                {COACH_FILE_LABEL}
              </button>
              <a className="ink-btn" href={files.mailto}>
                Email the file
              </a>
            </div>
          </section>
          <section className="student-import-confirm" id="import">
            <h2>Import from coach</h2>
            <p>
              A coach plan or coach feedback file is a suggestion. Importing it does not change your rubric marks, checkpoints, journal, or goals. The progress file from Send to coach can be merged into the journal on this phone after you confirm. A backup from Back up my journal restores from Connections.
            </p>
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
                    setStatus('');
                    return;
                  }
                  setPendingOwn(null);
                  if (result.error) {
                    setError(result.error);
                    setStatus('');
                    return;
                  }
                  saveCoachShelf(localStorage, result.shelf);
                  setShelf(result.shelf);
                  setError('');
                  setStatus(result.message);
                });
              }}
            />
            {pendingOwn ? (
              <div className="student-confirm" role="group" aria-label="Merge progress file">
                <p>{SEND_TO_COACH_MERGE_PROMPT}</p>
                <div className="student-actions">
                  <button type="button" className="ink-btn ink-btn--save" onClick={mergeOwn}>
                    Merge into my journal
                  </button>
                  <Link className="ink-btn" to={to('/student/connections')}>
                    Open: Connections
                  </Link>
                  <button type="button" className="ink-btn" onClick={() => setPendingOwn(null)}>
                    Cancel merge
                  </button>
                </div>
              </div>
            ) : null}
          </section>
          {status ? <p role="status">{status}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}
