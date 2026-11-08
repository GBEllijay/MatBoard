import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  HARNESS_ACADEMY,
  HARNESS_CLAIMS,
  HARNESS_INSTRUCTOR_ID,
  HARNESS_PATH,
  HARNESS_STORAGE_KEY,
  HARNESS_STUDENT_ID,
  INSTRUCTOR_FIXTURE,
  buildHarnessEnvelope,
  buildHarnessStudentReport,
  dedupeClaims,
  exportRealBackup,
  readForInstructor,
  restoreRealBackup,
  wrongStudentCoachPacket,
  type HarnessLog,
  type InstructorRead,
} from './model';
import './medalHarness.css';

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function MedalHarnessPage() {
  const [params] = useSearchParams();
  const role = params.get('role') === 'instructor' ? 'instructor' : params.get('role') === 'student' ? 'student' : '';
  const built = useMemo(() => buildHarnessStudentReport(), []);
  const [log, setLog] = useState<HarnessLog[]>(built.log);
  const [paste, setPaste] = useState('');
  const [reading, setReading] = useState<InstructorRead | null>(null);
  const realBackup = useMemo(() => exportRealBackup(built.report), [built.report]);
  const envelope = useMemo(() => JSON.stringify(buildHarnessEnvelope(built.report, [...HARNESS_CLAIMS, HARNESS_CLAIMS[0]]), null, 2), [built.report]);

  const add = (entry: HarnessLog) => setLog((rows) => [...rows, entry]);

  const remember = () => {
    sessionStorage.setItem(HARNESS_STORAGE_KEY, realBackup);
    add({ origin: 'harness', action: 'refresh copy', detail: `Stored only under ${HARNESS_STORAGE_KEY} in this browser tab. Another browser cannot see it.` });
  };

  const refreshBack = () => {
    const raw = sessionStorage.getItem(HARNESS_STORAGE_KEY);
    const restored = raw ? restoreRealBackup(raw) : { ok: false as const, error: 'Nothing in this tab yet.' };
    add({
      origin: 'real-function',
      action: 'restoreRealBackup',
      detail: restored.ok ? `Restored ${restored.report.studentId}.` : restored.error,
    });
  };

  const inspect = (text: string, label: string) => {
    const result = readForInstructor(text);
    setReading(result);
    add({ origin: result.origin, action: label, detail: `${result.title}. ${result.detail}` });
  };

  return (
    <main className="medal-harness">
      <div className="medal-harness__sheet">
        <p className="medal-harness__banner" role="note">
          Disposable test harness. Fake records only. Not a live sync, license, invite, or billing action. Student claims are not instructor-certified.
        </p>
        <h1>Medal harness</h1>
        <p className="medal-harness__quiet">Coach Bot Three is the student ({HARNESS_STUDENT_ID}). Instructor Bot One is the instructor ({HARNESS_INSTRUCTOR_ID}). Academy fixture: {HARNESS_ACADEMY}.</p>
        <nav className="medal-harness__roles" aria-label="Harness role">
          <Link to={`${HARNESS_PATH}?role=student`} aria-current={role === 'student' ? 'page' : undefined}>Student · Coach Bot Three</Link>
          <Link to={`${HARNESS_PATH}?role=instructor`} aria-current={role === 'instructor' ? 'page' : undefined}>Instructor · Instructor Bot One</Link>
        </nav>

        {role !== 'instructor' ? (
          <section className="medal-harness__card" aria-label="Student desk">
            <h2>Student desk</h2>
            <p className="medal-harness__quiet">Real functions built the match file. Gold, silver, bronze, the no-fight gold, open class, and the team place are harness claims beside that file. They are not inside the real backup.</p>
            <img src="/preview/medal-harness/fake-bracket.svg" alt="Fake bracket placeholder, not a photo" />
            <ul>
              {dedupeClaims(HARNESS_CLAIMS).map((claim) => (
                <li key={claim.id}>{claim.id} · {claim.classKind} · {claim.medal ?? 'no medal'} · {claim.matches.length} matches · {claim.academy}</li>
              ))}
            </ul>
            <div className="medal-harness__actions">
              <button type="button" onClick={() => download('coach-bot-three-real-backup.json', realBackup)}>Download real backup</button>
              <button type="button" onClick={() => { download('coach-bot-three-harness-envelope.json', envelope); add({ origin: 'harness', action: 'export envelope', detail: 'Downloaded. This is not a network send.' }); }}>Download harness envelope</button>
              <button type="button" onClick={() => add({ origin: 'harness', action: 'attempt send to Instructor Bot One', detail: 'No production path. Download the envelope and the other browser can paste it. Nothing was sent.' })}>Attempt send</button>
              <button type="button" onClick={remember}>Keep for refresh</button>
              <button type="button" onClick={refreshBack}>Restore after refresh</button>
            </div>
          </section>
        ) : null}

        {role !== 'student' ? (
          <section className="medal-harness__card" aria-label="Instructor desk">
            <h2>Instructor desk</h2>
            <p>{INSTRUCTOR_FIXTURE.name} · {INSTRUCTOR_FIXTURE.teachingYears} years teaching in this fixture.</p>
            <p>{INSTRUCTOR_FIXTURE.lineage}</p>
            <p className="medal-harness__quiet">{INSTRUCTOR_FIXTURE.note}</p>
            <textarea aria-label="Paste a backup" value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="Paste the student’s downloaded JSON here" />
            <div className="medal-harness__actions">
              <button type="button" onClick={() => inspect(paste, 'paste import')}>Read pasted file</button>
              <button type="button" onClick={() => inspect(realBackup, 'read real backup')}>Read this tab’s real backup</button>
              <button type="button" onClick={() => inspect(envelope, 'read harness envelope')}>Read this tab’s envelope</button>
              <button type="button" onClick={() => inspect('{"kind":"not-a-progress-file"}', 'invalid schema')}>Try invalid schema</button>
              <button type="button" onClick={() => inspect(wrongStudentCoachPacket(), 'wrong student')}>Try wrong student</button>
            </div>
            {reading ? (
              <p data-testid="instructor-read"><strong>{reading.title}.</strong> {reading.detail} Certified: no. Academy totals changed: no. Real kind: {reading.realKind}. Matches in the real file: {reading.matchCount}. Uncertified claims shown: {reading.uncertifiedClaims.length}.</p>
            ) : null}
          </section>
        ) : null}

        <section className="medal-harness__card" aria-label="Action log">
          <h2>Log</h2>
          <ul className="medal-harness__log">
            {log.map((entry, index) => (
              <li key={`${entry.action}-${index}`} data-origin={entry.origin}>{entry.origin}: {entry.action}. {entry.detail}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
