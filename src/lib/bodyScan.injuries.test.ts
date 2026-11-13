/**
 * Injuries added from the body-scan list, not from a journal card.
 * They share the injury store with journal marks and must not create a card.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { addInjury, bodyScan, injuryMarks, setInjuryStatus, setReportInjuryStatus } from './bodyScan.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport } from './studentEdition.ts';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
};

test('add-from-list: persists and reloads without creating a journal card', () => {
  const storage = memory();
  let report = blankStudentReport(10);
  report = addInjury(report, { date: '2026-11-11', area: 'Left knee', note: 'car accident', zone: 'kneeL' }, 20);
  assert.equal(report.journal.length, 0);
  assert.equal(report.injuries?.length, 1);
  assert.equal(report.injuries?.[0].source, 'outside');
  assert.equal(report.injuries?.[0].status, 'hurt');
  saveStudentReport(storage, report);
  const loaded = loadStudentReport(storage);
  assert.equal(loaded.journal.length, 0);
  assert.equal(loaded.injuries?.length, 1);
  assert.equal(loaded.injuries?.[0].area, 'Left knee');
  assert.equal(loaded.injuries?.[0].note, 'car accident');
  assert.equal(loaded.injuries?.[0].zone, 'kneeL');
  assert.equal(loaded.injuries?.[0].source, 'outside');
  assert.equal(loaded.injuries?.[0].status, 'hurt');
});

test('add-from-list: appears with journal injuries and healing does not change the journal card', () => {
  const storage = memory();
  let report = addJournalEntry(
    blankStudentReport(10),
    { date: '2026-11-09', className: 'Gi', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'n', injury: { area: 'Right wrist', note: 'from class', zone: 'wristR' } },
    10,
  );
  const journalId = report.journal[0].id;
  report = addInjury(report, { date: '2026-11-11', area: 'Left knee', note: 'car accident', zone: 'kneeL' }, 20);
  const marks = injuryMarks(report.journal, report.injuries);
  assert.equal(marks.length, 2);
  assert.equal(marks.some((m) => m.entryId === journalId && m.fromJournal && m.area === 'Right wrist'), true);
  assert.equal(marks.some((m) => !m.fromJournal && m.area === 'Left knee' && m.source === 'outside'), true);

  const listId = report.injuries![0].id;
  const next = setReportInjuryStatus(report, listId, 'healing', '2026-11-11', 30);
  assert.equal(next.injuries?.[0].status, 'healing');
  assert.equal(next.injuries?.[0].markedOn, '2026-11-11');
  assert.equal(next.journal[0].id, journalId);
  assert.equal(next.journal[0].injury?.area, 'Right wrist');
  assert.equal(next.journal[0].injury?.status, undefined);
  assert.equal(next.journal[0].injury?.note, 'from class');

  const untouched = setInjuryStatus(next.journal, journalId, 'healing', '2026-11-11');
  // The journal-only helper still works, and setReportInjuryStatus on the list id left the card alone.
  assert.equal(next.journal[0].injury?.status, undefined);
  assert.equal(untouched[0].injury?.status, 'healing');

  saveStudentReport(storage, next);
  const loaded = loadStudentReport(storage);
  assert.equal(loaded.injuries?.[0].status, 'healing');
  assert.equal(loaded.journal[0].injury?.area, 'Right wrist');
  assert.equal(loaded.journal[0].injury?.status, undefined);
  const scan = bodyScan(loaded.journal, '2026-11-11', loaded.injuries);
  assert.equal(scan.zones.find((z) => z.zone === 'kneeL')?.status, 'healing');
  assert.equal(scan.zones.find((z) => z.zone === 'wristR')?.status, 'hurt');

  const round = parseProgressPacket(exportProgressPacket(loaded));
  assert.equal(round.ok, true);
  if (round.ok && round.value.kind === 'student-progress-report') {
    assert.equal(round.value.journal[0].injury?.note, 'from class');
    assert.equal(round.value.injuries?.[0].note, 'car accident');
  }
});

test('older journal-only files still load the same way when injuries is omitted', () => {
  const storage = memory();
  const report = addJournalEntry(
    blankStudentReport(10),
    { date: '2026-11-01', className: 'Gi', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'n', injury: { area: 'Neck', note: 'old' } },
    10,
  );
  assert.equal(report.injuries, undefined);
  saveStudentReport(storage, report);
  const loaded = loadStudentReport(storage);
  assert.equal(loaded.injuries, undefined);
  assert.equal(loaded.journal[0].injury?.area, 'Neck');
  assert.equal(injuryMarks(loaded.journal, loaded.injuries).length, 1);
});
