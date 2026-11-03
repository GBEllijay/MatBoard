import { useState } from 'react';
import { AcademyQrScanner } from './AcademyQrScanner';
import { Sheet } from './Sheet';
import { buildCoachRankUpdate, rankUpdateSentence } from '../lib/coachRankUpdate';
import { coachGymLogoFits } from '../lib/coachGymFit';
import { readGymLogo } from '../lib/gymLogo';
import { readGymName } from '../lib/gymName';
import { linkRosterCard, type Student } from '../lib/rosterStore';
import { deliverRankUpdate } from '../lib/studentInboxClient';
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
          {error ? (
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
          {scanning ? <AcademyQrScanner onScan={link} /> : null}
        </>
      ) : null}
    </Sheet>
  );
}

export function SendRankUpdateSheet({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const [note, setNote] = useState('');
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
    if (!student?.linkedStudentId || busy) return;
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
      const delivery = await deliverRankUpdate(built.packet);
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
            <button type="button" className="btn" disabled={busy || !preview?.ok} onClick={() => void send()}>
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
