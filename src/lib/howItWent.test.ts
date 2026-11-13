import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeHowItWentLines, foldStopDoing, readHowItWentLines } from './journalNotes.ts';
import { journalFields } from './journalIndex.ts';
import { howItWentOf, latestHowItWent } from './sessionQuality.ts';
import { addJournalEntry, blankStudentReport, decodeJournalBody, updateJournalEntry, viewJournalEntry } from './studentEdition.ts';
import { journalReportLine } from './studentReport.ts';

const base = {
  date: '2026-11-12',
  className: 'Fundamentals',
  gameTag: '' as const,
  techniques: [],
  partners: '',
  drills: '',
  rolls: '3 rounds',
  notes: 'Grip first.',
};

/** A card saved by the older app: How it went line plus a separate Stop doing block in Notes. */
function olderCard() {
  const report = addJournalEntry(blankStudentReport(1), { ...base, howItWent: 'Felt slow', stopDoing: 'Reaching with straight arms' }, 10);
  return { report, entry: report.journal[0] };
}

test('an older card still stores Stop doing in its body and decode reads it separately', () => {
  const { entry } = olderCard();
  assert.match(entry.body, /\nStop doing:\nReaching with straight arms$/);
  const decoded = decodeJournalBody(entry.body);
  assert.equal(decoded.howItWent, 'Felt slow');
  assert.equal(decoded.stopDoing, 'Reaching with straight arms');
  assert.equal(decoded.notes, 'Grip first.');
});

test('on view, the older stop-doing text reads as part of How it went (How it went first)', () => {
  const { entry } = olderCard();
  const card = viewJournalEntry(entry);
  assert.equal(card.howItWent, 'Felt slow\nReaching with straight arms');
  assert.equal(card.stopDoing, '');
  assert.equal(card.notes, 'Grip first.');
  assert.equal(howItWentOf(entry), 'Felt slow\nReaching with straight arms');
  assert.equal(latestHowItWent([entry])?.text, 'Felt slow Reaching with straight arms');
  const fields = journalFields(entry);
  assert.equal(fields.some((field) => /stop/i.test(field.label)), false);
  assert.equal(fields.find((field) => field.label === 'How it went')?.text, 'Felt slow\nReaching with straight arms');
  const line = journalReportLine(entry);
  assert.match(line, /How it went: Felt slow \/ Reaching with straight arms/);
  assert.doesNotMatch(line, /Stop doing/);
});

test('loading does not rewrite the card; saving the edit form moves the text into How it went and clears Stop doing', () => {
  const { report, entry } = olderCard();
  const card = viewJournalEntry(entry);
  assert.equal(report.journal[0].body, entry.body);
  const saved = updateJournalEntry(report, entry.id, { ...base, howItWent: card.howItWent, stopDoing: '' }, 20);
  const body = saved.journal[0].body;
  assert.doesNotMatch(body, /Stop doing/);
  assert.match(body, /^How it went: Felt slow$/m);
  assert.match(body, /^How it went, more: Reaching with straight arms$/m);
  assert.equal(viewJournalEntry(saved.journal[0]).howItWent, 'Felt slow\nReaching with straight arms');
  assert.equal(decodeJournalBody(body).notes, 'Grip first.');
});

test('an update that does not touch How it went keeps the older stop-doing text (folded in)', () => {
  const { report, entry } = olderCard();
  const saved = updateJournalEntry(report, entry.id, { ...base, rolls: '4 rounds' }, 20);
  assert.equal(viewJournalEntry(saved.journal[0]).howItWent, 'Felt slow\nReaching with straight arms');
});

test('multi-line How it went keeps its lines and does not leak into notes', () => {
  const report = addJournalEntry(blankStudentReport(1), { ...base, howItWent: '  Line one\n\nLine three  \n' }, 10);
  const entry = report.journal[0];
  assert.equal(viewJournalEntry(entry).howItWent, 'Line one\n\nLine three');
  assert.equal(viewJournalEntry(entry).notes, 'Grip first.');
  assert.equal(howItWentOf(entry), 'Line one\n\nLine three');
  assert.deepEqual(encodeHowItWentLines('a\r\nb'), ['How it went: a', 'How it went, more: b']);
  assert.deepEqual(encodeHowItWentLines('  \n '), []);
  assert.equal(readHowItWentLines(['Class: x', 'How it went: one']), 'one');
  assert.equal(foldStopDoing('', 'only stop'), 'only stop');
  assert.equal(foldStopDoing('only how', ''), 'only how');
});
