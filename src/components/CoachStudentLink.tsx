import { useState } from 'react';
import { AcademyQrScanner } from './AcademyQrScanner';
import { Sheet } from './Sheet';
import { buildCoachRankUpdate, rankUpdateSentence } from '../lib/coachRankUpdate';
import { coachGymLogoFits } from '../lib/coachGymFit';
import { readGymLogo } from '../lib/gymLogo';
import { readGymName } from '../lib/gymName';
import { canonicalBelt, linkRosterCard, type Student } from '../lib/rosterStore';
import { readRosterCard, updateRosterCard } from '../lib/rosterCardStore';
import { blueBeltNotes, cleanBirthYear, coachKidsToBlue } from '../lib/blueBeltCheer';
import { sendCardSync } from '../lib/cardSync';
import { parseStudentLink } from '../lib/studentIdentity';
import type { CoachGymBrand } from '../lib/progress/types';

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

function gymBrand(): CoachGymBrand | undefined {
  const name = readGymName().trim();
  const logo = readGymLogo();
  if (!name && !logo) return undefined;
  const gym: CoachGymBrand = { name: name || 'Gym' };
  if (logo && coachGymLogoFits(logo)) gym.logo = logo;
  return gym;
}

export function LinkStudentSheet({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  const link = (value: string) => {
    if (!student) return;
    const studentId = parseStudentLink(value);
    if (!studentId) {
      setError('That is not a student ID. Paste the code from the student’s phone.');
      return;
    }
    const saved = linkRosterCard(student.id, studentId);
    if (!saved) {
      setError('That student ID could not be saved on this card.');
      return;
    }
    setError('');
    onClose();
  };

  return (
    <Sheet open={Boolean(student)} title="Link to student" onClose={onClose} portal>
      {student ? (
        <>
          <p>
            Paste the student ID from their phone, or scan the code they show after Connect to my academy. This
            card then keeps that id. A competitor card with the same name stays a separate card.
          </p>
          {student.linkedStudentId ? <p>Linked to {student.linkedStudentId}.</p> : null}
          <label>
            Student ID
            <input
              aria-label="Student ID"
              value={text}
              autoComplete="off"
              placeholder="advantage-student:…"
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          {error && !scanning ? (
            <p className="roster-edit__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="roster-card__actions">
            <button type="button" className="btn" onClick={() => link(text)}>
              Link to student
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setScanning((value) => !value)}>
              {scanning ? 'Hide scanner' : 'Scan student code'}
            </button>
          </div>
          {scanning ? (
            <AcademyQrScanner
              onScan={link}
              photoId="student-link-qr-photo"
              result={error ? { kind: 'error', text: error } : null}
              onStart={() => setError('')}
            />
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

/** What the coach saw on the card for the kids-to-blue confirmation. */
function blueBeltFacts(student: Student) {
  const card = readRosterCard(student.id);
  const birthYear = card.birthYear ?? card.snapshot?.beltBook?.birthYear ?? null;
  const trainingSince = card.trainingStartedOn || card.snapshot?.startedOn || '';
  return { birthYear, trainingSince };
}

export function SendRankUpdateSheet({
  student,
  onClose,
  previousBelt = null,
  preview: previewOnly = false,
  facts,
}: {
  student: Student | null;
  onClose: () => void;
  /** The belt on the card before this save. Kids belt to Blue asks for a confirmation. */
  previousBelt?: string | null;
  /** Preview link only: shows the sheet with sample data and never sends. */
  preview?: boolean;
  /** Preview link only: sample birth year and training start. */
  facts?: { birthYear: number | null; trainingSince: string };
}) {
  const [note, setNote] = useState('');
  const kidsToBlue = Boolean(student && coachKidsToBlue(previousBelt, student.belt));
  const [known] = useState(() => (student ? facts ?? blueBeltFacts(student) : { birthYear: null, trainingSince: '' }));
  const [yearText, setYearText] = useState(known.birthYear != null ? String(known.birthYear) : '');
  const [blueConfirmed, setBlueConfirmed] = useState(false);
  const birthYear = cleanBirthYear(yearText);
  const blueNotes = kidsToBlue
    ? blueBeltNotes({ birthYear, trainingSince: known.trainingSince, name: student?.name })
    : [];
  const blueReady = !kidsToBlue || (blueConfirmed && birthYear != null);
  const [status, setStatus] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const preview =
    student?.linkedStudentId
      ? buildCoachRankUpdate({
          studentId: student.linkedStudentId,
          belt: student.belt,
          stripeCount: student.stripes ?? 0,
          promotionDate: student.lastPromotion,
          note: '',
        })
      : null;

  const send = async () => {
    if (!student?.linkedStudentId || busy || !blueReady) return;
    if (previewOnly) {
      setStatus('Preview only. Nothing was sent. On the student’s phone, Accept asks them to confirm Blue and their birth year, then the master cheers.');
      return;
    }
    if (kidsToBlue && birthYear != null) {
      updateRosterCard(student.id, (record) => ({ ...record, birthYear }));
    }
    setBusy(true);
    setStatus('');
    try {
      const built = buildCoachRankUpdate({
        studentId: student.linkedStudentId,
        belt: student.belt,
        stripeCount: student.stripes ?? 0,
        promotionDate: student.lastPromotion,
        note,
        gym: gymBrand(),
      });
      if (!built.ok) {
        setStatus(built.error);
        return;
      }
      const delivery = await sendCardSync(student.id, built.packet);
      if (delivery.mode === 'blocked' || delivery.mode === 'folder') {
        setPass('');
        setStatus(delivery.mode === 'blocked' ? delivery.reason : 'Saved in the gym folder for the student.');
        return;
      }
      if (delivery.mode === 'file') {
        downloadText(delivery.name, delivery.json);
        setPass('');
        setStatus(delivery.reason);
        return;
      }
      setPass(delivery.studentPass);
      setStatus('Sent to the student inbox. Give them this inbox code if their phone is not checking it yet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={Boolean(student)} title="Send to student" onClose={onClose} portal>
      {student ? (
        <>
          <p>
            Nothing is sent until you tap Send to student. When Advantage Cloud is connected, this goes to the
            student’s inbox. Otherwise Send saves a file the student imports. The student accepts or dismisses
            it. Their checklist is not changed.
          </p>
          {preview?.ok ? <p>{rankUpdateSentence(preview.packet)}</p> : null}
          {kidsToBlue ? (
            <fieldset className="blue-belt-confirm" aria-label="Confirm blue belt">
              <legend>Kids belt to blue belt</legend>
              <p>
                {student.name || 'This student'} moves from {canonicalBelt(previousBelt ?? '')} to <strong>Blue</strong>. Confirm the
                belt and birth year before you send. When they accept, the master congratulates them on their phone.
              </p>
              <p>New belt: Blue</p>
              <label>
                Birth year
                <input
                  aria-label="Birth year"
                  inputMode="numeric"
                  value={yearText}
                  placeholder="YYYY"
                  maxLength={4}
                  onChange={(event) => {
                    setYearText(event.target.value);
                    setBlueConfirmed(false);
                  }}
                />
              </label>
              <p>Training since: {known.trainingSince || 'Not on this card'}</p>
              {blueNotes.map((line) => (
                <p key={line} className="blue-belt-confirm__note">
                  {line}
                </p>
              ))}
              <label className="blue-belt-confirm__check">
                <input
                  type="checkbox"
                  checked={blueConfirmed}
                  disabled={birthYear == null}
                  onChange={(event) => setBlueConfirmed(event.target.checked)}
                />
                {birthYear == null
                  ? 'Add a birth year to confirm'
                  : `I confirm Blue belt and birth year ${birthYear}`}
              </label>
            </fieldset>
          ) : null}
          {previewOnly ? <p className="student-quiet">Preview: sample student. Nothing is sent.</p> : null}
          {preview && !preview.ok ? (
            <p className="roster-edit__error" role="alert">
              {preview.error}
            </p>
          ) : null}
          <label>
            Note for the student
            <textarea
              aria-label="Note for the student"
              rows={3}
              value={note}
              maxLength={500}
              placeholder="Optional. Stays out of the belt checklist."
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {status ? <p role="status">{status}</p> : null}
          {pass ? (
            <label>
              Student inbox code
              <textarea aria-label="Student inbox code" readOnly rows={3} value={pass} />
            </label>
          ) : null}
          <div className="roster-card__actions">
            <button type="button" className="btn" disabled={busy || !preview?.ok || !blueReady} onClick={() => void send()}>
              Send to student
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Not now
            </button>
          </div>
        </>
      ) : null}
    </Sheet>
  );
}
