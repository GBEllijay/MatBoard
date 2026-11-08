import { useState } from 'react';
import { Sheet } from './Sheet';
import { CoachStudentNotices } from './CoachStudentInbox';
import {
  buildCoachAssessmentUpdate,
  buildCoachBeltProgressUpdate,
  buildCoachGymLogoUpdate,
  buildCoachNoteUpdate,
  stubGymLogoSource,
  SYNC_GATE_COPY,
  syncActorFromToken,
  syncSendGate,
  type SyncPacket,
} from '../lib/coachSync';
import { sendCardSync, setCardComms } from '../lib/cardSync';
import { gymDriveFolder } from '../lib/driveHandoff';
import { readGymLogo } from '../lib/gymLogo';
import { useGymName } from '../hooks/useGymBrand';
import { COACH_BENCHMARK_STATUSES, type CoachBenchmarkStatus } from '../lib/progress/types';
import {
  chooseCardPhoto,
  decidePhoto,
  intakePhotoSubmission,
  readPhotoReviews,
  readPhotoSubmission,
  savePhotoReview,
  type PhotoApprover,
} from '../lib/rosterPhotoApproval';
import { setCardPhoto, setCardSyncSettings, type Student } from '../lib/rosterStore';
import { ASSESSMENT_AREAS } from '../lib/studentAssessment';
import { coachPhotoRequest, readStoredEntitlementToken } from '../lib/studentInboxClient';

function downloadText(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const STATUS_LABELS: Record<CoachBenchmarkStatus, string> = {
  'not-yet': 'Not yet',
  working: 'Working on it',
  ready: 'Ready',
};

/**
 * Coach sync for one linked card: the on/off switch, parent photo approval,
 * send belt progress / assessment / gym logo, and head-coach photo review.
 * Minimal controls only. Card visuals are not part of this sheet.
 */
export function CoachSyncSheet({
  student,
  roster,
  onClose,
}: {
  student: Student | null;
  roster: readonly Student[];
  onClose: () => void;
}) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [benchmarks, setBenchmarks] = useState<{ name: string; coachStatus: CoachBenchmarkStatus }[]>([
    { name: '', coachStatus: 'working' },
  ]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [strengths, setStrengths] = useState('');
  const [coachNote, setCoachNote] = useState('');
  const [journalDate, setJournalDate] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [note, setNote] = useState('');
  const [reviews, setReviews] = useState(() => readPhotoReviews(localStorage));

  const token = readStoredEntitlementToken();
  const actor = syncActorFromToken(token);
  const approver: PhotoApprover = actor;
  const gate = student ? syncSendGate(student, actor, roster) : 'unlinked';
  const studentId = student?.linkedStudentId ?? '';
  const gymName = useGymName().trim();
  const gym = gymName ? { name: gymName } : undefined;

  const send = async (built: { ok: true; packet: SyncPacket } | { ok: false; error: string }) => {
    if (busy) return;
    if (!built.ok) {
      setStatus(built.error);
      return;
    }
    setBusy(true);
    try {
      const folder = gate === 'send' ? await gymDriveFolder().catch(() => null) : null;
      const result = await sendCardSync(student?.id ?? '', built.packet, { folder, actor, roster });
      if (result.mode === 'blocked') setStatus(result.reason);
      else if (result.mode === 'cloud') setStatus('Sent to the student inbox. The student accepts or dismisses it.');
      else if (result.mode === 'folder') setStatus('Saved in the gym folder for the student.');
      else {
        downloadText(result.name, result.json);
        setStatus(result.reason);
      }
    } finally {
      setBusy(false);
    }
  };

  const loadPhotos = async () => {
    if (!student) return;
    const listed = await coachPhotoRequest('photo-list', { studentId });
    if (!listed.ok) {
      setStatus(listed.status === 403 ? 'Only the head coach can review student photos.' : 'Advantage Cloud is not connected.');
      return;
    }
    const photos = Array.isArray(listed.body.photos) ? listed.body.photos : [];
    for (const raw of photos) {
      const submission = readPhotoSubmission(raw);
      if (!submission) continue;
      const intake = intakePhotoSubmission(student, submission);
      if (intake.ok && !reviews.some((row) => row.submission.photoId === submission.photoId)) {
        savePhotoReview(localStorage, intake.review);
      }
    }
    setReviews(readPhotoReviews(localStorage));
  };

  const decide = async (photoId: string, decision: 'approve' | 'decline') => {
    const review = reviews.find((row) => row.submission.photoId === photoId);
    if (!review) return;
    if (decision === 'approve' && student?.noPhotos) {
      setStatus('No photos is on for this student.');
      return;
    }
    const result = decidePhoto(review, approver, decision);
    if (!result.ok) {
      setStatus(
        result.reason === 'not-head-coach'
          ? 'Only the head coach can approve photos.'
          : result.reason === 'awaiting-parent'
            ? 'A parent must approve this photo first.'
            : 'This photo was already decided.',
      );
      return;
    }
    await coachPhotoRequest('photo-decide', { studentId, photoId, decision });
    setReviews(savePhotoReview(localStorage, result.review));
  };

  const publish = async (photoId: string) => {
    const published = await coachPhotoRequest('photo-publish', { studentId, photoId });
    setStatus(published.ok ? 'Saved to the gym folder.' : 'Approve the photo first, as the head coach.');
  };

  const useOnCard = (photoId: string) => {
    if (!student) return;
    if (student.noPhotos) {
      setStatus('No photos is on for this student.');
      return;
    }
    const chosen = chooseCardPhoto(reviews, photoId, approver);
    if (!chosen.ok) {
      setStatus(chosen.reason === 'not-head-coach' ? 'Only the head coach picks the card photo.' : 'Approve this photo first.');
      return;
    }
    setCardPhoto(student.id, chosen.photoId, chosen.image);
    setStatus('This photo now shows on the card.');
  };

  const myReviews = student ? reviews.filter((row) => row.cardId === student.id) : [];

  return (
    <Sheet open={Boolean(student)} title="Coach sync" onClose={onClose} portal>
      {student ? (
        <>
          <p>
            Updates go one way, coach to student. The student accepts each one, and their own marks stay. Advantage
            Cloud first, then the gym folder, then a file.
          </p>
          <label>
            <input
              type="checkbox"
              checked={student.coachSync !== 'off'}
              onChange={(event) => setCardComms(student.id, event.target.checked, roster)}
            />
            Coach sync on for this student
          </label>
          <label>
            <input
              type="checkbox"
              checked={Boolean(student.parentPhotoApproval)}
              onChange={(event) => setCardSyncSettings(student.id, { parentPhotoApproval: event.target.checked })}
            />
            Parent approves profile photos first
          </label>
          {gate !== 'send' ? <p role="status">{SYNC_GATE_COPY[gate]}</p> : null}
          <CoachStudentNotices student={student} roster={roster} />

          <fieldset disabled={gate !== 'send' || busy}>
            <legend>Belt progress</legend>
            {benchmarks.map((row, index) => (
              <div key={index} className="roster-card__actions">
                <input
                  aria-label={`Benchmark ${index + 1}`}
                  value={row.name}
                  onChange={(event) =>
                    setBenchmarks((current) =>
                      current.map((item, at) => (at === index ? { ...item, name: event.target.value } : item)),
                    )
                  }
                />
                <select
                  aria-label={`Benchmark ${index + 1} status`}
                  value={row.coachStatus}
                  onChange={(event) =>
                    setBenchmarks((current) =>
                      current.map((item, at) =>
                        at === index ? { ...item, coachStatus: event.target.value as CoachBenchmarkStatus } : item,
                      ),
                    )
                  }
                >
                  {COACH_BENCHMARK_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button type="button" className="btn btn--ghost" onClick={() => setBenchmarks((rows) => [...rows, { name: '', coachStatus: 'working' }])}>
              Add benchmark
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void send(
                  buildCoachBeltProgressUpdate({
                    studentId,
                    belt: student.belt,
                    issuedOn: today(),
                    gym,
                    benchmarks: benchmarks
                      .filter((row) => row.name.trim())
                      .map((row) => ({
                        targetId: row.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) || 'benchmark',
                        name: row.name.trim(),
                        coachStatus: row.coachStatus,
                      })),
                  }),
                )
              }
            >
              Send belt progress
            </button>
          </fieldset>

          <fieldset disabled={gate !== 'send' || busy}>
            <legend>Assessment</legend>
            {ASSESSMENT_AREAS.map((area) => (
              <label key={area.id}>
                {area.label}
                <select
                  value={scores[area.id] ?? ''}
                  onChange={(event) =>
                    setScores((current) => {
                      const next = { ...current };
                      if (event.target.value) next[area.id] = Number(event.target.value);
                      else delete next[area.id];
                      return next;
                    })
                  }
                >
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Strengths
              <input value={strengths} onChange={(event) => setStrengths(event.target.value)} />
            </label>
            <label>
              Work on
              <input value={weaknesses} onChange={(event) => setWeaknesses(event.target.value)} />
            </label>
            <label>
              Note
              <input value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void send(
                  buildCoachAssessmentUpdate({ studentId, date: today(), scores, strengths, weaknesses, note, gym }),
                )
              }
            >
              Send to student's card
            </button>
            <p className="student-quiet">Assessments go only when you press Send. The student accepts each one.</p>
          </fieldset>

          <fieldset disabled={gate !== 'send' || busy}>
            <legend>Coach note</legend>
            <label>
              Note for the student’s journal
              <textarea value={coachNote} maxLength={1000} onChange={(event) => setCoachNote(event.target.value)} />
            </label>
            <label>
              Journal date (optional)
              <input type="date" value={journalDate} onChange={(event) => setJournalDate(event.target.value)} />
            </label>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void send(buildCoachNoteUpdate({ studentId, note: coachNote, issuedOn: today(), journalDate, gym }))
              }
            >
              Send note
            </button>
            <p className="student-quiet">
              Notes go only when you press Send. On accept it is added under the student’s journal entry for that day; their
              words are never replaced.
            </p>
          </fieldset>

          <fieldset disabled={gate !== 'send' || busy}>
            <legend>Gym logo</legend>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const master = stubGymLogoSource(readGymLogo, localStorage, gymName).getGymLogo();
                if (!master) {
                  setStatus('Save a gym logo in the Media Console first.');
                  return;
                }
                void send(buildCoachGymLogoUpdate({ studentId, master }));
              }}
            >
              Send gym logo
            </button>
          </fieldset>

          <fieldset disabled={Boolean(student.noPhotos)}>
            <legend>Profile photos</legend>
            {student.noPhotos ? <p role="status">No photos is on for this student. Photos are not taken or approved.</p> : null}
            <button type="button" className="btn btn--ghost" onClick={() => void loadPhotos()}>
              Check for photos
            </button>
            {myReviews.map((review) => (
              <div key={review.submission.photoId} className="roster-card__actions">
                <img src={review.submission.image} alt="" width={64} height={64} />
                <span>{review.stage.replace(/-/g, ' ')}</span>
                {review.stage === 'awaiting-head-coach' ? (
                  <>
                    <button type="button" className="btn" onClick={() => void decide(review.submission.photoId, 'approve')}>
                      Approve
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => void decide(review.submission.photoId, 'decline')}>
                      Decline
                    </button>
                  </>
                ) : null}
                {review.stage === 'approved' ? (
                  <>
                    <button type="button" className="btn" onClick={() => useOnCard(review.submission.photoId)}>
                      Use on card
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => void publish(review.submission.photoId)}>
                      Save to gym folder
                    </button>
                  </>
                ) : null}
              </div>
            ))}
          </fieldset>
          {status ? <p role="status">{status}</p> : null}
        </>
      ) : null}
    </Sheet>
  );
}
