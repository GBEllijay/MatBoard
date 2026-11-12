import assert from 'node:assert/strict';
import test from 'node:test';
import { exportProgressPacket, mergeStudentProgress, packetCarriesBytes, parseProgressPacket } from './progress/format.ts';
import { readJournalCardVideos } from './progress/cardVideos.ts';
import { JOURNAL_CARD_VIDEOS_MAX, type StudentProgressReport } from './progress/types.ts';
import { addJournalEntry, blankStudentReport, updateJournalEntry } from './studentEdition.ts';
import {
  CARD_VIDEO_FULL_ERROR,
  CARD_VIDEO_LINK_ERROR,
  CARD_VIDEO_TERM_ERROR,
  addCardVideo,
  cardVideoLinkError,
  cardVideoQuickTerms,
  cardVideoTerm,
  cardVideoTermKnown,
  cardVideoTermSuggestions,
  cardVideosForTerm,
  journalCardVideos,
  removeCardVideo,
  updateCardVideo,
} from './journalCardVideos.ts';

const draft = {
  date: '2026-11-12',
  className: 'Tuesday fundamentals',
  gameTag: '' as const,
  techniques: [{ id: '', name: 'Kimura' }],
  partners: '',
  drills: '',
  rolls: '',
  notes: 'Grip first.',
};

function withCard(): { report: StudentProgressReport; id: string } {
  const report = addJournalEntry(blankStudentReport(1), draft, 10);
  return { report, id: report.journal[0].id };
}

function parse(report: StudentProgressReport): StudentProgressReport {
  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.errors.join('\n'));
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') throw new Error('not a report');
  return parsed.value;
}

test('an older card with no videos loads unchanged and reads as no videos', () => {
  const { report, id } = withCard();
  const before = report.journal[0];
  assert.equal('videos' in before, false);
  const again = parse(report);
  assert.deepEqual(again.journal[0], before);
  assert.equal('videos' in again.journal[0], false);
  assert.deepEqual(journalCardVideos(again.journal.find((row) => row.id === id)), []);
});

test('a link video saves on one card with its glossary tag and survives export and parse', () => {
  const { report, id } = withCard();
  const { report: next, video } = addCardVideo(
    report,
    id,
    { source: 'link', url: 'https://youtu.be/abc123', term: cardVideoTerm('kimura'), note: 'Figure four from side control' },
    { id: 'jvid.test.1', now: 20 },
  );
  assert.equal(video.term.id, 'gl.kimura');
  assert.equal(video.term.name, 'Kimura');
  assert.equal(next.journal[0].body, report.journal[0].body);
  const again = parse(next);
  assert.deepEqual(again.journal[0].videos, [
    {
      id: 'jvid.test.1',
      source: 'link',
      url: 'https://youtu.be/abc123',
      term: { id: 'gl.kimura', name: 'Kimura' },
      note: 'Figure four from side control',
      createdAt: 20,
      updatedAt: 20,
    },
  ]);
  assert.equal(cardVideosForTerm(again, 'Kimura').length, 1);
});

test('a phone video keeps only an id and file label in the journal, never bytes', () => {
  const { report, id } = withCard();
  const { report: next } = addCardVideo(
    report,
    id,
    { source: 'phone', fileName: 'kimura.mp4', mime: 'video/mp4', size: 1024, term: cardVideoTerm('Kimura'), note: '' },
    { id: 'jvid.phone.1', now: 30 },
  );
  const row = next.journal[0].videos?.[0];
  assert.equal(row?.source, 'phone');
  assert.equal(row?.url, undefined);
  assert.equal(row?.fileName, 'kimura.mp4');
  assert.equal(packetCarriesBytes(next), false);
  assert.doesNotMatch(exportProgressPacket(next), /data:|base64|blob:/);
});

test('a link must be http or https and a tag is required', () => {
  const { report, id } = withCard();
  assert.equal(cardVideoLinkError('javascript:alert(1)'), CARD_VIDEO_LINK_ERROR);
  assert.equal(cardVideoLinkError('youtube.com/watch'), CARD_VIDEO_LINK_ERROR);
  assert.equal(cardVideoLinkError('https://www.instagram.com/reel/x'), '');
  assert.throws(() => addCardVideo(report, id, { source: 'link', url: 'ftp://x', term: cardVideoTerm('Kimura'), note: '' }), new RegExp(CARD_VIDEO_LINK_ERROR.slice(0, 20)));
  assert.throws(() => addCardVideo(report, id, { source: 'link', url: 'https://x.test', term: null, note: '' }), new RegExp(CARD_VIDEO_TERM_ERROR));
});

test('glossary tag: headword and alias resolve to the core id, own moves keep mine., anything else is a free name', () => {
  const core = cardVideoTerm('  kimura ');
  assert.deepEqual(core, { id: 'gl.kimura', name: 'Kimura' });
  assert.equal(cardVideoTermKnown(core), true);
  assert.deepEqual(cardVideoTerm('mobility'), { id: 'gl.flexibility', name: 'Flexibility' });
  const own = cardVideoTerm('marty special', [{ name: 'Marty Special', faceId: 'sweeps' }]);
  assert.deepEqual(own, { id: 'mine.marty-special', name: 'Marty Special' });
  assert.equal(cardVideoTermKnown(own), true);
  const free = cardVideoTerm('Something new');
  assert.deepEqual(free, { id: '', name: 'Something new' });
  assert.equal(cardVideoTermKnown(free), false);
  assert.equal(cardVideoTerm('   '), null);
  const hits = cardVideoTermSuggestions('kimu');
  assert.ok(hits.some((term) => term.id === 'gl.kimura'), hits.map((term) => term.id).join(','));
  assert.deepEqual(cardVideoQuickTerms(['Kimura', 'Kimura', 'not a glossary move']), [{ id: 'gl.kimura', name: 'Kimura' }]);
});

test('editing the card text keeps its videos; remove and retag work; the list is capped', () => {
  const { report, id } = withCard();
  let next = addCardVideo(report, id, { source: 'link', url: 'https://x.test/1', term: cardVideoTerm('Kimura'), note: '' }, { id: 'jvid.a', now: 20 }).report;
  next = updateJournalEntry(next, id, { ...draft, notes: 'Changed words.' }, 30);
  assert.equal(next.journal[0].videos?.length, 1);
  next = updateCardVideo(next, id, 'jvid.a', { term: cardVideoTerm('Armbar') ?? { id: '', name: 'Armbar' }, note: 'retag' }, 40);
  assert.equal(next.journal[0].videos?.[0].note, 'retag');
  assert.equal(next.journal[0].videos?.[0].updatedAt, 40);
  next = removeCardVideo(next, id, 'jvid.a', 50);
  assert.equal('videos' in next.journal[0], false);
  let full = report;
  for (let index = 0; index < JOURNAL_CARD_VIDEOS_MAX; index += 1) {
    full = addCardVideo(full, id, { source: 'link', url: `https://x.test/${index}`, term: cardVideoTerm('Kimura'), note: '' }, { id: `jvid.f${index}`, now: 60 + index }).report;
  }
  assert.throws(() => addCardVideo(full, id, { source: 'link', url: 'https://x.test/more', term: cardVideoTerm('Kimura'), note: '' }), new RegExp(CARD_VIDEO_FULL_ERROR.slice(0, 20)));
});

test('a damaged video row is dropped and the rest of the journal still opens', () => {
  const { report, id } = withCard();
  const raw = JSON.parse(exportProgressPacket(report));
  raw.journal[0].videos = [
    { id: 'jvid.ok', source: 'link', url: 'https://x.test', term: { id: 'gl.kimura', name: 'Kimura' }, note: '', createdAt: 1, updatedAt: 1 },
    { id: 'jvid.bad', source: 'link', url: 'javascript:alert(1)', term: { name: 'Kimura' } },
    { id: 'jvid.noterm', source: 'phone' },
    'junk',
  ];
  const parsed = parseProgressPacket(JSON.stringify(raw));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.deepEqual(parsed.value.journal[0].videos?.map((video) => video.id), ['jvid.ok']);
  assert.equal(parsed.value.journal[0].id, id);
  assert.equal(readJournalCardVideos('nope'), undefined);
  assert.equal(readJournalCardVideos([]), undefined);
});

test('restoring a file adds videos this phone does not have and keeps the ones it does', () => {
  const { report, id } = withCard();
  const local = addCardVideo(report, id, { source: 'link', url: 'https://x.test/local', term: cardVideoTerm('Kimura'), note: '' }, { id: 'jvid.local', now: 20 }).report;
  const incoming = addCardVideo(report, id, { source: 'link', url: 'https://x.test/other', term: cardVideoTerm('Kimura'), note: '' }, { id: 'jvid.other', now: 21 }).report;
  const merged = mergeStudentProgress(local, incoming);
  assert.deepEqual(merged.report.journal[0].videos?.map((video) => video.id), ['jvid.local', 'jvid.other']);
});

test('row labels name the term and where the video lives', async () => {
  const { cardVideoLabel } = await import('./journalCardVideos.ts');
  const base = { term: { id: 'gl.kimura', name: 'Kimura' }, note: '', createdAt: 1, updatedAt: 1 };
  assert.equal(cardVideoLabel({ ...base, id: 'a', source: 'link', url: 'https://www.youtube.com/watch?v=1' }), 'Kimura · Link · youtube.com');
  assert.equal(cardVideoLabel({ ...base, id: 'b', source: 'phone', fileName: 'k.mp4' }), 'Kimura · On this phone · k.mp4');
});

test('the public demo journal card keeps the same id on every read, so it opens', async () => {
  const { demoStudentPacket } = await import('./studentEdition.ts');
  const first = parseProgressPacket(demoStudentPacket());
  const second = parseProgressPacket(demoStudentPacket());
  assert.ok(first.ok && second.ok);
  if (!first.ok || !second.ok || first.value.kind !== 'student-progress-report' || second.value.kind !== 'student-progress-report') return;
  assert.equal(first.value.journal[0].id, 'card.demo.1');
  assert.equal(second.value.journal[0].id, first.value.journal[0].id);
});
