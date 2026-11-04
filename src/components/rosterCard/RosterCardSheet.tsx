/**
 * Coach side of the Coach Clipboard card. Opened from Open card on a Student Roster card.
 * Coach fields live in rosterCardStore. Every send to the student goes through
 * #392's card sync API (src/lib/cardSync.ts): sendCoachNote, sendCoachAssessment,
 * sendBeltProgress, setCardComms, notices. This file adds no transport of its own.
 * Private coach notes live under their own key and only reach the coach's own backup.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '../Sheet';
import { CoachClipboardCard, type AssessmentView } from './CoachClipboardCard';
import { downloadJsonFile, todayIso } from './fileSave';
import { assessmentSummary, benchmarkItems, cardBelt, cardDate, coachRankSource, dateFacts, initialsOf, promotionDates } from '../../lib/rosterCard';
import { readPrivateCoachNotes, readRosterCard, subscribeRosterCards, updateRosterCard, writePrivateCoachNotes } from '../../lib/rosterCardStore';
import { addToCompetitorRoster, removeLinkedCompetitorCard, shownCardPhoto, turnOffCompetitorToggle } from '../../lib/rosterCardActions';
import { beltProgressFromCard, studentSnapshotFromFile } from '../../lib/rosterCardSync';
import {
  dismissCardNotice,
  getCardSyncState,
  sendBeltProgress,
  sendCoachAssessment,
  sendCoachNote,
  setCardComms,
  subscribeCardSync,
  type CardBuildRefused,
  type CardSyncSendResult,
} from '../../lib/cardSync';
import { cardLookCode, readCardLook, subscribeCardLook } from '../../lib/cardLook';
import { readPhotoReviews } from '../../lib/rosterPhotoApproval';
import { ASSESSMENT_AREAS, type AssessmentScore, type AssessmentScores } from '../../lib/studentAssessment';
import { readGymLogo, subscribeGymLogo } from '../../lib/gymLogo';
import { readGymName } from '../../lib/gymName';
import { getRoster, setNoPhotos, type Student } from '../../lib/rosterStore';
import type { TournamentRegistrationEvent } from '../../lib/studentEvents';

/**
 * Sync with student app. The card switch and the Add student offer both call this,
 * so they are one action. It uses #392's per-student comms toggle; turning it on
 * for a card that is not linked opens the existing LinkStudentSheet.
 */
export function startStudentAppSync(student: Pick<Student, 'id' | 'linkedStudentId'>, on: boolean, openPairing: () => void): void {
  setCardComms(student.id, on);
  if (on && !student.linkedStudentId) openPairing();
}

/** 'Registered: <event>, <date>'. Name, date, division and status only. */
export function registrationText(notice: Pick<TournamentRegistrationEvent, 'eventName' | 'date' | 'division'>): string {
  return `Registered: ${notice.eventName}, ${cardDate(notice.date)}${notice.division ? ` · ${notice.division}` : ''}`;
}

function useCardTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((value) => value + 1);
    const offs = [subscribeRosterCards(bump), subscribeGymLogo(bump), subscribeCardSync(bump), subscribeCardLook(bump)];
    return () => offs.forEach((off) => off());
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

/** One reading of a cardSync send result for the status line. */
export function sendResultText(result: CardSyncSendResult | CardBuildRefused, name: string, what: string): { text: string; error: boolean; file?: { name: string; json: string } } {
  if (result.mode === 'invalid') return { text: result.error, error: true };
  if (result.mode === 'blocked') return { text: result.reason, error: true };
  if (result.mode === 'cloud') return { text: `Sent to ${name}. ${what} after they accept.`, error: false };
  if (result.mode === 'folder') return { text: `Saved to the gym folder for ${name}. ${what} after they accept.`, error: false };
  return { text: `${result.reason} ${name} imports the file and accepts it. ${what} after that.`, error: false, file: { name: result.name, json: result.json } };
}

export function RosterCardSheet({
  student,
  onClose,
  onEditBelt,
  onLink,
  onOpenPhotos,
  competitorRosterOpen,
  onOpenCompetitorRoster,
}: {
  student: Student | null;
  onClose: () => void;
  onEditBelt: (student: Student) => void;
  onLink: (student: Student) => void;
  /** #392's Coach sync sheet, which holds photo review. */
  onOpenPhotos?: (student: Student) => void;
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
          onOpenPhotos={onOpenPhotos ? () => onOpenPhotos(student) : undefined}
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
  onOpenPhotos,
  competitorRosterOpen,
  onOpenCompetitorRoster,
}: {
  student: Student;
  onEditBelt: () => void;
  onLink: () => void;
  onOpenPhotos?: () => void;
  competitorRosterOpen: boolean;
  onOpenCompetitorRoster: () => void;
}) {
  const tick = useCardTick();
  const record = useMemo(() => readRosterCard(student.id), [student.id, tick]);
  const sync = useMemo(() => getCardSyncState(student.id), [student.id, tick, student]);
  const look = useMemo(() => readCardLook(), [tick]);
  const [privateNotes, setPrivateNotes] = useState(() => readPrivateCoachNotes(student.id));
  const [view, setView] = useState<AssessmentView>('coach');
  const [noteDay, setNoteDay] = useState(todayIso());
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [askRemoveCompetitor, setAskRemoveCompetitor] = useState(false);
  const snapshotRef = useRef<HTMLInputElement>(null);
  const gymLogo = useMemo(() => readGymLogo(), [tick]);
  const gymName = student.gym || readGymName();
  const studentId = student.linkedStudentId ?? '';
  const gym = { name: gymName, logo: gymLogo ?? undefined, cardLook: cardLookCode(look) };

  const source = coachRankSource(student, record.coachRank);
  const belt = cardBelt(source);
  const dates = dateFacts(promotionDates(source));
  const summary = assessmentSummary(record.coachAssessments, [], view);
  const checkpoints = record.snapshot?.checkpoints ?? [];
  const bench = benchmarkItems(checkpoints, record.benchmarkChecks);
  const latestAssessment = [...record.coachAssessments].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  const notices = sync?.notices ?? [];
  const competitorCard = record.competitorCardId ? getRoster().students.find((row) => row.id === record.competitorCardId) : undefined;
  const store = storage();
  const pendingPhoto = store
    ? readPhotoReviews(store).some((row) => row.cardId === student.id && (row.stage === 'awaiting-parent' || row.stage === 'awaiting-head-coach'))
    : false;
  const commsOn = Boolean(sync && sync.comms === 'on' && studentId);
  const familyFlag = student.noPhotos === 'family';

  const say = (text: string, error = false) => setStatus({ text, error });
  const report = (result: CardSyncSendResult | CardBuildRefused, what: string) => {
    const read = sendResultText(result, student.name, what);
    if (read.file) downloadJsonFile(read.file.name, read.file.json);
    say(read.text, read.error);
    if (result.mode === 'blocked' && !studentId) onLink();
  };

  const sendNote = async () => {
    report(await sendCoachNote(student.id, { note: record.trainingNotes, journalDate: noteDay }, { gym }), `It is added to their journal for ${cardDate(noteDay)}`);
  };

  const sendAssessment = async () => {
    if (!latestAssessment) return;
    const result = await sendCoachAssessment(
      student.id,
      { date: latestAssessment.date, scores: latestAssessment.scores, note: latestAssessment.note },
      { gym },
    );
    if (result.mode !== 'invalid' && result.mode !== 'blocked') setJustSaved(null);
    report(result, 'It becomes the Coach view on their card');
  };

  const sendBenchmarks = async () => {
    report(
      await sendBeltProgress(student.id, { belt: student.belt, benchmarks: beltProgressFromCard(record, checkpoints) }, { gym }),
      'Your marks show beside theirs',
    );
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

  const toggleNoPhotos = () => {
    const result = setNoPhotos(student.id, !student.noPhotos, 'coach');
    if (!result.ok) say(result.reason === 'set-by-family' ? 'Set by family. Only the family can clear No photos.' : 'Could not change No photos.', true);
    else say(student.noPhotos ? 'Photos allowed again.' : 'No photos is on. Photo uploads and approvals are blocked for this student.');
  };

  const coachNotes = (
    <>
      <div className="clipboard__note">
        <label htmlFor={`notes-${student.id}`}>Training notes &amp; suggestions</label>
        <small>Goes to {student.name} only when you tap Send. The student accepts it first. Nothing carries over on its own.</small>
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
        {sync?.lastSent['coach-note'] ? (
          <small>Last sent {cardDate(new Date(sync.lastSent['coach-note'].sentAt).toISOString().slice(0, 10))} · sent is not accepted; the student decides</small>
        ) : null}
      </div>
      <div className="clipboard__note clipboard__note--private">
        <label htmlFor={`private-${student.id}`}>Private coach notes</label>
        <small>Never sent, never on the student card or journal, never in CSV or any share. Kept in your own full backup.</small>
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
      {notices.map((notice) => (
        <div className="clipboard__notice" key={notice.eventId} role="note">
          <strong>{registrationText(notice)}</strong>
          {competitorRosterOpen ? (
            <button type="button" className="clipboard__btn" onClick={onOpenCompetitorRoster}>
              Open competitor card
            </button>
          ) : null}
          <button type="button" className="clipboard__btn" onClick={() => dismissCardNotice(notice.eventId)}>
            Dismiss
          </button>
        </div>
      ))}
      {studentId ? null : (
        <div className="clipboard__row">
          <button type="button" className="clipboard__btn" onClick={onLink}>
            Link to student
          </button>
        </div>
      )}
      {sync?.gateText && studentId ? <small className="clipboard__empty">{sync.gateText}</small> : null}
      {competitorRosterOpen ? (
        <div className="clipboard__row">
          <button type="button" role="switch" aria-checked={record.competitorOn} className={record.competitorOn ? 'sw on' : 'sw'} onClick={toggleCompetitor}>
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
        look={look}
        kicker={`Student Roster${student.division ? ` · ${student.division}` : ''}`}
        name={student.name}
        photo={{
          src: shownCardPhoto(student),
          initials: initialsOf(student.name),
          pending: pendingPhoto,
          onChoose: onOpenPhotos,
          noPhotos: {
            on: Boolean(student.noPhotos),
            setBy: student.noPhotos,
            locked: familyFlag,
            onToggle: familyFlag ? undefined : toggleNoPhotos,
          },
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
              {justSaved === latestAssessment.id ? <small>Saved. Send it to {student.name}&apos;s card when you are ready.</small> : null}
              <button type="button" className="clipboard__btn" onClick={() => void sendAssessment()}>
                Send to student&apos;s card
              </button>
              {sync?.lastSent.assessment ? (
                <small className="clipboard__empty">
                  Last sent {cardDate(new Date(sync.lastSent.assessment.sentAt).toISOString().slice(0, 10))} · waits for the student to accept
                </small>
              ) : null}
            </div>
          ) : null
        }
        benchmarks={{
          ...bench,
          beltLabel: belt.label,
          source: record.snapshot ? `From ${student.name}'s file · ${cardDate(new Date(record.snapshot.importedAt).toISOString().slice(0, 10))}` : '',
        }}
        onBenchmark={(id) => updateRosterCard(student.id, (row) => ({ ...row, benchmarkChecks: { ...row.benchmarkChecks, [id]: !row.benchmarkChecks[id] } }))}
        benchmarkSync={commsOn}
        onBenchmarkSync={(on) => startStudentAppSync(student, on, onLink)}
        benchmarkEmpty={
          <div>
            <p className="clipboard__empty">Import {student.name}&apos;s progress file to see their belt benchmarks.</p>
            <button type="button" className="clipboard__btn" onClick={() => snapshotRef.current?.click()}>
              Import student file
            </button>
            <input
              ref={snapshotRef}
              type="file"
              accept=".json,application/json"
              hidden
              aria-label="Import student file"
              onChange={(event) => {
                void importSnapshot(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
        }
        benchmarkSend={
          commsOn && bench.total ? (
            <button type="button" className="clipboard__btn" onClick={() => void sendBenchmarks()}>
              Send benchmarks
            </button>
          ) : null
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
          setJustSaved(entry.id);
          say(`Assessment saved on this device. Tap Send to student's card to offer it to ${student.name}.`);
        }}
      />
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
