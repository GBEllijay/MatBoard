/**
 * Fictional academy class calendar + instructor expected list.
 * Preview storage only. No student emails. No door check-in.
 */
import { useMemo, useState } from 'react';
import '../../pages/student/calendar.css';
import '../../components/instructorJournal.css';
import { BeltHeader } from '../../components/BeltHeader';
import { InstructorClassRoster } from '../../components/InstructorClassRoster';
import { GymClassDayList, GymWeekList } from '../../pages/student/GymClassPlan';
import { CLASS_RSVP_CACHE_KEY } from '../../lib/classAttendance';
import { SCHEDULE_STORAGE_KEY, writePublishedScheduleCache } from '../../lib/gymSchedulePublish';
import { occurrencesOnDate, type GymCalendarState } from '../../lib/gymCalendar';
import type { InstructorJournalEntry } from '../../lib/instructorJournal';
import { studentFromInput, type Student } from '../../lib/rosterStore';
import { blankStudentReport } from '../../lib/studentEdition';
import { assignStudentId } from '../../lib/studentIdentity';
import type { StudentProgressReport } from '../../lib/progress/types';

export const CLASS_CALENDAR_PREVIEW_PATH = '/preview/class-calendar';

const SAMPLE_DATE = '2026-11-23';

const SAMPLE_SCHEDULE: GymCalendarState = {
  version: 1,
  title: 'Riverside Academy',
  qrUrl: '',
  notes: 'Preview board. Fictional classes only.',
  template: 'week',
  castEnabled: false,
  classes: [
    { id: 'slot-am', kind: 'class', day: 'mon', time: '06:00', title: 'Morning Gi', location: 'MAT 1', subtitle: 'All levels', level: 'fundamentals' },
    { id: 'slot-pm', kind: 'class', day: 'mon', time: '18:00', title: 'Fundamentals', location: 'MAT 1', subtitle: '', level: 'fundamentals' },
    { id: 'slot-sat', kind: 'class', day: 'sat', time: '10:00', title: 'Open mat', location: 'MAT 2', subtitle: '', level: 'none' },
  ],
  specials: [{ id: 'sp-seminar', kind: 'special', date: '2026-11-21', title: 'Saturday seminar', body: 'Fictional seminar', flyerId: null }],
};

function sampleStudent(id: string, name: string, linkedId: string): Student {
  const card = studentFromInput({ id, name, belt: 'Blue', gym: 'Riverside Academy' });
  if (!card) throw new Error('preview roster');
  return { ...card, rosterList: 'student', linkedStudentId: linkedId };
}

const SAMPLE_ROSTER: Student[] = [
  sampleStudent('card-alex', 'Alex Rivera', 'stu-alex-preview'),
  sampleStudent('card-jordan', 'Jordan Lee', 'stu-jordan-preview'),
];

function seedPreviewStorage(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(SAMPLE_SCHEDULE));
  writePublishedScheduleCache(localStorage, SAMPLE_SCHEDULE, Date.now());
  localStorage.setItem(
    CLASS_RSVP_CACHE_KEY,
    JSON.stringify({
      v: 1,
      rsvps: [
        { slotId: 'slot-pm', date: SAMPLE_DATE, studentId: 'stu-alex-preview', displayName: 'Alex Rivera', status: 'planned', updatedAt: 1 },
        { slotId: 'slot-pm', date: SAMPLE_DATE, studentId: 'stu-jordan-preview', displayName: 'Jordan Lee', status: 'planned', updatedAt: 1 },
      ],
      requests: [
        {
          id: 'ar-preview-1',
          slotId: 'slot-pm',
          date: SAMPLE_DATE,
          studentId: 'stu-alex-preview',
          displayName: 'Alex Rivera',
          reason: 'traveling',
          status: 'requested',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }),
  );
}

const SAMPLE_ENTRY: InstructorJournalEntry = {
  id: 'ij-preview-1',
  date: SAMPLE_DATE,
  classLabel: '6:00 PM Fundamentals',
  slotId: 'slot-pm',
  whoInClass: 'Alex Rivera, Jordan Lee',
  whoInClassIds: ['stu-alex-preview', 'stu-jordan-preview'],
  reflection: 'Good pacing on the hip escape.',
  classNotes: 'Hip escape from side control, then recover guard.',
  shareClassNotes: true,
  techniques: [{ name: 'Hip escape', shareWithStudents: true }],
  createdAt: 1,
};

export function ClassCalendarPreviewPage() {
  const [report, setReport] = useState<StudentProgressReport>(() => {
    seedPreviewStorage();
    const blank = assignStudentId(blankStudentReport(1), 'stu-jordan-preview', 1);
    return { ...blank, profile: { ...blank.profile, displayName: 'Jordan Lee', gymName: 'Riverside Academy' } };
  });
  const slots = useMemo(() => occurrencesOnDate(SAMPLE_SCHEDULE, SAMPLE_DATE), []);
  const slot = slots.find((item) => item.slotId === 'slot-pm') ?? null;

  return (
    <main className="student student-frame student--calendar" data-testid="class-calendar-preview">
      <BeltHeader kind="white" title="Student Edition" />
      <h1>Class calendar preview</h1>
      <p className="student-quiet">
        Fictional Riverside Academy board. Students mark classes they plan to attend. Instructors confirm who was in
        class and can send a recap, including an absentee copy. This is not official membership attendance, and there is
        no door QR check-in.
      </p>

      <GymWeekList schedule={SAMPLE_SCHEDULE} />
      <h2 className="ink__label">Student day · Monday, Nov 23, 2026</h2>
      <GymClassDayList schedule={SAMPLE_SCHEDULE} date={SAMPLE_DATE} report={report} commit={setReport} />

      <section className="ink" aria-label="Instructor class list">
        <h2 className="ink__label">Instructor · same class</h2>
        <InstructorClassRoster
          date={SAMPLE_DATE}
          slot={slot}
          slots={slots}
          onPickSlot={() => {}}
          roster={SAMPLE_ROSTER}
          cards={[]}
          entry={SAMPLE_ENTRY}
          onPrefillWho={() => {}}
          sandbox
        />
      </section>
    </main>
  );
}
