import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COACH_STORE_CAPS,
  ROSTER_BACKUP_KIND,
  ROSTER_BACKUP_SCHEMA_VERSION,
  buildRosterBackup,
  emptyCoachStores,
  formatRosterMergeReport,
  mergeRosterBackup,
  parseRosterBackup,
  serializeRosterBackup,
  sharedRosterBackup,
  type BackupStudent,
  type RosterBackupSources,
} from './rosterBackup.ts';

const now = new Date('2026-11-04T08:00:00.000Z');

function student(row: Partial<BackupStudent> & Pick<BackupStudent, 'id' | 'name' | 'belt'>): BackupStudent {
  return { division: '', gym: '', photo: '', lastPromotion: '', note: '', checkedIn: false, ...row };
}

function sources(students: BackupStudent[], extra: Partial<RosterBackupSources> = {}): RosterBackupSources {
  return {
    roster: { version: 1, students, ready: {}, gamePlans: {}, competitionPlans: {} },
    cardFile: { cards: {} },
    privateNotes: {},
    inbox: [],
    ...extra,
  };
}

function coachSources(): RosterBackupSources {
  const stores = emptyCoachStores();
  stores.studentInbox.notices.push({ eventId: 'e1', studentId: 's1', status: 'registered' });
  stores.studentInbox.shares.push({ shareId: 'sh1', photo: 'data:image/png;base64,AAAA', parentEmail: 'parent@example.com' });
  stores.photoReviews.push({ submission: { photoId: 'ph1' }, cardId: 'a', stage: 'parent' });
  stores.cardSyncSent.push({ linkedStudentId: 's1', kind: 'rank', updateId: 'u1', sentAt: 1, mode: 'auto' });
  return sources(
    [
      student({ id: 'a', name: 'Ana Lima', belt: 'Blue', stripes: 2, photo: 'data:image/jpeg;base64,FACE', linkedStudentId: 's1', cardPhotoId: 'ph1', note: 'Tues' }),
      student({ id: 'b', name: 'Bo Kim', belt: 'White', rosterList: 'student', coachSync: 'off' }),
    ],
    {
      cardFile: { cards: { a: { trainingStyle: 'gi', trainingStartedOn: '2020-01-01', photos: ['x'], shownPhotoId: 'x' } } },
      privateNotes: { a: 'Private: knee injury', b: 'Private: shy' },
      inbox: [{ packet: { updateId: 'i1', studentId: 's1' }, status: 'new' }],
      coachStores: stores,
    },
  );
}

describe('full roster backup format', () => {
  it('is a versioned advantage-roster-backup and the coach copy keeps private notes', () => {
    const backup = buildRosterBackup(coachSources(), { scope: 'coach-private', now });
    assert.equal(backup.kind, ROSTER_BACKUP_KIND);
    assert.equal(backup.schemaVersion, ROSTER_BACKUP_SCHEMA_VERSION);
    assert.equal(backup.app, 'Advantage');
    assert.deepEqual(backup.privateNotes, { a: 'Private: knee injury', b: 'Private: shy' });

    const parsed = parseRosterBackup(serializeRosterBackup(backup));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.backup.privateNotes, backup.privateNotes);
    assert.equal(parsed.backup.roster.students.length, 2);
    assert.equal(parsed.backup.cards.a.trainingStyle, 'gi');
    assert.equal(parsed.backup.coachStores?.cardSyncSent.length, 1);
  });

  it('round-trips onto an empty device with everything, private notes included', () => {
    const backup = parseRosterBackup(serializeRosterBackup(buildRosterBackup(coachSources(), { scope: 'coach-private', now })));
    assert.ok(backup.ok);
    const { next, report } = mergeRosterBackup(sources([]), backup.backup, { now: now.getTime() });
    assert.equal(report.studentsAdded, 2);
    assert.equal(report.privateNotesAdded, 2);
    assert.equal(next.roster.students.length, 2);
    assert.equal(next.privateNotes.a, 'Private: knee injury');
    assert.equal(next.cardFile.cards.a.trainingStartedOn, '2020-01-01');
    assert.equal(next.inbox.length, 1);
    assert.ok(report.coachItemsAdded >= 4);
  });

  it('is idempotent: importing the same file twice changes nothing the second time', () => {
    const backup = buildRosterBackup(coachSources(), { scope: 'coach-private', now });
    const first = mergeRosterBackup(sources([]), backup, { now: now.getTime() });
    const second = mergeRosterBackup(first.next, backup, { now: now.getTime() });
    assert.equal(second.report.studentsAdded, 0);
    assert.equal(second.report.studentsFilled, 0);
    assert.equal(second.report.privateNotesAdded, 0);
    assert.equal(second.report.coachItemsAdded, 0);
    assert.deepEqual(second.changed, { roster: false, cards: false, privateNotes: false, inbox: false, coachStores: false });
    assert.deepEqual(second.next, first.next);
  });

  it('never overwrites: existing values and private notes stay, blanks fill', () => {
    const backup = buildRosterBackup(coachSources(), { scope: 'coach-private', now });
    const local = sources([student({ id: 'a', name: 'Ana Lima', belt: 'Blue', note: 'Local note', division: '' })], {
      cardFile: { cards: { a: { trainingStyle: 'nogi' } } },
      privateNotes: { a: 'Local private' },
    });
    const { next, report } = mergeRosterBackup(local, backup, { now: now.getTime() });
    const ana = next.roster.students.find((row) => row.id === 'a')!;
    assert.equal(ana.note, 'Local note');
    assert.equal(ana.stripes, 2, 'blank stripes filled');
    assert.equal(next.cardFile.cards.a.trainingStyle, 'nogi');
    assert.equal(next.cardFile.cards.a.trainingStartedOn, '2020-01-01');
    assert.equal(next.privateNotes.a, 'Local private');
    assert.equal(next.privateNotes.b, 'Private: shy');
    assert.equal(report.studentsFilled, 1);
    assert.equal(report.studentsAdded, 1);
  });

  it('matches by id, then linked student, then name + belt, and reports ambiguous matches', () => {
    const local = sources([
      student({ id: 'x1', name: 'Sam Cruz', belt: 'Blue' }),
      student({ id: 'x2', name: 'sam  cruz', belt: 'Blue' }),
      student({ id: 'l1', name: 'Renamed', belt: 'Blue', linkedStudentId: 'link-9' }),
    ]);
    const incoming = buildRosterBackup(
      sources([
        student({ id: 'other-1', name: 'Sam Cruz', belt: 'Blue', note: 'from file' }),
        student({ id: 'other-2', name: 'Linked Person', belt: 'Blue', linkedStudentId: 'link-9', note: 'linked note' }),
      ]),
      { scope: 'coach-private', now },
    );
    const { next, report } = mergeRosterBackup(local, incoming, { now: now.getTime() });
    assert.equal(report.ambiguous.length, 1);
    assert.equal(report.ambiguous[0].name, 'Sam Cruz');
    assert.equal(report.ambiguous[0].matches, 2);
    // Ambiguous rows are not merged or added.
    assert.equal(next.roster.students.length, 3);
    assert.equal(next.roster.students.find((row) => row.id === 'l1')!.note, 'linked note');
    assert.match(formatRosterMergeReport(report), /Sam Cruz/);
  });

  it('shared copies drop private notes, face photos, card shares, and photo reviews', () => {
    const shared = buildRosterBackup(coachSources(), { scope: 'shared', now });
    const text = serializeRosterBackup(shared);
    assert.equal(shared.scope, 'shared');
    assert.equal(shared.privateNotes, undefined);
    assert.doesNotMatch(text, /Private:/);
    assert.doesNotMatch(text, /FACE|data:image|parent@example\.com/);
    assert.equal(shared.coachStores?.studentInbox.shares.length, 0);
    assert.equal(shared.coachStores?.photoReviews.length, 0);
    assert.equal(shared.cards.a.photos, undefined);

    // A shared file that someone edited to add private notes is still read without them.
    const tampered = JSON.parse(text) as Record<string, unknown>;
    tampered.privateNotes = { a: 'Injected' };
    const parsed = parseRosterBackup(JSON.stringify(tampered));
    assert.ok(parsed.ok);
    assert.equal(parsed.backup.privateNotes, undefined);
    assert.equal(sharedRosterBackup(buildRosterBackup(coachSources(), { scope: 'coach-private', now })).privateNotes, undefined);
  });

  it('keeps coach sync settings on existing cards and caps coach stores', () => {
    const local = sources([student({ id: 'b', name: 'Bo Kim', belt: 'White', rosterList: 'student' })]);
    const incoming = buildRosterBackup(coachSources(), { scope: 'coach-private', now });
    const { next } = mergeRosterBackup(local, incoming, { now: now.getTime() });
    assert.equal(next.roster.students.find((row) => row.id === 'b')!.coachSync, undefined, 'existing card sync setting unchanged');

    const big = emptyCoachStores();
    for (let index = 0; index < COACH_STORE_CAPS.cardSyncSent + 50; index += 1) {
      big.cardSyncSent.push({ linkedStudentId: 's', kind: 'rank', updateId: `u${index}`, sentAt: index, mode: 'auto' });
    }
    const capped = mergeRosterBackup(sources([]), buildRosterBackup(sources([], { coachStores: big }), { scope: 'coach-private', now }));
    assert.ok((capped.next.coachStores?.cardSyncSent.length ?? 0) <= COACH_STORE_CAPS.cardSyncSent);
  });

  it('rejects other JSON and reads a newer schema without failing', () => {
    assert.equal(parseRosterBackup('{"kind":"something-else"}').ok, false);
    assert.equal(parseRosterBackup('not json').ok, false);
    const newer = { ...buildRosterBackup(coachSources(), { scope: 'coach-private', now }), schemaVersion: ROSTER_BACKUP_SCHEMA_VERSION + 1, futureField: 1 };
    const parsed = parseRosterBackup(JSON.stringify(newer));
    assert.ok(parsed.ok);
    assert.equal(parsed.newerSchema, true);
  });
});
