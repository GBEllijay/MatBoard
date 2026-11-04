/**
 * Journal round: technique lines with What I learned notes, the per-student
 * technique index, typo-tolerant search + highlight, binder pagination,
 * the fundamentals flag default, session types and the minute wheel.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { addJournalEntry, blankStudentReport, viewJournalEntry } from './studentEdition.ts';
import { editDistance, fuzzyMatches, highlightParts, searchJournalIndex, techniqueLineHits, videosForTechnique } from './journalIndex.ts';
import { JOURNAL_PAGE_ROWS, pageLabel, paginateJournal, wrapRows } from './journalPages.ts';
import { myTechniques, techniquePicker, techniqueSuggestions } from './techniqueIndex.ts';
import { FUNDAMENTALS_REQUIRED_FOR_BELT } from './fundamentalsConfig.ts';
import { checkpointFilled, learnedCatalogIds } from './studentTools.ts';
import type { RubricCheckpoint } from './progress/types.ts';
import { JOURNAL_SESSION_LABELS, matHoursSplit, matHoursTotal, matMinuteOptions, sessionLabel, sessionOf, clockMatTime } from './matHours.ts';
import { logMatTime } from './matLog.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { JOURNAL_SESSIONS, type StudentProgressReport } from './progress/types.ts';

const base = { className: 'Fundamentals', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: '' };
function log(report: StudentProgressReport, date: string, extra: Record<string, unknown> = {}, now = 1) {
  return addJournalEntry(report, { ...base, date, ...extra } as never, now);
}

test('technique lines keep What I learned notes; old entries read as lines with empty notes', () => {
  let r = log(blankStudentReport(1), '2026-11-01', { techniques: [{ id: 'free.1', name: 'Kimura trap', note: 'Hide the elbow first' }, { id: 'free.2', name: 'Hip bump' }] });
  const view = viewJournalEntry(r.journal[0]);
  assert.equal(view.techniques[0].name, 'Kimura trap');
  assert.equal(view.techniques[0].note, 'Hide the elbow first');
  assert.equal(view.techniques[1].note ?? '', '');
  assert.match(r.journal[0].body, /^What I learned #1: Hide the elbow first$/m);
  assert.ok(!r.journal[0].techniqueRefs?.some((ref) => 'note' in ref), 'notes stay in the body, refs schema unchanged');
  r = log(r, '2026-11-02', { techniques: [{ id: 'free.3', name: 'Armbar' }] }, 2);
  assert.equal(viewJournalEntry(r.journal[1]).techniques[0].note ?? '', '');
});

test('My techniques: deduped, newest spelling wins, sorted; picker search filters both sections', () => {
  let r = log(blankStudentReport(1), '2026-11-01', { techniques: [{ id: 'free.a', name: 'kimura trap' }] }, 1);
  r = log(r, '2026-11-02', { techniques: [{ id: 'free.b', name: 'Kimura Trap' }, { id: 'free.c', name: 'Zorbo pass' }] }, 2);
  assert.deepEqual(myTechniques(r), ['Kimura Trap', 'Zorbo pass']);
  const picked = techniquePicker(r, 'kim');
  assert.deepEqual(picked.mine, ['Kimura Trap']);
  assert.ok(techniqueSuggestions(r, 'zorb').includes('Zorbo pass'));
});

test('search is typo- and accent-tolerant and highlights matches; technique lines and videos surface', () => {
  let r = log(blankStudentReport(1), '2026-11-01', { techniques: [{ id: 'free.a', name: 'Scissor sweep', note: 'Pull the collar' }], notes: 'Felt great at the café' });
  r = log(r, '2026-11-02', { notes: 'Mount escapes' }, 2);
  assert.equal(editDistance('scisor', 'scissor'), 1);
  assert.ok(fuzzyMatches('Scissor sweep', 'sciscor'));
  assert.ok(fuzzyMatches('café', 'CAFE'));
  assert.ok(!fuzzyMatches('Mount', 'mat'), 'short words need an exact start');
  assert.equal(searchJournalIndex(r.journal, 'sissor').length, 1);
  assert.equal(searchJournalIndex(r.journal, 'zzzz-nothing').length, 0);
  assert.deepEqual(highlightParts('Scissor sweep', 'scisor').filter((p) => p.match).map((p) => p.text), ['Scissor']);
  assert.equal(techniqueLineHits(r.journal, 'scissor')[0].note, 'Pull the collar');
  const withClip = { ...r, clips: [{ id: 'c1', description: 'Scissor sweep details', note: '' }] } as unknown as StudentProgressReport;
  assert.equal(videosForTechnique(withClip, 'scissor').length, 1);
});

test('binder pagination: rows wrap, pages fill to the row limit, labels read Page n of m', () => {
  assert.equal(paginateJournal([]).length, 1);
  const long = Array.from({ length: JOURNAL_PAGE_ROWS + 3 }, (_, i) => `Line ${i}`);
  const pages = paginateJournal(long);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].length, JOURNAL_PAGE_ROWS);
  assert.equal(pageLabel(1, 2), 'Page 2 of 2');
  const rows = wrapRows('one two three four five six seven eight nine ten eleven', 12);
  assert.ok(rows.length > 1 && rows[0].lead && !rows[1].lead);
  assert.equal(rows.map((row) => row.text).join(''), 'one two three four five six seven eight nine ten eleven');
});

test('fundamentals flag defaults to required (no behavior change)', () => {
  assert.equal(FUNDAMENTALS_REQUIRED_FOR_BELT, true);
  const coachMet = { id: 'c.plain', requirement: 'Shows up', techniqueRefs: [], met: true, note: '' };
  const fundamentals = { id: 'c.fund', requirement: 'Scissor sweep', techniqueRefs: [{ catalogItemId: 'sweep.scissor' }], met: null, note: '' };
  const row = { id: 'checkpoint.x', name: 'Guard', met: null, note: '', criteria: [coachMet, fundamentals] } as unknown as RubricCheckpoint;
  const learned = learnedCatalogIds(blankStudentReport(1));
  // Default = required: an unmet fundamentals requirement still blocks the checkpoint (today's behavior).
  assert.equal(checkpointFilled(row, learned), false);
  assert.equal(checkpointFilled(row, learned), checkpointFilled(row, learned, true));
  // Flag off: fundamentals requirements stop blocking; the coach-met one still decides.
  assert.equal(checkpointFilled(row, learned, false), true);
  assert.equal(checkpointFilled({ ...row, criteria: [fundamentals] } as RubricCheckpoint, learned, false), false);
});

test('session types: four options, Other text stored and shown, old entries still read', () => {
  assert.deepEqual([...JOURNAL_SESSIONS], ['class', 'openMat', 'misc', 'other']);
  assert.deepEqual(JOURNAL_SESSIONS.map((k) => JOURNAL_SESSION_LABELS[k]), ['Class', 'Open mat', 'Miscellaneous', 'Other']);
  let r = log(blankStudentReport(1), '2026-11-01', { session: 'other', sessionOther: '  Wrestling ', minutes: 91 });
  r = log(r, '2026-11-02', { session: 'misc', sessionOther: 'ignored', minutes: 30 }, 2);
  r = log(r, '2026-11-03', { minutes: 60 }, 3);
  assert.equal(r.journal[0].sessionOther, 'Wrestling');
  assert.equal(r.journal[1].sessionOther, undefined, 'text only kept on Other');
  assert.equal(sessionOf(r.journal[2]), 'class');
  assert.equal(sessionLabel('other', 'Wrestling'), 'Other · Wrestling');
  assert.equal(sessionLabel('other', ''), 'Other');
  const total = matHoursTotal(r.journal);
  assert.equal(total.otherMinutes, 121);
  assert.equal(matHoursSplit(total), 'Class 1 · Other 2');
  const parsed = parseProgressPacket(exportProgressPacket(r));
  assert.ok(parsed.ok);
  if (parsed.ok) {
    assert.equal(parsed.value.journal[0].session, 'other');
    assert.equal(parsed.value.journal[0].sessionOther, 'Wrestling');
  }
  const q = logMatTime(blankStudentReport(1), { date: '2026-11-04', session: 'other', sessionOther: 'Seminar', minutes: 45 }, 4);
  assert.equal(q.journal[0].sessionOther, 'Seminar');
});

test('minute wheel: every minute 0–720, soft detents on 10s, 1:31 label, stored as minutes', () => {
  const options = matMinuteOptions();
  assert.equal(options.length, 721);
  assert.equal(options[0].label, 'Untimed');
  assert.equal(options[91].value, 91);
  assert.equal(options[91].label, '1:31');
  assert.equal(clockMatTime(91), '1:31');
  assert.ok(options[30].detent && options[90].detent && options[10].detent);
  assert.ok(!options[91].detent && !options[0].detent);
});
