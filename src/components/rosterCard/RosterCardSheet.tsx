/**
 * Coach side of the Coach Clipboard card. Opened from Open card on a Student Roster card.
 * Coach fields live in rosterCardStore. Private coach notes live under their own key
 * and only reach the coach's own device backup.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '../Sheet';
import { useCurrentSeat } from '../SeatSessionBar';
import { CoachClipboardCard, type AssessmentView } from './CoachClipboardCard';
import { downloadJsonFile, todayIso } from './fileSave';
import {
  assessmentSummary,
  benchmarkItems,
  cardBelt,
  cardDate,
  coachRankSource,
  dateFacts,
  initialsOf,
  promotionDates,
} from '../../lib/rosterCard';
import {
  readPrivateCoachNotes,
  readRosterCard,
  setStudentAppSync,
  subscribeRosterCards,
  updateRosterCard,
  writePrivateCoachNotes,
  type CardPhoto,
} from '../../lib/rosterCardStore';
import {
  addToCompetitorRoster,
  applyStudentNotice,
  decideCardPhoto,
  dismissStudentNotice,
  pickShownPhoto,
  removeLinkedCompetitorCard,
  shownCardPhoto,
  turnOffCompetitorToggle,
} from '../../lib/rosterCardActions';
import { buildCoachAssessmentUpdate, buildCoachNoteUpdate } from '../../lib/coachCardUpdates';
import { deliverCardUpdate, studentSnapshotFromFile } from '../../lib/rosterCardSync';
import {
  canApproveNewCards,
  pendingNotices,
  readCoachInbox,
  registrationNoticeText,
  STUDENT_TO_COACH_EVENT,
  writeCoachInbox,
  type CoachInboxItem,
} from '../../lib/studentToCoach';
import { ASSESSMENT_AREAS, type AssessmentScore, type AssessmentScores } from '../../lib/studentAssessment';
import { readGymLogo, subscribeGymLogo } from '../../lib/gymLogo';
import { readGymName } from '../../lib/gymName';
import { competitorPhotoFromFile } from '../../lib/competitorPhoto';
import { getRoster, type Student } from '../../lib/rosterStore';

/**
 * Sync with student app. The card switch and the Add student offer both call this.
 * Turning it on for a card that is not linked opens the pairing sheet.
 */
export function startStudentAppSync(
  student: Pick<Student, 'id' | 'linkedStudentId'>,
  on: boolean,
  openPairing: () => void,
): void {
  setStudentAppSync(student.id, on);
  if (on && !student.linkedStudentId) openPairing();
}

function useCardTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((value) => value + 1);
    const offCards = subscribeRosterCards(bump);
    const offLogo = subscribeGymLogo(bump);
    if (typeof window !== 'undefined') window.addEventListener(STUDENT_TO_COACH_EVENT, bump);
    return () => {
      offCards();
      offLogo();
      if (typeof window !== 'undefined') window.removeEventListener(STUDENT_TO_COACH_EVENT, bump);
    };
  }, []);
  return tick;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function RosterCardSheet({
  student,
  onClose,
  onEditBelt,
  onLink,
  competitorRosterOpen,
  onOpenCompetitorRoster,
}: {
  student: Student | null;
  onClose: () => void;
  onEditBelt: (student: Student) => void;
  onLink: (student: Student) => void;
  /** Same gate as /roster. Hidden where the Competitor Roster is locked. */
  competitorRosterOpen: boolean;
  onOpenCompetitorRoster: () => void;
}) {
  return (
    <Sheet open={Boolean(student)} title={student ? `${student.name} card` : 'Student card'} onClose={onClose} portal className="sheet--clipboard">
      {student ? (
        <RosterCardBody
          key={student.id}
          student={student}
          onEditBelt={() => onEditBelt(student)}
          onLink={() => onLink(student)}
          competitorRosterOpen={competitorRosterOpen}
          onOpenCompetitorRoster={onOpenCompetitorRoster}
        />
      ) : null}
    </Sheet>
  );
}

export function RosterCardBody({
  student,
  onEditBelt,
  onLink,
  competitorRosterOpen,
  onOpenCompetitorRoster,
}: {
  student: Student;
  onEditBelt: () => void;
  onLink: () => void;
  competitorRosterOpen: boolean;
  onOpenCompetitorRoster: () => void;
}) {
  const tick = useCardTick();
  const seat = useCurrentSeat();
  const headCoach = canApproveNewCards(seat);
  const record = useMemo(() => readRosterCard(student.id), [student.id, tick]);
  const [privateNotes, setPrivateNotes] = useState(() => readPrivateCoachNotes(student.id));
  const [view, setView] = useState<AssessmentView>('coach');
  const [noteDay, setNoteDay] = useState(todayIso());
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [photoPicker, setPhotoPicker] = useState(false);
  const [askRemoveCompetitor, setAskRemoveCompetitor] = useState(false);
  const snapshotRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const gymLogo = useMemo(() => readGymLogo(), [tick]);
  const gymName = student.gym || readGymName();
  const studentId = student.linkedStudentId ?? '';

  const source = coachRankSource(student, record.coachRank);
  const belt = cardBelt(source);
  const dates = dateFacts(promotionDates(source));
  const summary = assessmentSummary(record.coachAssessments, [], view);
  const checkpoints = record.snapshot?.checkpoints ?? [];
  const bench = benchmarkItems(checkpoints, record.benchmarkChecks);
  const latestAssessment = [...record.coachAssessments].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  const assessmentSent = latestAssessment ? record.sent.some((row) => row.type === 'assessment' && row.ref === latestAssessment.id) : false;
  const inbox = useMemo(() => readCoachInbox(storage()), [tick]);
  const notices = studentId ? pendingNotices(inbox, studentId).filter((item) => item.packet.type !== 'card-share') : [];
  const competitorCard = record.competitorCardId ? getRoster().students.find((row) => row.id === record.competitorCardId) : undefined;
  const pendingPhoto = record.photos.some((photo) => photo.coach === 'pending');

  const say = (text: string, error = false) => setStatus({ text, error });

  const sendNote = async () => {
    const built = buildCoachNoteUpdate({ studentId, day: noteDay, text: record.trainingNotes, gymName });
    if (!built.ok) {
      say(built.error, true);
      if (!studentId) onLink();
      return;
    }
    const delivery = await deliverCardUpdate(built.packet);
    if (delivery.mode === 'file') downloadJsonFile(delivery.name, delivery.json);
    updateRosterCard(student.id, (row) => ({
      ...row,
      sent: [...row.sent, { updateId: built.packet.updateId, type: 'note', ref: noteDay, issuedAt: built.packet.issuedAt, via: delivery.mode }],
    }));
    say(
      delivery.mode === 'cloud'
        ? `Sent to ${student.name}. It waits for them to accept.`
        : `${delivery.reason} ${student.name} imports the file and accepts it. It is added to their journal for ${cardDate(noteDay)}.`,
    );
  };

  const sendAssessment = async () => {
    if (!latestAssessment) return;
    const built = buildCoachAssessmentUpdate({ studentId, assessment: latestAssessment, gymName });
    if (!built.ok) {
      say(built.error, true);
      if (!studentId) onLink();
      return;
    }
    const delivery = await deliverCardUpdate(built.packet);
    if (delivery.mode === 'file') downloadJsonFile(delivery.name, delivery.json);
    updateRosterCard(student.id, (row) => ({
      ...row,
      sent: [...row.sent, { updateId: built.packet.updateId, type: 'assessment', ref: latestAssessment.id, issuedAt: built.packet.issuedAt, via: delivery.mode }],
    }));
    say(delivery.mode === 'cloud' ? `Sent to ${student.name}'s card.` : `${delivery.reason} It shows on ${student.name}'s card after they accept.`);
  };

  const importSnapshot = async (file: File | undefined) => {
    if (!file) return;
    const result = studentSnapshotFromFile(await file.text(), studentId);
    if (!result.ok) {
      say(result.error, true);
      return;
    }
    updateRosterCard(student.id, (row) => ({ ...row, snapshot: result.snapshot }));
    say('Student file imported. Your fields are unchanged.');
  };

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const src = await competitorPhotoFromFile(file);
      const photo: CardPhoto = {
        id: newId('photo'),
        src,
        from: 'coach',
        addedAt: Date.now(),
        parent: 'not-needed',
        coach: headCoach ? 'approved' : 'pending',
      };
      updateRosterCard(student.id, (row) => ({
        ...row,
        photos: [...row.photos, photo].slice(-12),
        shownPhotoId: row.shownPhotoId || (headCoach ? photo.id : ''),
      }));
      say(headCoach ? 'Photo added.' : 'Photo added. It shows after the head coach approves it.');
    } catch {
      say('That file is not a photo.', true);
    }
  };

  const toggleCompetitor = () => {
    if (record.competitorOn) {
      turnOffCompetitorToggle(student.id);
      say(record.competitorCardId ? 'Off. The competitor card and its history are kept.' : 'Off.');
      return;
    }
    const result = addToCompetitorRoster(student.id);
    if (!result.ok) {
      say(result.error, true);
      return;
    }
    say(result.created ? `${student.name} was added to the Competitor Roster as a new card.` : `${student.name} is back on the Competitor Roster.`);
  };

  const actOn = (item: CoachInboxItem) => {
    const next = applyStudentNotice(readCoachInbox(storage()), item, student.id);
    const store = storage();
    if (store) writeCoachInbox(store, next);
    if (item.packet.type === 'registration') onOpenCompetitorRoster();
  };

  const dismiss = (item: CoachInboxItem) => {
    const store = storage();
    if (store) writeCoachInbox(store, dismissStudentNotice(readCoachInbox(store), item.packet.updateId));
  };

  const coachNotes = (
    <>
      <div className="clipboard__note">
        <label htmlFor={`notes-${student.id}`}>Training notes &amp; suggestions</label>
        <small>Goes to {student.name} only when you tap Send. The student accepts it first.</small>
        <textarea
          id={`notes-${student.id}`}
          value={record.trainingNotes}
          onChange={(event) => {
            const text = event.target.value;
            updateRosterCard(student.id, (row) => ({ ...row, trainingNotes: text }));
          }}
        />
        <div className="clipboard__row">
          <label className="clipboard__field">
            Journal day
            <input type="date" aria-label="Journal day" value={noteDay} onChange={(event) => setNoteDay(event.target.value || todayIso())} />
          </label>
          <button type="button" className="clipboard__btn clipboard__btn--primary" onClick={() => void sendNote()}>
            Send to student&apos;s journal
          </button>
        </div>
        {record.sent.filter((row) => row.type === 'note').length ? (
          <small>
            Last sent for {cardDate(record.sent.filter((row) => row.type === 'note').slice(-1)[0].ref)} · waits for the student to accept
          </small>
        ) : null}
      </div>
      <div className="clipboard__note clipboard__note--private">
        <label htmlFor={`private-${student.id}`}>Private coach notes</label>
        <small>Never sent, never on the student card or journal, never in CSV. Kept in your own device backup.</small>
        <textarea
          id={`private-${student.id}`}
          value={privateNotes}
          onChange={(event) => {
            setPrivateNotes(event.target.value);
            writePrivateCoachNotes(student.id, event.target.value);
          }}
        />
      </div>
    </>
  );

  const extras = (
    <>
      {status ? (
        <p className={status.error ? 'clipboard__status clipboard__status--error' : 'clipboard__status'} role="status">
          {status.text}
        </p>
      ) : null}
      {notices.map((item) => (
        <div className="clipboard__notice" key={item.packet.updateId}>
          <strong>
            {item.packet.type === 'registration'
              ? registrationNoticeText(item.packet.registration)
              : item.packet.type === 'competitor-info'
                ? `Competitor info from ${student.name}: ${[item.packet.competitor.division, item.packet.competitor.weightClass].filter(Boolean).join(' · ') || 'no division'}`
                : ''}
          </strong>
          <button type="button" className="clipboard__btn" onClick={() => actOn(item)}>
            {item.packet.type === 'registration' ? 'Open competitor card' : 'Fill blanks only'}
          </button>
          <button type="button" className="clipboard__btn" onClick={() => dismiss(item)}>
            Dismiss
          </button>
        </div>
      ))}
      <div className="clipboard__row">
        <button type="button" className="clipboard__btn" onClick={() => photoRef.current?.click()}>
          Add card photo
        </button>
        {studentId ? null : (
          <button type="button" className="clipboard__btn" onClick={onLink}>
            Link to student
          </button>
        )}
        <input ref={photoRef} type="file" accept="image/*" hidden aria-label="Add card photo" onChange={(event) => { void addPhoto(event.target.files?.[0]); event.target.value = ''; }} />
      </div>
      {competitorRosterOpen ? (
        <div className="clipboard__row">
          <button
            type="button"
            role="switch"
            aria-checked={record.competitorOn}
            className={record.competitorOn ? 'sw on' : 'sw'}
            onClick={toggleCompetitor}
          >
            <span className="sw__t" aria-hidden="true" />
            <span>
              <b>Add to Competitor Roster</b>
              <small>Makes a separate competitor card from this card. Turning it off keeps that card.</small>
            </span>
          </button>
          {competitorCard ? (
            <button type="button" className="clipboard__link" onClick={onOpenCompetitorRoster}>
              Open competitor card ›
            </button>
          ) : null}
          {!record.competitorOn && competitorCard ? (
            askRemoveCompetitor ? (
              <>
                <span>Remove {competitorCard.name}&apos;s competitor card?</span>
                <button
                  type="button"
                  className="clipboard__btn"
                  onClick={() => {
                    removeLinkedCompetitorCard(student.id, true);
                    setAskRemoveCompetitor(false);
                    say('Competitor card removed. This student card is unchanged.');
                  }}
                >
                  Yes, remove
                </button>
                <button type="button" className="clipboard__btn" onClick={() => setAskRemoveCompetitor(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="clipboard__link" onClick={() => setAskRemoveCompetitor(true)}>
                Remove competitor card…
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <CoachClipboardCard
        mode="coach"
        kicker={`Student Roster${student.division ? ` · ${student.division}` : ''}`}
        name={student.name}
        photo={{
          src: shownCardPhoto(record),
          initials: initialsOf(student.name),
          pending: pendingPhoto,
          onChoose: headCoach && record.photos.length ? () => setPhotoPicker(true) : undefined,
        }}
        gymName={gymName}
        gymLogo={gymLogo}
        belt={belt}
        onEditBelt={onEditBelt}
        beltLine={belt.meta}
        dates={dates}
        startedOn={record.trainingStartedOn}
        onStartedOn={(value) => updateRosterCard(student.id, (row) => ({ ...row, trainingStartedOn: value }))}
        trainingStyle={record.trainingStyle}
        onTrainingStyle={(value) => updateRosterCard(student.id, (row) => ({ ...row, trainingStyle: value }))}
        assessment={summary}
        assessmentView={view}
        onAssessmentView={setView}
        coachAssessments={record.coachAssessments}
        onNewAssessment={() => setAssessing(true)}
        assessmentSend={
          latestAssessment ? (
            <div className="clipboard__row" style={{ marginTop: 8 }}>
              {assessmentSent ? (
                <small className="clipboard__empty">Sent {cardDate(latestAssessment.date)} assessment · waits for the student to accept</small>
              ) : (
                <button type="button" className="clipboard__btn" onClick={() => void sendAssessment()}>
                  Send to student&apos;s card
                </button>
              )}
            </div>
          ) : null
        }
        benchmarks={{
          ...bench,
          beltLabel: belt.label,
          source: record.snapshot ? `From ${student.name}'s file · ${cardDate(new Date(record.snapshot.importedAt).toISOString().slice(0, 10))}` : '',
        }}
        onBenchmark={(id) =>
          updateRosterCard(student.id, (row) => ({ ...row, benchmarkChecks: { ...row.benchmarkChecks, [id]: !row.benchmarkChecks[id] } }))
        }
        benchmarkSync={record.benchmarkSync}
        onBenchmarkSync={(on) => startStudentAppSync(student, on, onLink)}
        benchmarkEmpty={
          <div>
            <p className="clipboard__empty">Import {student.name}&apos;s progress file to see their belt benchmarks.</p>
            <button type="button" className="clipboard__btn" onClick={() => snapshotRef.current?.click()}>
              Import student file
            </button>
            <input ref={snapshotRef} type="file" accept=".json,application/json" hidden aria-label="Import student file" onChange={(event) => { void importSnapshot(event.target.files?.[0]); event.target.value = ''; }} />
          </div>
        }
        notes={coachNotes}
        notesLabel="Notes"
        extras={extras}
        footer={record.updatedAt ? `Updated by Coach · ${cardDate(new Date(record.updatedAt).toISOString().slice(0, 10))}` : 'Not updated yet'}
      />
      <NewAssessmentSheet
        open={assessing}
        onClose={() => setAssessing(false)}
        onSave={(entry) => {
          updateRosterCard(student.id, (row) => ({ ...row, coachAssessments: [...row.coachAssessments, entry].slice(-60) }));
          setAssessing(false);
          say('Assessment saved on this device. Send it to the student when you are ready.');
        }}
      />
      <Sheet open={photoPicker} title="Card photo" onClose={() => setPhotoPicker(false)} stacked portal>
        <p>Every card image needs the head coach. Student photos also wait for a parent when that is on.</p>
        <ul className="roster__list">
          {record.photos.map((photo) => (
            <li key={photo.id} className="clipboard__photo-row">
              <img src={photo.src} alt="Card photo option" width={72} height={72} style={{ objectFit: 'cover', borderRadius: 12 }} />
              <span>
                {photo.from === 'student' ? 'From student' : 'From coach'} ·{' '}
                {photo.parent === 'pending' ? 'Waiting on parent' : photo.coach === 'approved' ? 'Approved' : photo.coach === 'rejected' ? 'Rejected' : 'Pending approval'}
                {record.shownPhotoId === photo.id ? ' · Shown' : ''}
              </span>
              {photo.coach === 'pending' && photo.parent !== 'pending' ? (
                <>
                  <button type="button" className="btn" onClick={() => decideCardPhoto(student.id, photo.id, 'approved', seat)}>
                    Approve
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => decideCardPhoto(student.id, photo.id, 'rejected', seat)}>
                    Reject
                  </button>
                </>
              ) : null}
              {photo.coach === 'approved' && record.shownPhotoId !== photo.id ? (
                <button type="button" className="btn" onClick={() => pickShownPhoto(student.id, photo.id, seat)}>
                  Show this photo
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

function NewAssessmentSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (entry: { id: string; date: string; note: string; scores: AssessmentScores }) => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [scores, setScores] = useState<AssessmentScores>(
    () => Object.fromEntries(ASSESSMENT_AREAS.map((area) => [area.id, 3])) as AssessmentScores,
  );
  return (
    <Sheet open={open} title="New assessment" onClose={onClose} stacked portal>
      <form
        className="clipboard clipboard--form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ id: newId('coach-assess'), date, note: note.trim(), scores });
          setNote('');
        }}
      >
        <label className="clipboard__field">
          Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value || todayIso())} />
        </label>
        <div className="clipboard__scores">
          {ASSESSMENT_AREAS.map((area) => (
            <label key={area.id} className="clipboard__field">
              {area.label}
              <select
                value={scores[area.id]}
                onChange={(event) => setScores({ ...scores, [area.id]: Number(event.target.value) as AssessmentScore })}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="clipboard__field">
          Note
          <textarea value={note} maxLength={400} onChange={(event) => setNote(event.target.value)} />
        </label>
        <button type="submit" className="btn">
          Save assessment
        </button>
      </form>
    </Sheet>
  );
}
