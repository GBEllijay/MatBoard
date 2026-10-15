import { useState } from 'react';
import {
  applyCoachFile,
  loadCoachShelf,
  progressReportFiles,
  saveCoachShelf,
  SHARE_SUBJECT,
} from '../../lib/studentTools';
import { LeatherHeader, StudentMarks, useStudentFile } from './chrome';

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
  const { report } = useStudentFile();
  const [shelf, setShelf] = useState(() => loadCoachShelf(localStorage));
  const [includeCsv, setIncludeCsv] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const files = progressReportFiles(report);

  const send = async () => {
    setError('');
    const jsonFile = new File([files.json], files.jsonName, { type: 'application/json' });
    const sharedFiles = [jsonFile];
    if (includeCsv) sharedFiles.push(new File([files.csv], files.csvName, { type: 'text/csv' }));
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: sharedFiles })) {
      try {
        await nav.share({ files: sharedFiles, title: SHARE_SUBJECT, text: 'Student progress report' });
        setStatus('Shared from this phone. Advantage does not host the file.');
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    downloadText(files.jsonName, files.json, 'application/json');
    if (includeCsv) downloadText(files.csvName, files.csv, 'text/csv');
    setStatus('Downloaded the progress file on this phone. Email it from your mail app, or put it in the gym Drive folder.');
  };

  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Send to coach" />
      <div className="student-paper">
        <div className="student-sheet">
          <section className="ink" aria-label="Send to coach">
            <p className="ink__label">Send to coach</p>
            <p className="student-quiet">
              The progress file stays on this phone. Advantage does not host it. It includes your journal, tournaments, A/B/C game, weights, competition results, video library links, and rank. A bracket photo stays on this phone and is not in the file. Share it with your mail app or the gym Google Drive folder.
            </p>
            <label className="cal-gym-toggle">
              <input type="checkbox" checked={includeCsv} onChange={(event) => setIncludeCsv(event.target.checked)} />
              <span>Also include the spreadsheet</span>
            </label>
            <div className="student-actions">
              <button type="button" className="ink-btn ink-btn--save" onClick={() => void send()}>
                Send to coach
              </button>
              <a className="ink-btn" href={files.mailto}>
                Email the file
              </a>
            </div>
          </section>
          <section className="ink ink--wobble" id="import">
            <p className="ink__label">Import from coach</p>
            <p className="student-quiet">
              A coach plan or coach feedback file is a suggestion. Importing it does not change your rubric marks, checkpoints, journal, or goals.
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
          </section>
          {status ? <p role="status">{status}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}
