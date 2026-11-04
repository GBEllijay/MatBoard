import { useEffect, useState } from 'react';
import { qrDataUrl } from '../lib/qr';
import { loadStudentReport, saveStudentReport } from '../lib/studentEdition';
import { ensureStableStudentId, readStableStudentId, studentLinkCode } from '../lib/studentIdentity';
import { saveInboxPass } from '../lib/studentInboxClient';

/**
 * The id the coach pastes into Link to student.
 * Connect to my academy keeps the same id. Show my student ID mints one
 * when this phone is still on the shared placeholder.
 */
export function StudentIdentityPanel({ connected }: { connected: boolean }) {
  const [code, setCode] = useState<string | null>(() => readStableStudentId(localStorage));
  const [qr, setQr] = useState('');
  const [passText, setPassText] = useState('');
  const [passNote, setPassNote] = useState('');
  const [copyNote, setCopyNote] = useState('');

  const publish = (id: string) => {
    setCode(id);
    void qrDataUrl(studentLinkCode(id))
      .then(setQr)
      .catch(() => setQr(''));
  };

  useEffect(() => {
    if (!connected) return;
    try {
      const report = loadStudentReport(localStorage);
      const stable = ensureStableStudentId(report, localStorage);
      if (stable.changed) saveStudentReport(localStorage, stable.report);
      publish(stable.studentId);
    } catch {
      setCopyNote('This phone could not save a student ID.');
    }
  }, [connected]);

  const show = () => {
    try {
      const report = loadStudentReport(localStorage);
      const stable = ensureStableStudentId(report, localStorage);
      if (stable.changed) saveStudentReport(localStorage, stable.report);
      publish(stable.studentId);
      setCopyNote('');
    } catch {
      setCopyNote('This phone could not save a student ID.');
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(studentLinkCode(code));
      setCopyNote('Student ID copied.');
    } catch {
      setCopyNote('Could not copy. Select the student ID and copy it.');
    }
  };

  return (
    <section className="ink" aria-label="Your student ID">
      <h2>Your student ID</h2>
      <p className="student-quiet">
        Your coach uses Link to student on your roster card. Connect to my academy keeps this same id. Show the
        code or the QR after you connect.
      </p>
      {code ? (
        <>
          <label className="ink">
            <span className="ink__label">Student ID</span>
            <input aria-label="Your student ID" readOnly value={studentLinkCode(code)} />
          </label>
          <div className="student-clip__actions">
            <button type="button" className="ink-btn" onClick={() => void copy()}>
              Copy student ID
            </button>
          </div>
          {qr ? <img src={qr} alt="QR for your student ID" width={180} height={180} /> : null}
        </>
      ) : (
        <button type="button" className="ink-btn" onClick={show}>
          Show my student ID
        </button>
      )}
      <label className="ink">
        <span className="ink__label">Coach inbox code</span>
        <textarea
          aria-label="Coach inbox code"
          rows={2}
          value={passText}
          placeholder="Paste the code from Send to student"
          onChange={(event) => setPassText(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="ink-btn"
        onClick={() => {
          saveInboxPass(localStorage, passText);
          setPassNote(
            passText.trim().split('.').length === 3
              ? 'This phone will check that inbox when you open Student Edition.'
              : 'That is not an inbox code.',
          );
        }}
      >
        Save inbox code
      </button>
      {copyNote ? <p role="status">{copyNote}</p> : null}
      {passNote ? <p role="status">{passNote}</p> : null}
    </section>
  );
}
