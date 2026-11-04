import { importCoachText } from '../../lib/coachInbound';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CoachGymBrand, StudentProgressReport } from '../../lib/progress/types';
import {
  mergeOwnStudentFile,
  OWN_SEND_FILE_MESSAGE,
  sampleCoachPlanFile,
  SEND_TO_COACH_MERGE_PROMPT,
  SHARE_SUBJECT,
} from '../../lib/studentTools';
import { COACH_FILE_HINT, COACH_FILE_LABEL } from '../../lib/studentHubMenu';
import { setStudentProfile } from '../../lib/studentEdition';
import { buildCoachUpdateFile, markCoachFileSent, readShareWeightWithCoach, writeShareWeightWithCoach, type CoachUpdateSection } from '../../lib/coachProgressFile';
import { loadAssessments } from '../../lib/studentAssessment';
import { readStableStudentId } from '../../lib/studentIdentity';

export const COACH_UPDATE_FILE_COPY =
  'The file stays on this device until you send it. Advantage does not host it. It has what changed since your last file: profile, belt and stripes, A/B/C game, tournaments you entered (not ones you are considering), new self-assessments, and weight updates when you turn on sharing below. It never has promotion photos or any photo, your journal, or move permissions. Your coach adds it to your card; belt and stripes wait for your coach to approve. For a full copy of your journal, use Back up my journal or the spreadsheet in Connections.';

function sectionLabel(section: CoachUpdateSection): string {
  return { profile: 'profile', card: 'belt and stripes', competition: 'A/B/C game and tournaments', weight: 'weight updates', assessments: 'self-assessments' }[section];
}
import { writeStudentGymLogo } from '../../lib/studentGymMark';
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
  const [sendNote, setSendNote] = useState('');
  const [shareWeight, setShareWeight] = useState(() => readShareWeightWithCoach(localStorage));
  const [importNote, setImportNote] = useState('');
  const [error, setError] = useState('');
  const [pendingOwn, setPendingOwn] = useState<StudentProgressReport | null>(null);
  const [pendingGym, setPendingGym] = useState<CoachGymBrand | null>(null);
  const files = {
    mailto: `mailto:?subject=${encodeURIComponent(SHARE_SUBJECT)}&body=${encodeURIComponent(
      'My update file for you is on my phone. I will attach that JSON. Advantage does not host the file.',
    )}`,
  };

  const mergeOwn = () => {
    if (!pendingOwn) return;
    const result = mergeOwnStudentFile(report, pendingOwn);
    if (result.error) {
      setError(result.error);
      setImportNote('');
      return;
    }
    let next = result.report;
    if (pendingGym?.logo) writeStudentGymLogo(pendingGym.logo);
    if (pendingGym?.name && !next.profile.gymName.trim()) next = setStudentProfile(next, { gymName: pendingGym.name });
    commit(next);
    setPendingOwn(null);
    setPendingGym(null);
    setError('');
    setImportNote(result.message);
  };

  const send = async () => {
    setError('');
    setImportNote('');
    const built = buildCoachUpdateFile(report, {
      storage: localStorage,
      assessments: loadAssessments(localStorage).entries,
      studentId: readStableStudentId(localStorage) ?? report.studentId,
    });
    const jsonFile = new File([built.json], built.name, { type: 'application/json' });
    const sharedFiles = [jsonFile];
    const what = built.included.length ? `Includes: ${built.included.map(sectionLabel).join(', ')}.` : 'Nothing changed since your last file.';
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: sharedFiles })) {
      try {
        await nav.share({ files: sharedFiles, title: SHARE_SUBJECT, text: 'Update for my coach' });
        markCoachFileSent(localStorage, built);
        setSendNote(`Shared from this device. ${what} Advantage does not host the file.`);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    downloadText(built.name, built.json, 'application/json');
    markCoachFileSent(localStorage, built);
    setSendNote(`Downloaded the file on this device. ${what} Email it from your mail app, or put it in the gym Drive folder.`);
  };

  const downloadSample = () => {
    const sample = sampleCoachPlanFile(report.studentId);
    downloadText(sample.name, sample.json, 'application/json');
    setError('');
    setPendingOwn(null);
    setPendingGym(null);
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
            <p>{COACH_UPDATE_FILE_COPY}</p>
            <label className="student-share-check">
              <input
                type="checkbox"
                checked={shareWeight}
                onChange={(event) => {
                  writeShareWeightWithCoach(localStorage, event.target.checked);
                  setShareWeight(event.target.checked);
                }}
              />
              <span>Share my weight updates with my coach</span>
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
              This takes a coach plan or coach feedback file. That is the JSON file a coach sends back to you. It is not the progress file from Make a file for my coach. A rank update file also imports here and waits for Accept or Dismiss.
            </p>
            <p>
              A coach plan or coach feedback file is a suggestion. Importing it does not change your rubric marks, checkpoints, journal, or goals. A gym name or logo in the file is added when it is there, and ignored when an older file does not have one. You can replace or remove the logo on My profile. You can still merge a progress file into the journal on this phone after you confirm. A backup from Back up my journal restores from Connections.
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
                  const outcome = importCoachText(localStorage, report, text);
                  if (outcome.kind === 'own-file') {
                    setPendingOwn(outcome.pendingReport);
                    setPendingGym(outcome.gym);
                    setError('');
                    setImportNote('');
                    setSendNote('');
                    return;
                  }
                  setPendingOwn(null);
                  setPendingGym(null);
                  if (outcome.kind === 'error') {
                    setError(outcome.error);
                    setImportNote('');
                    return;
                  }
                  if (outcome.kind === 'applied') {
                    if (outcome.report !== report) commit(outcome.report);
                  }
                  setError('');
                  setSendNote('');
                  setImportNote(outcome.message);
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
                    Open: Connections
                  </Link>
                  <button
                    type="button"
                    className="ink-btn"
                    onClick={() => {
                      setPendingOwn(null);
                      setPendingGym(null);
                    }}
                  >
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
