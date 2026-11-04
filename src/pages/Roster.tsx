import { CoachSyncSheet } from '../components/CoachSyncSheet';
import { PendingCardShares } from '../components/CoachStudentInbox';
import { syncActorFromToken, syncSendGate } from '../lib/coachSync';
import { readStoredEntitlementToken } from '../lib/studentInboxClient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { EmptyHint } from '../components/EmptyHint';
import { ImportStudentProgress, StudentCompetitionPlan } from '../components/StudentCompetitionPlan';
import { SubmenuMarks } from '../components/TierHomeMark';
import { useSubmenuBack } from '../hooks/useSubmenuBack';
import { useCoachPageSwipe } from '../hooks/useCoachSwipe';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { BeltTip } from '../components/BeltTip';
import { LinkStudentSheet, SendRankUpdateSheet } from '../components/CoachStudentLink';
import { GuestArchive } from '../components/GuestArchive';
import { SendCompetitionSheet, type CompetitionSendDraft } from '../components/SendCompetitionSheet';
import { Sheet } from '../components/Sheet';
import { useRosterState } from '../hooks/useStores';
import { COMPETITOR_SYSTEM_NAME, isCoachStudentRoster } from '../lib/productNames';
import { competitorPhotoFromFile } from '../lib/competitorPhoto';
import { PHOTO_PICKER_ACCEPT, VIDEO_CAPTURE } from '../lib/mediaPicker';
import { quotaAddNote } from '../lib/storageQuota';
import { DeviceMediaInput } from '../components/DeviceMediaInput';
import { MediaSourceSheet } from '../components/VideoSourceSheet';
import {
  COMPETITOR_GYM_LABEL,
  COMPETITOR_ROSTER_LABEL,
  EMPTY_ROSTER_BODY,
  EMPTY_ROSTER_SEARCH,
  EMPTY_ROSTER_TITLE,
  EMPTY_STUDENT_ROSTER_BODY,
  EMPTY_STUDENT_ROSTER_SEARCH,
  EMPTY_STUDENT_ROSTER_TITLE,
  ROSTER_CSV_DEVICE_NOTE,
  ROSTER_CSV_INSTRUCTIONS,
  ROSTER_CSV_TEMPLATE_NOTE,
  ROSTER_LEAD_COACH,
  ROSTER_LEAD_PRO,
  STUDENT_NOTES_LABEL,
  STUDENT_ROSTER_CSV_DEVICE_NOTE,
  STUDENT_ROSTER_CSV_INSTRUCTIONS,
  STUDENT_ROSTER_LABEL,
  rosterCsvAvailable,
} from '../lib/coachCopy';
import {
  formatRosterCsvSummary,
  importRosterCsvFile,
  isSpreadsheetWorkbook,
  rosterCsvTemplate,
  serializeRosterCsv,
  withUtf8Bom,
} from '../lib/rosterCsv';
import { competitionSendOffer } from '../lib/coachCompetitionUpdate';
import { rankSendOffer } from '../lib/coachRankUpdate';
import { seatPermissionAllows } from '../lib/instructorSeats';
import { readGymName } from '../lib/gymName';
import {
  ADULT_BELTS,
  KIDS_BELTS,
  LAST_PROMOTION_DETAIL_MAX,
  NOTE_MAX,
  addStudent,
  addStudents,
  competitorCards,
  isKnownBelt,
  draftFromStudent,
  emptyDraft,
  linkCompetitorToRosterStudent,
  formatPromotion,
  removeStudent,
  searchStudents,
  setCheckedIn,
  studentRosterCards,
  updateStudent,
  type Student,
  type StudentDraft,
} from '../lib/rosterStore';

function downloadRosterCsv(filename: string, csv: string): void {
  const blob = new Blob([withUtf8Bom(csv)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function RosterPage() {
  const seat = useCurrentSeat();
  const showRosterSubmit = !seat || seatPermissionAllows(seat.permissions, 'rosterSubmit');
  const showRosterPull = !seat || seatPermissionAllows(seat.permissions, 'rosterPull');
  const roster = useRosterState();
  const navigate = useNavigate();
  const parent = useToolboxParent();
  const proUnlocked = useProUnlocked();
  const coachUnlocked = useCoachUnlocked();
  useCoachPageSwipe();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const fromCompetitors = searchParams.get('from') === 'competitors';
  const studentRoster = isCoachStudentRoster(pathname, searchParams.get('from'));
  const coachRoster =
    !studentRoster &&
    !fromCompetitors &&
    (searchParams.get('from') === 'coach' || (coachUnlocked && !proUnlocked));
  const showCsv = rosterCsvAvailable(proUnlocked, coachUnlocked);
  const exitPath = useSubmenuBack() ?? parent.path;
  const csvRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ id: string | null; draft: StudentDraft } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [csvNote, setCsvNote] = useState('');
  const [saveError, setSaveError] = useState('');
  const [linkTarget, setLinkTarget] = useState<Student | null>(null);
  const [sendTarget, setSendTarget] = useState<Student | null>(null);
  const [syncTarget, setSyncTarget] = useState<Student | null>(null);
  const syncActor = syncActorFromToken(readStoredEntitlementToken());
  const [samePerson, setSamePerson] = useState<Student | null>(null);
  const [competitionSend, setCompetitionSend] = useState<{ studentId: string; draft: CompetitionSendDraft } | null>(null);
  const [linkNote, setLinkNote] = useState('');
  const listed = useMemo(
    () => (studentRoster ? studentRosterCards(roster.students) : competitorCards(roster.students)),
    [roster.students, studentRoster],
  );
  const competitors = useMemo(
    () =>
      query.trim()
        ? searchStudents(listed, query, studentRoster ? undefined : roster.competitionPlans)
        : listed,
    [query, listed, studentRoster, roster.competitionPlans],
  );
  const openAdd = () => setEditor({ id: null, draft: { ...emptyDraft(), gym: readGymName() } });

  const onImportFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (isSpreadsheetWorkbook(file)) {
      setCsvNote('That looks like an Excel workbook. Save it as a CSV, then import.');
      return;
    }
    void importRosterCsvFile(file)
      .then((result) => {
        if (result.error) {
          setCsvNote(result.error);
          return;
        }
        try {
          addStudents(result.students, { rosterList: studentRoster ? 'student' : 'competitor' });
        } catch (error) {
          setCsvNote(quotaAddNote(error) ?? 'Could not save those names on this device.');
          return;
        }
        setCsvNote(formatRosterCsvSummary(result.imported, result.skipped, result.skippedDetail));
      })
      .catch(() => {
        setCsvNote('Could not read that file. Save it as a CSV and try again.');
      });
  };

  const csvTools = (
    <div className="roster__csv">
      <div className="roster__csv-bar">
        <div className="roster__csv-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() =>
              downloadRosterCsv(
                studentRoster ? 'advantage-student-roster-template.csv' : 'advantage-roster-template.csv',
                rosterCsvTemplate(),
              )
            }
          >
            Download template
          </button>
          {showRosterPull ? (
            <button type="button" className="btn btn--ghost" onClick={() => csvRef.current?.click()}>
              Import CSV
            </button>
          ) : null}
          {showRosterSubmit ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() =>
                downloadRosterCsv(
                  studentRoster ? 'advantage-student-roster.csv' : 'advantage-roster.csv',
                  serializeRosterCsv(listed, studentRoster ? STUDENT_NOTES_LABEL : undefined),
                )
              }
            >
              Export CSV
            </button>
          ) : null}
        </div>
        <CsvInstructions text={studentRoster ? STUDENT_ROSTER_CSV_INSTRUCTIONS : ROSTER_CSV_INSTRUCTIONS} />
      </div>
      <p className="roster__csv-template">{ROSTER_CSV_TEMPLATE_NOTE}</p>
      <p className="roster__csv-hint">{studentRoster ? STUDENT_ROSTER_CSV_DEVICE_NOTE : ROSTER_CSV_DEVICE_NOTE}</p>
      {csvNote ? (
        <p className="roster__csv-summary" role="status">
          {csvNote}
        </p>
      ) : null}
      <input
        ref={csvRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        hidden
        aria-label="Import roster CSV"
        onChange={(event) => {
          onImportFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );

  return (
    <main className={studentRoster || coachRoster ? 'roster roster--coach' : fromCompetitors ? 'roster cms' : 'roster'}>
      <SubmenuMarks
        to={exitPath}
        onExit={() => {
          navigate(exitPath);
        }}
      />
      <header className="roster__bar">
        <div className="roster__brand">
          <p className="roster__eyebrow">
            {studentRoster || coachRoster ? 'Advantage Coach' : fromCompetitors ? COMPETITOR_SYSTEM_NAME : parent.eyebrow}
          </p>
          <h1>{studentRoster ? STUDENT_ROSTER_LABEL : COMPETITOR_ROSTER_LABEL}</h1>
        </div>
        {studentRoster || coachRoster ? null : (
          <button type="button" className="btn" onClick={openAdd}>
            Add competitor
          </button>
        )}
      </header>

      <p className="roster__lead">
        {studentRoster
          ? 'Student Roster with names, belts, and notes. The list stays on this phone.'
          : coachRoster
            ? ROSTER_LEAD_COACH
            : ROSTER_LEAD_PRO}
      </p>

      {studentRoster || coachRoster ? (
        <div className="roster__add">
          <button type="button" className="btn" onClick={openAdd}>
            {studentRoster ? 'Add student' : 'Add Competitor'}
          </button>
        </div>
      ) : null}

      {showCsv ? csvTools : null}

      {listed.length ? (
      <label className="roster__search">
        Find
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={studentRoster ? 'Name, belt, or division' : 'Name, belt, division, opponent, or tournament'}
          aria-label={studentRoster ? 'Find student' : 'Find competitor'}
          autoComplete="off"
        />
      </label>
      ) : null}

      {competitors.length ? (
        <ul className="roster__list">
          {competitors.map((competitor) => (
            <StudentCard
              key={competitor.id}
              student={competitor}
              studentRoster={studentRoster}
              plan={studentRoster ? undefined : roster.competitionPlans[competitor.id]}
              pending={pendingRemove === competitor.id}
              onEdit={() => setEditor({ id: competitor.id, draft: draftFromStudent(competitor) })}
              onAskRemove={() => setPendingRemove(competitor.id)}
              onCancelRemove={() => setPendingRemove(null)}
              onConfirmRemove={() => {
                removeStudent(competitor.id);
                setPendingRemove(null);
              }}
              onToggleCheckIn={() => setCheckedIn(competitor.id, !competitor.checkedIn)}
              onLink={() => setLinkTarget(competitor)}
              onSamePerson={() => setSamePerson(competitor)}
              onCoachSync={() => setSyncTarget(competitor)}
              sendAllowed={syncSendGate(competitor, syncActor, roster.students) === 'send'}
              onSendCompetition={() =>
                setCompetitionSend({
                  studentId: competitor.linkedStudentId ?? '',
                  draft: {
                    tournamentName: '',
                    date: new Date().toISOString().slice(0, 10),
                    location: '',
                    division: competitor.division,
                    weightClass: '',
                    opponent: '',
                    result: 'win',
                    method: '',
                    note: '',
                  },
                })
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyHint
          title={
            listed.length
              ? 'No match'
              : studentRoster
                ? EMPTY_STUDENT_ROSTER_TITLE
                : EMPTY_ROSTER_TITLE
          }
          body={
            listed.length
              ? studentRoster
                ? EMPTY_STUDENT_ROSTER_SEARCH
                : EMPTY_ROSTER_SEARCH
              : studentRoster
                ? EMPTY_STUDENT_ROSTER_BODY
                : EMPTY_ROSTER_BODY
          }
          action={
            listed.length || coachRoster || studentRoster ? undefined : (
              <button type="button" className="btn" onClick={openAdd}>
                Add competitor
              </button>
            )
          }
        />
      )}

      <StudentEditor
        open={Boolean(editor)}
        title={
          studentRoster
            ? editor?.id
              ? 'Edit student'
              : 'Add student'
            : editor?.id
              ? 'Edit competitor'
              : 'Add competitor'
        }
        studentRoster={studentRoster}
        draft={editor?.draft ?? emptyDraft()}
        saveError={saveError}
        onChange={(draft) => setEditor((current) => (current ? { ...current, draft } : current))}
        onClose={() => {
          setSaveError('');
          setEditor(null);
        }}
        onSave={() => {
          if (!editor) return;
          try {
            const before = editor.id ? roster.students.find((row) => row.id === editor.id) ?? null : null;
            const saved = editor.id
              ? updateStudent(editor.id, editor.draft)
              : addStudent(editor.draft, studentRoster ? { rosterList: 'student' } : undefined);
            if (saved) {
              setSaveError('');
              setEditor(null);
              if (
                studentRoster &&
                before &&
                rankSendOffer(before, saved) === 'send' &&
                syncSendGate(saved, syncActor, roster.students) === 'send'
              ) {
                setSendTarget(saved);
              }
            }
          } catch (error) {
            setSaveError(
              quotaAddNote(error) ??
                (studentRoster
                  ? 'Could not save this student on this device.'
                  : 'Could not save this competitor on this device.'),
            );
          }
        }}
      />
      {studentRoster ? <PendingCardShares roster={roster.students} /> : <GuestArchive />}
      <LinkStudentSheet key={linkTarget?.id ?? 'link'} student={linkTarget} onClose={() => setLinkTarget(null)} />
      <SendRankUpdateSheet key={sendTarget?.id ?? 'send'} student={sendTarget} onClose={() => setSendTarget(null)} />
      <CoachSyncSheet
        key={syncTarget?.id ?? 'sync'}
        student={syncTarget ? roster.students.find((row) => row.id === syncTarget.id) ?? null : null}
        roster={roster.students}
        onClose={() => setSyncTarget(null)}
      />
      <Sheet open={Boolean(samePerson)} title="Same person as a roster student" onClose={() => setSamePerson(null)} portal>
        <p>This link is one time. Pick the Student Roster card for this competitor. Guests are not listed.</p>
        {linkNote ? <p role="status">{linkNote}</p> : null}
        <ul className="roster__list">
          {studentRosterCards(roster.students).map((student) => (
            <li key={student.id}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!samePerson) return;
                  const result = linkCompetitorToRosterStudent(samePerson.id, student.id);
                  setLinkNote(result.ok ? `${samePerson.name} is linked to ${student.name}.` : result.error);
                  if (result.ok) setSamePerson(null);
                }}
              >
                This competitor is the same person as roster student {student.name}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      {competitionSend ? (
        <SendCompetitionSheet
          open
          studentId={competitionSend.studentId}
          initial={competitionSend.draft}
          onClose={() => setCompetitionSend(null)}
        />
      ) : null}
    </main>
  );
}

function CsvInstructions({ text }: { text: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const open = pinned || hover;

  useEffect(() => {
    if (!pinned) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPinned(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  return (
    <div
      className="roster__instructions"
      ref={rootRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className="roster__instructions-btn"
        aria-expanded={open}
        aria-controls="roster-csv-instructions"
        onClick={() => setPinned((value) => !value)}
      >
        Instructions
      </button>
      {open ? (
        <p id="roster-csv-instructions" className="roster__instructions-pop" role="tooltip">
          {text}
        </p>
      ) : null}
    </div>
  );
}

function StudentCard({
  student,
  studentRoster,
  plan,
  pending,
  onEdit,
  onAskRemove,
  onCancelRemove,
  onConfirmRemove,
  onToggleCheckIn,
  onLink,
  onSamePerson,
  onSendCompetition,
  onCoachSync,
  sendAllowed,
}: {
  student: Student;
  studentRoster: boolean;
  plan?: ReturnType<typeof useRosterState>['competitionPlans'][string];
  pending: boolean;
  onEdit: () => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
  onToggleCheckIn: () => void;
  onLink: () => void;
  onSamePerson: () => void;
  onSendCompetition: () => void;
  onCoachSync: () => void;
  /** False when coach sync is off for this student or this seat cannot send. */
  sendAllowed: boolean;
}) {
  const promoted = formatPromotion(student.lastPromotion);
  const promotionDetail = student.lastPromotionDetail.trim();
  const promotionLine = promoted && promotionDetail
    ? `Last promotion ${promoted} · ${promotionDetail}`
    : promoted
      ? `Last promotion ${promoted}`
      : promotionDetail
        ? `Last promotion ${promotionDetail}`
        : '';

  return (
    <li>
      <article className="roster-card">
        <header className="roster-card__head">
          <div className="roster-card__identity">
            {studentRoster || !student.photo ? null : (
              <img className="roster-card__photo" src={student.photo} alt={`${student.name} photo`} />
            )}
            <div className="roster-card__who">
              <h2>{student.name}</h2>
              {studentRoster ? null : (
                <button
                  type="button"
                  className={`btn roster-card__checkin${student.checkedIn ? '' : ' btn--ghost'}`}
                  aria-pressed={student.checkedIn}
                  aria-label={`Check In ${student.name}`}
                  title="Here for today's tournament"
                  onClick={onToggleCheckIn}
                >
                  Check In
                </button>
              )}
            </div>
          </div>
          <BeltTip belt={student.belt} />
        </header>
        {student.division ? <p className="roster-card__meta">{student.division}</p> : null}
        {student.gym ? <p className="roster-card__meta">{student.gym}</p> : null}
        {promotionLine ? <p className="roster-card__meta roster-card__promotion">{promotionLine}</p> : null}
        {studentRoster && student.stripes ? <p className="roster-card__meta">Stripe {student.stripes}</p> : null}
        {studentRoster && student.linkedStudentId ? (
          <p className="roster-card__meta">Linked to {student.linkedStudentId}</p>
        ) : null}
        {student.note ? <p className="roster-card__note">{student.note}</p> : null}
        {plan ? <StudentCompetitionPlan plan={plan} /> : null}
        {studentRoster ? null : <ImportStudentProgress competitorId={student.id} competitorName={student.name} />}
        {pending ? (
          <div className="roster-card__actions">
            <span className="roster-card__confirm">Remove {student.name}?</span>
            <button type="button" className="btn" onClick={onConfirmRemove}>
              Yes, remove
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancelRemove}>
              Keep
            </button>
          </div>
        ) : (
          <div className="roster-card__actions">
            <button type="button" className="btn" onClick={onEdit}>
              Edit
            </button>
            {studentRoster ? (
              <button type="button" className="btn btn--ghost" onClick={onLink}>
                Link to student
              </button>
            ) : null}
            {!studentRoster && !student.guestId && !student.linkedStudentId ? (
              <button type="button" className="btn btn--ghost" onClick={onSamePerson}>
                Same person as a roster student
              </button>
            ) : null}
            {student.linkedStudentId && !student.guestId ? (
              <button type="button" className="btn btn--ghost" onClick={onCoachSync}>
                Coach sync
              </button>
            ) : null}
            {!studentRoster && competitionSendOffer(student) === 'send' && sendAllowed ? (
              <button type="button" className="btn" onClick={onSendCompetition}>
                Send to student
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost" onClick={onAskRemove}>
              Remove
            </button>
          </div>
        )}
      </article>
    </li>
  );
}

const COMPETITOR_PHOTO_CAPTURE_ID = 'competitor-photo-capture';
const COMPETITOR_PHOTO_LIBRARY_ID = 'competitor-photo-library';

function photoPickNote(error: unknown): string {
  const quota = quotaAddNote(error);
  if (quota) return quota;
  if (error instanceof Error && error.message === 'too-large') {
    return 'That photo is too large to keep on this device.';
  }
  return 'That file is not a photo this roster can keep.';
}

function StudentEditor({
  open,
  title,
  studentRoster,
  draft,
  saveError,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  studentRoster: boolean;
  draft: StudentDraft;
  saveError: string;
  onChange: (draft: StudentDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const ready = Boolean(draft.name.trim() && draft.belt.trim());
  const patch = (partial: Partial<StudentDraft>) => onChange({ ...draft, ...partial });
  const captureRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [chooserOpen, setChooserOpen] = useState(false);
  const [photoNote, setPhotoNote] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setChooserOpen(false);
    setPhotoNote('');
    setPhotoBusy(false);
  }, [open]);

  const onPhotoFiles = async (files: readonly File[]) => {
    const file = files[0];
    setChooserOpen(false);
    if (!file) return;
    setPhotoBusy(true);
    setPhotoNote('');
    try {
      const photo = await competitorPhotoFromFile(file);
      onChange({ ...draftRef.current, photo });
    } catch (error) {
      setPhotoNote(photoPickNote(error));
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <>
    <Sheet open={open} title={title} onClose={onClose}>
      <p className="roster-edit__copy">
        {studentRoster ? (
          <>
            Name and belt are enough to save a student. Division is optional and stays on this card.
            {' '}
            {COMPETITOR_GYM_LABEL} is one field for a gym name or a nickname. {STUDENT_NOTES_LABEL} stay
            on this card.
          </>
        ) : (
          <>
            Name and belt are enough to prefill a match. Division is optional and stays on this card.
            {' '}
            {COMPETITOR_GYM_LABEL} is optional and shows on the scoreboard and brackets. A new competitor
            starts with the Media Console gym name when one is saved. A face photo is optional, stays on
            this device, and is not included in CSV. Competitor Notes stay on this card.
          </>
        )}
      </p>
      {studentRoster ? null : <div className="roster-edit__photo">
        {draft.photo ? (
          <img className="roster-edit__photo-img" src={draft.photo} alt="Competitor face photo" />
        ) : (
          <span className="roster-edit__photo-empty">No photo</span>
        )}
        <div className="roster-edit__photo-actions">
          <button type="button" className="btn" disabled={photoBusy} onClick={() => setChooserOpen(true)}>
            {photoBusy ? 'Adding photo…' : draft.photo ? 'Change photo' : 'Add photo'}
          </button>
          {draft.photo ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setPhotoNote('');
                patch({ photo: '' });
              }}
            >
              Remove photo
            </button>
          ) : null}
          <p className="roster-edit__hint">Take a photo or pick one from this device.</p>
          {photoNote ? <p className="roster-edit__error">{photoNote}</p> : null}
        </div>
      </div>}
      <label>
        Name
        <input
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="Required"
          aria-label={studentRoster ? 'Student name' : 'Competitor name'}
          autoComplete="off"
        />
      </label>
      <fieldset className="roster-edit__belts">
        <legend>Belt rank</legend>
        <p className="roster-edit__hint">
          {studentRoster
            ? 'Required. Pick a belt, or type one under Other belt.'
            : 'Required to pick this competitor into Match or a bracket.'}
        </p>
        {draft.belt.trim() ? <BeltTip belt={draft.belt} /> : null}
        <div className="presets roster-edit__belt-row" role="radiogroup" aria-label="Adult belts">
          {ADULT_BELTS.map((belt) => (
            <button
              key={belt}
              type="button"
              role="radio"
              aria-checked={draft.belt === belt}
              className={`preset${draft.belt === belt ? ' preset--on' : ''}`}
              onClick={() => patch({ belt })}
            >
              {belt}
            </button>
          ))}
        </div>
        <div className="presets roster-edit__belt-row" role="radiogroup" aria-label="Kids belts">
          {KIDS_BELTS.map((belt) => (
            <button
              key={belt}
              type="button"
              role="radio"
              aria-checked={draft.belt === belt}
              className={`preset${draft.belt === belt ? ' preset--on' : ''}`}
              onClick={() => patch({ belt })}
            >
              {belt}
            </button>
          ))}
        </div>
        <label>
          Other belt
          <input
            value={isKnownBelt(draft.belt) ? '' : draft.belt}
            onChange={(event) => patch({ belt: event.target.value })}
            placeholder="Optional — type a custom rank"
            aria-label="Other belt"
          />
        </label>
      </fieldset>
      <label>
        Division
        <input
          value={draft.division}
          onChange={(event) => patch({ division: event.target.value })}
          placeholder="Adult Blue, Kids Gi — optional"
          aria-label="Division"
          autoComplete="off"
        />
      </label>
      <label>
        {COMPETITOR_GYM_LABEL}
        <input
          value={draft.gym}
          onChange={(event) => patch({ gym: event.target.value })}
          placeholder="School, academy, or nickname — optional"
          aria-label={COMPETITOR_GYM_LABEL}
          autoComplete="off"
        />
      </label>
      <div className="roster-edit__promotion">
        <label className="roster-edit__promotion-date">
          Last promotion
          <input
            type="date"
            value={draft.lastPromotion}
            onChange={(event) => patch({ lastPromotion: event.target.value })}
            aria-label="Last promotion"
          />
        </label>
        <label className="roster-edit__promotion-detail">
          Last promotion detail
          <input
            value={draft.lastPromotionDetail ?? ''}
            onChange={(event) => patch({ lastPromotionDetail: event.target.value })}
            placeholder="e.g. 3rd stripe, white belt"
            aria-label="Last promotion detail"
            maxLength={LAST_PROMOTION_DETAIL_MAX}
            autoComplete="off"
          />
        </label>
        {studentRoster ? (
          <label>
            Stripes
            <select
              aria-label="Stripes"
              value={String(draft.stripes ?? 0)}
              onChange={(event) => patch({ stripes: Number(event.target.value) })}
            >
              <option value={0}>No stripe</option>
              <option value={1}>Stripe 1</option>
              <option value={2}>Stripe 2</option>
              <option value={3}>Stripe 3</option>
              <option value={4}>Stripe 4</option>
            </select>
            <span className="roster-edit__hint">Saving stripes does not check off belt skills. The student owns that list.</span>
          </label>
        ) : null}
      </div>
      <label>
        {studentRoster ? STUDENT_NOTES_LABEL : 'Competitor Notes'}
        <textarea
          value={draft.note}
          onChange={(event) => patch({ note: event.target.value })}
          placeholder="Stays on this card"
          rows={6}
          maxLength={NOTE_MAX}
          aria-label={studentRoster ? STUDENT_NOTES_LABEL : 'Competitor Notes'}
        />
        <span className="roster-edit__count">
          {draft.note.trim().length}/{NOTE_MAX}
        </span>
      </label>
      {!ready ? <p className="roster-edit__error">Add a name and a belt to save.</p> : null}
      {saveError ? <p className="roster-edit__error">{saveError}</p> : null}
      <button type="button" className="btn" disabled={!ready || photoBusy} onClick={onSave}>
        {studentRoster ? 'Save student' : 'Save competitor'}
      </button>
    </Sheet>
    {studentRoster ? null : (
      <>
        <MediaSourceSheet
          open={chooserOpen && open}
          kind="photo"
          title="Competitor photo"
          captureInputId={COMPETITOR_PHOTO_CAPTURE_ID}
          libraryInputId={COMPETITOR_PHOTO_LIBRARY_ID}
          stacked
          onClose={() => setChooserOpen(false)}
        />
        <DeviceMediaInput
          id={COMPETITOR_PHOTO_CAPTURE_ID}
          inputRef={captureRef}
          accept={PHOTO_PICKER_ACCEPT}
          capture={VIDEO_CAPTURE}
          onFiles={onPhotoFiles}
        />
        <DeviceMediaInput
          id={COMPETITOR_PHOTO_LIBRARY_ID}
          inputRef={libraryRef}
          accept={PHOTO_PICKER_ACCEPT}
          onFiles={onPhotoFiles}
        />
      </>
    )}
    </>
  );
}
