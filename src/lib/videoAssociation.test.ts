import assert from 'node:assert/strict';
import test from 'node:test';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { blankStudentReport, addJournalClip, addJournalEntry, setFundamentalLevel, updateJournalClip } from './studentEdition.ts';
import { loadFilms, writeFilms, type StudentFilm } from './studentFilm.ts';
import {
  applyLinkIntent,
  associationAfterSave,
  clipsForJournal,
  comparePractice,
  earlierPractices,
  filmsForJournal,
  journalFilmHref,
  latestPractice,
  practiceEntries,
  readJournalFilmContext,
  resolveTechnique,
  safeStudentReturn,
  setClipAnchor,
  setClipJournal,
  setFilmAnchor,
  setFilmJournal,
  videosForCard,
} from './videoAssociation.ts';
import { findWorkingByTitle, readWorkingGraph, renameWorkingNode } from './workingTechniques.ts';

function memory() {
  const bag = new Map<string, string>();
  return {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
  };
}

const film = (id: string, technique: string, extra: Partial<StudentFilm> = {}): StudentFilm => ({
  id,
  fileName: `${technique}.mp4`,
  date: '2026-11-06',
  technique,
  note: '',
  mime: 'video/mp4',
  size: 12,
  createdAt: 1,
  updatedAt: 1,
  where: 'phone',
  provider: '',
  driveFileId: '',
  dateFolder: '2026-11-06',
  ...extra,
});

test('a failed or cancelled library save does not create a fundamental, a working technique, or a journal link', () => {
  const report = blankStudentReport(1);
  const cancelled = associationAfterSave(report, { saved: false, title: 'Waiter sweep', intent: { kind: 'create-fundamental' }, now: 5 });
  assert.equal(cancelled.report, report);
  assert.equal(cancelled.anchor, undefined);
  assert.equal(report.checklist.length, 0);
  const failed = associationAfterSave(report, { saved: false, title: 'Waiter sweep', intent: { kind: 'create-working' }, now: 6 });
  assert.equal(failed.report, report);
  assert.equal(readWorkingGraph(report.working)?.nodes.length ?? 0, 0);
});

test('the same video title links to the existing fundamental and does not mark it learned', () => {
  let report = blankStudentReport(1);
  report = setFundamentalLevel(report, { catalogItemId: 'sweep.hip-bump', categoryId: 'sweeps', name: 'Hip bump sweep' }, 4, 3);
  const levelBefore = report.checklist.find((row) => row.catalogItemId === 'sweep.hip-bump')?.level;
  const first = applyLinkIntent(report, 'Hip bump sweep', { kind: 'create-fundamental' }, 8);
  assert.equal(first.created, false);
  assert.equal(first.deduped, true);
  assert.equal(first.anchor?.id, 'sweep.hip-bump');
  assert.equal(first.report, report);
  assert.equal(report.checklist.find((row) => row.catalogItemId === 'sweep.hip-bump')?.level, levelBefore);
  const again = applyLinkIntent(first.report, 'hip   bump sweep', { kind: 'create-fundamental' }, 9);
  assert.equal(again.anchor?.id, first.anchor?.id);
  assert.equal(again.report.checklist.length, report.checklist.length);
});

test('a new title is added once to fundamentals and once to techniques being worked on', () => {
  const report = blankStudentReport(1);
  const fundamental = applyLinkIntent(report, 'Waiter sweep', { kind: 'create-fundamental' }, 4);
  assert.equal(fundamental.created, true);
  assert.equal(fundamental.deduped, false);
  assert.equal(fundamental.anchor?.kind, 'fundamental');
  assert.equal(fundamental.report.checklist.find((row) => row.id === fundamental.anchor?.id)?.level, 0);
  assert.equal(fundamental.report.checklist.find((row) => row.id === fundamental.anchor?.id)?.learnedOn, '');
  const again = applyLinkIntent(fundamental.report, 'Waiter sweep', { kind: 'create-fundamental' }, 5);
  assert.equal(again.deduped, true);
  assert.equal(again.anchor?.id, fundamental.anchor?.id);
  assert.equal(again.report.checklist.length, fundamental.report.checklist.length);

  const working = applyLinkIntent(report, 'Uchi Mata from Sprawl', { kind: 'create-working' }, 6);
  assert.equal(working.created, true);
  assert.equal(findWorkingByTitle(readWorkingGraph(working.report.working) ?? { nodes: [], edges: [] }, 'Uchi Mata from Sprawl')?.id, working.anchor?.id);
  const linked = applyLinkIntent(working.report, 'uchi mata from sprawl', { kind: 'create-working' }, 7);
  assert.equal(linked.deduped, true);
  assert.equal(linked.anchor?.id, working.anchor?.id);
  assert.equal(readWorkingGraph(linked.report.working)?.nodes.length, 1);
});

test('choosing an existing working technique does not rename it or add a second copy', () => {
  const created = applyLinkIntent(blankStudentReport(1), 'Knee cut', { kind: 'create-working' }, 2);
  const node = readWorkingGraph(created.report.working)?.nodes[0];
  assert.ok(node);
  const chosen = applyLinkIntent(created.report, 'Different title', { kind: 'working', id: node.id, name: 'ignored' }, 3);
  assert.equal(chosen.created, false);
  assert.equal(chosen.anchor?.name, 'Knee cut');
  assert.equal(readWorkingGraph(chosen.report.working)?.nodes.length, 1);
  assert.equal(chosen.report.working, created.report.working);
});

test('journal association and unlink round-trip for a link and a filmed move, and an edit keeps the link', () => {
  let report = addJournalEntry(blankStudentReport(1), {
    date: '2026-11-06',
    className: 'Fundamentals',
    gameTag: '',
    techniques: [{ id: '', name: 'Waiter sweep' }],
    partners: '',
    drills: '',
    rolls: '',
    notes: '',
  }, 10);
  const entryId = report.journal[0]?.id ?? '';
  report = addJournalClip(report, 'https://example.com/waiter', 'Waiter sweep details', 11);
  const clipId = report.clips?.[0]?.id ?? '';
  report = setClipJournal(report, clipId, entryId, 12);
  const anchor = applyLinkIntent(report, 'Waiter sweep', { kind: 'create-fundamental' }, 13);
  report = setClipAnchor(anchor.report, clipId, anchor.anchor, 14);
  report = updateJournalClip(report, clipId, 'https://example.com/waiter', 'Waiter sweep details', 15);
  assert.equal(report.clips?.[0]?.techniqueAnchor?.id, anchor.anchor?.id);
  assert.equal(clipsForJournal(report.clips ?? [], entryId).length, 1);

  const store = memory();
  const savedFilm = setFilmJournal(setFilmAnchor([film('film.1', 'Waiter sweep')], 'film.1', anchor.anchor, 16), 'film.1', entryId, 17);
  writeFilms(store, savedFilm);
  const loaded = loadFilms(store);
  assert.equal(loaded[0]?.journalEntryId, entryId);
  assert.equal(loaded[0]?.techniqueAnchor?.kind, 'fundamental');
  assert.equal(filmsForJournal(loaded, entryId).length, 1);
  assert.equal(filmsForJournal(setFilmJournal(loaded, 'film.1', ''), entryId).length, 1, 'an empty id does not move the film');
  const unlinked = setFilmAnchor(loaded, 'film.1', undefined, 18);
  assert.equal(unlinked[0]?.techniqueAnchor, undefined);
});

test('a legacy clip without a technique link still loads, and the new link is text not a video file', () => {
  const legacy = parseProgressPacket(JSON.stringify({
    ...blankStudentReport(1),
    clips: [{ id: 'clip.old', url: 'https://example.com/a', description: 'Old link', note: '', createdAt: 1, updatedAt: 1 }],
  }));
  assert.equal(legacy.ok, true);
  if (!legacy.ok) return;
  assert.equal(legacy.value.kind === 'student-progress-report' ? legacy.value.clips?.[0]?.techniqueAnchor : 'skip', undefined);
  let report = addJournalClip(blankStudentReport(2), 'https://example.com/b', 'Takedown Advice from Professor Zach', 2);
  const clip = report.clips?.[0];
  assert.ok(clip);
  report = setClipAnchor(report, clip.id, { kind: 'working', id: 'w1', name: 'Takedown Advice from Professor Zach' }, 3);
  const text = exportProgressPacket(report);
  assert.match(text, /https:\/\/example.com\/b/);
  assert.doesNotMatch(text, /"blob"|data:video/);
  const parsed = parseProgressPacket(text);
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.clips?.[0]?.techniqueAnchor?.name, 'Takedown Advice from Professor Zach');
  assert.equal(parsed.value.clips?.[0]?.url.startsWith('https://'), true);
});

function session(report: ReturnType<typeof blankStudentReport>, date: string, name: string, workingId: string, now: number, fundamentalId = '') {
  return addJournalEntry(report, {
    date,
    className: 'Fundamentals',
    gameTag: '',
    techniques: [{ id: fundamentalId, name, ...(workingId ? { workingId } : {}) }],
    partners: '',
    drills: '',
    rolls: '',
    notes: '',
  }, now);
}

test('a later session and a backdated session keep the older card, and the shortcut uses the practice date', () => {
  let report = applyLinkIntent(blankStudentReport(1), 'Waiter sweep', { kind: 'create-working' }, 2).report;
  const workingId = readWorkingGraph(report.working)?.nodes[0]?.id ?? '';
  report = session(report, '2026-11-01', 'Waiter sweep', workingId, 10);
  const older = report.journal[0];
  const olderCopy = structuredClone(older);
  report = session(report, '2026-11-08', 'Waiter sweep', workingId, 20);
  assert.deepEqual(report.journal[0], olderCopy);
  const anchor = { kind: 'working' as const, id: workingId, name: 'Waiter sweep' };
  assert.equal(latestPractice(report, anchor)?.id, report.journal[1]?.id);
  assert.equal(latestPractice(report, anchor)?.date, '2026-11-08');
  report = session(report, '2026-10-15', 'Waiter sweep', workingId, 30);
  assert.equal(latestPractice(report, anchor)?.date, '2026-11-08');
  assert.deepEqual(report.journal[0], olderCopy);
  const earlier = earlierPractices(report, anchor, report.journal[1]?.id ?? '');
  assert.deepEqual(earlier.map((hit) => hit.date), ['2026-11-01', '2026-10-15']);
  const level = report.checklist.map((row) => row.level);
  assert.deepEqual(report.checklist.map((row) => row.level), level);
});

test('the same practice date does not follow the last edit, and ids break a remaining tie', () => {
  const older = { date: '2026-11-06', createdAt: 10, id: 'card.b' };
  const newer = { date: '2026-11-06', createdAt: 20, id: 'card.c' };
  const edited = { ...older, createdAt: 10 };
  assert.ok(comparePractice(newer, edited) < 0);
  assert.equal(comparePractice({ date: '2026-11-06', createdAt: 5, id: 'card.b' }, { date: '2026-11-06', createdAt: 5, id: 'card.a' }) > 0, true);
  let report = applyLinkIntent(blankStudentReport(1), 'Knee cut', { kind: 'create-working' }, 2).report;
  const workingId = readWorkingGraph(report.working)?.nodes[0]?.id ?? '';
  report = session(report, '2026-11-06', 'Knee cut', workingId, 10);
  report = session(report, '2026-11-06', 'Knee cut', workingId, 40);
  const first = report.journal[0];
  if (first) first.updatedAt = 999;
  assert.equal(latestPractice(report, { kind: 'working', id: workingId, name: 'Knee cut' })?.createdAt, 40);
});

test('renaming a technique keeps the id, older card wording, and the video origin', () => {
  let report = applyLinkIntent(blankStudentReport(1), 'Uchi Mata from Sprawl', { kind: 'create-working' }, 2).report;
  const workingId = readWorkingGraph(report.working)?.nodes[0]?.id ?? '';
  report = session(report, '2026-11-02', 'Uchi Mata from Sprawl', workingId, 3);
  report = session(report, '2026-11-09', 'Uchi Mata from Sprawl', workingId, 4);
  const originId = report.journal[0]?.id ?? '';
  report = { ...report, working: renameWorkingNode(readWorkingGraph(report.working) ?? { nodes: [], edges: [] }, workingId, 'Uchi mata', 8) };
  const anchor = { kind: 'working' as const, id: workingId, name: 'Uchi Mata from Sprawl' };
  assert.equal(resolveTechnique(report, anchor).title, 'Uchi mata');
  assert.equal(resolveTechnique(report, anchor).missing, false);
  assert.equal(practiceEntries(report, anchor).find((hit) => hit.id === originId)?.name, 'Uchi Mata from Sprawl');
  const store = memory();
  const saved = setFilmJournal(setFilmAnchor([film('film.uchi', 'Uchi Mata from Sprawl')], 'film.uchi', anchor, 5), 'film.uchi', originId, 6);
  const moved = setFilmJournal(saved, 'film.uchi', report.journal[1]?.id ?? '', 7);
  assert.equal(moved[0]?.journalEntryId, originId);
  writeFilms(store, moved);
  assert.equal(loadFilms(store)[0]?.journalEntryId, originId);
  assert.equal(videosForCard(report, [], loadFilms(store), report.journal[1]?.id ?? '')[0]?.originId, originId);
  assert.equal(videosForCard(report, [], loadFilms(store), report.journal[1]?.id ?? '')[0]?.originHere, false);
});

test('a deleted technique and a card with no saved practice stay readable', () => {
  const report = blankStudentReport(1);
  const anchor = { kind: 'working' as const, id: 'w-missing', name: 'Old sweep' };
  assert.equal(resolveTechnique(report, anchor).missing, true);
  assert.equal(latestPractice(report, anchor), null);
  assert.deepEqual(earlierPractices(report, anchor), []);
  assert.equal(report.journal.length, 0);
  const linked = addJournalClip(report, 'https://example.com/old', 'Old sweep', 2);
  const clipId = linked.clips?.[0]?.id ?? '';
  const withClip = setClipAnchor(linked, clipId, { kind: 'working', id: 'w-missing', name: 'Old sweep' });
  assert.equal(withClip.clips?.[0]?.techniqueAnchor?.name, 'Old sweep');
  assert.equal(withClip.checklist.length, 0);
});

test('two techniques on one card do not share each others videos', () => {
  let report = applyLinkIntent(blankStudentReport(1), 'Armbar', { kind: 'create-working' }, 2).report;
  report = applyLinkIntent(report, 'Knee cut', { kind: 'create-working' }, 3).report;
  const nodes = readWorkingGraph(report.working)?.nodes ?? [];
  const arm = nodes.find((node) => node.title === 'Armbar');
  const knee = nodes.find((node) => node.title === 'Knee cut');
  assert.ok(arm && knee);
  report = addJournalEntry(report, {
    date: '2026-11-04',
    className: 'Both',
    gameTag: '',
    techniques: [
      { id: '', name: 'Armbar', workingId: arm.id },
      { id: '', name: 'Knee cut', workingId: knee.id },
    ],
    partners: '',
    drills: '',
    rolls: '',
    notes: '',
  }, 8);
  const both = report.journal[0]?.id ?? '';
  report = addJournalEntry(report, {
    date: '2026-11-12',
    className: 'Armbar only',
    gameTag: '',
    techniques: [{ id: '', name: 'Armbar', workingId: arm.id }],
    partners: '',
    drills: '',
    rolls: '',
    notes: '',
  }, 9);
  const armOnly = report.journal[1]?.id ?? '';
  report = addJournalClip(report, 'https://example.com/arm', 'Armbar clip', 10);
  const clipId = report.clips?.[0]?.id ?? '';
  report = setClipAnchor(report, clipId, { kind: 'working', id: arm.id, name: 'Armbar' }, 11);
  report = setClipJournal(report, clipId, both, 12);
  assert.equal(videosForCard(report, report.clips ?? [], [], armOnly).some((video) => video.id === clipId), true);
  assert.equal(videosForCard(report, report.clips ?? [], [], armOnly)[0]?.originHere, false);
  const kneeCard = addJournalEntry(report, {
    date: '2026-11-13',
    className: 'Knee',
    gameTag: '',
    techniques: [{ id: '', name: 'Knee cut', workingId: knee.id }],
    partners: '',
    drills: '',
    rolls: '',
    notes: '',
  }, 13);
  assert.equal(videosForCard(kneeCard, kneeCard.clips ?? [], [], kneeCard.journal.at(-1)?.id ?? '').length, 0);
});

test('journal film navigation keeps the card, date, and technique, and rejects an off-site return', () => {
  const href = journalFilmHref({
    entryId: 'card.1',
    date: '2026-11-06',
    technique: 'Waiter sweep',
    back: '/student/cards/card.1#journal-videos',
  });
  const params = new URLSearchParams(href.split('?')[1]);
  assert.deepEqual(readJournalFilmContext(params), {
    entryId: 'card.1',
    date: '2026-11-06',
    technique: 'Waiter sweep',
    back: '/student/cards/card.1#journal-videos',
  });
  assert.equal(safeStudentReturn('https://evil.example/steal'), '');
  assert.equal(safeStudentReturn('//evil.example'), '');
  assert.equal(readJournalFilmContext(new URLSearchParams('back=https://evil.example&date=nope')).back, '');
  assert.equal(journalFilmHref({ entryId: '', date: '', technique: '', back: 'https://evil.example' }), '/student/videos');
});
