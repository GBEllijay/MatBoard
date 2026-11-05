import assert from 'node:assert/strict';
import test from 'node:test';
import { TECHNIQUE_TREE_STORAGE_KEY } from './techniqueTreeStore.ts';
import {
  PREVIEW_STORAGE_KEY,
  attachLesson,
  beltCoverage,
  loadPreviewState,
  logJournal,
  matchIndex,
  previewBackTarget,
  saveIndexEntry,
  savePreviewState,
  seedPreview,
} from './techniqueTreePreview.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const bag = { ...initial };
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null;
    },
    setItem(key: string, value: string) {
      bag[key] = value;
    },
  };
}

test('typing a technique name matches the shared index, exact names first', () => {
  const { entries } = seedPreview();
  const armbar = matchIndex(entries, 'armbar');
  assert.equal(armbar[0]?.name, 'Armbar');
  assert.ok(armbar.some((entry) => entry.name === 'Spinning armbar'));
  assert.ok(armbar.some((entry) => entry.name === 'Mounted armbar'));
  assert.equal(matchIndex(entries, 'arm bar')[0]?.name, 'Armbar');
  assert.equal(matchIndex(entries, '  SPINNING  ')[0]?.name, 'Spinning armbar');
  assert.equal(matchIndex(entries, 'cross collar')[0]?.name, 'Cross-collar choke');
  assert.equal(matchIndex(entries, '   ').length, 0);
  assert.equal(matchIndex(entries, 'armbar').some((entry) => entry.name === 'Americana'), false);
});

test('a new core move or variation saves under the chosen parent and position hub', () => {
  const state = seedPreview();
  const saved = saveIndexEntry(state, {
    name: 'Gift wrap armbar',
    kind: 'variation',
    positionId: 'pos-mount',
    parentId: 'core-armbar',
    id: 'var-gift',
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.entry.id, 'var-gift');
  assert.equal(saved.entry.kind, 'variation');
  assert.equal(saved.entry.parentId, 'core-armbar');
  assert.deepEqual(saved.entry.positionIds, ['pos-mount']);
  assert.equal(matchIndex(saved.state.entries, 'gift wrap')[0]?.id, 'var-gift');

  const duplicate = saveIndexEntry(saved.state, {
    name: 'gift-wrap armbar',
    kind: 'variation',
    positionId: 'pos-mount',
    parentId: 'core-armbar',
  });
  assert.deepEqual(duplicate, { ok: false, reason: 'duplicate' });

  const blank = saveIndexEntry(state, { name: '   ', kind: 'core', positionId: 'pos-mount' });
  assert.deepEqual(blank, { ok: false, reason: 'blank' });

  const orphan = saveIndexEntry(state, {
    name: 'No parent',
    kind: 'variation',
    positionId: 'pos-mount',
    parentId: null,
  });
  assert.deepEqual(orphan, { ok: false, reason: 'missing-parent' });

  const underVariation = saveIndexEntry(state, {
    name: 'Nested too far',
    kind: 'variation',
    positionId: 'pos-mount',
    parentId: 'var-armbar-spin',
  });
  assert.deepEqual(underVariation, { ok: false, reason: 'bad-parent' });

  const coreMove = saveIndexEntry(state, {
    name: 'Ezekiel choke',
    kind: 'core',
    positionId: 'pos-mount',
    id: 'core-ezekiel',
  });
  assert.equal(coreMove.ok, true);
  if (!coreMove.ok) return;
  assert.equal(coreMove.entry.kind, 'core');
  assert.equal(coreMove.entry.parentId, null);
  assert.deepEqual(coreMove.entry.positionIds, ['pos-mount']);
  assert.equal(saveIndexEntry(state, { name: 'Ezekiel', kind: 'core', positionId: 'missing' }).ok, false);
});

test('a journal line stores a 1 to 5 rating against an index id', () => {
  const state = seedPreview();
  const saved = logJournal(state, {
    studentId: 'stu-maya',
    indexId: 'core-americana',
    rating: 5,
    note: 'Clean finish from mount.',
    id: 'j-new',
    loggedAt: '2026-11-05T18:00:00.000Z',
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.line.indexId, 'core-americana');
  assert.equal(saved.line.studentId, 'stu-maya');
  assert.equal(saved.line.rating, 5);
  assert.equal(saved.state.journal.find((entry) => entry.id === 'j-new')?.rating, 5);

  for (const rating of [0, 6, 1.5, -1]) {
    const rejected = logJournal(state, { studentId: 'stu-maya', indexId: 'core-americana', rating });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.reason, 'bad-rating');
  }

  const missing = logJournal(state, { studentId: 'stu-maya', indexId: 'missing-move', rating: 3 });
  assert.deepEqual(missing, { ok: false, reason: 'unknown-index' });

  const hub = logJournal(state, { studentId: 'stu-maya', indexId: 'pos-mount', rating: 3 });
  assert.deepEqual(hub, { ok: false, reason: 'not-a-move' });

  assert.equal(logJournal(state, { studentId: 'nobody', indexId: 'core-armbar', rating: 2 }).ok, false);
});

test('belt coverage aggregates one student and leaves the missing fundamentals as gaps', () => {
  const state = seedPreview();
  const white = beltCoverage(state, 'stu-maya', 'white');
  assert.ok(white);
  assert.equal(white?.studentName, 'Maya Chen');
  assert.equal(white?.currentBelt, true);
  assert.equal(white?.logged, 3);
  assert.equal(white?.total, 6);
  const armbar = white?.rows.find((row) => row.indexId === 'core-armbar');
  assert.equal(armbar?.logged, true);
  assert.equal(armbar?.count, 2);
  assert.equal(armbar?.latest, 4);
  assert.equal(armbar?.average, 3);
  assert.equal(armbar?.onFundamentalsList, true);
  assert.deepEqual(
    white?.gaps.map((row) => row.indexId),
    ['core-cross', 'core-americana', 'core-rnc'],
  );
  assert.equal(white?.average, 8 / 3);

  const luis = beltCoverage(state, 'stu-luis', 'blue');
  assert.equal(luis?.logged, 5);
  assert.equal(luis?.gaps.map((row) => row.name).join(', '), 'Knee slice, Arm drag, Mounted armbar');
  assert.equal(beltCoverage(state, 'stu-luis', 'white')?.logged, 6);
  assert.notEqual(beltCoverage(state, 'stu-luis', 'white')?.average, white?.average);

  const added = logJournal(state, {
    studentId: 'stu-maya',
    indexId: 'core-americana',
    rating: 1,
    id: 'j-maya-americana',
    loggedAt: '2026-11-05T18:00:00.000Z',
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  const after = beltCoverage(added.state, 'stu-maya', 'white');
  assert.equal(after?.gaps.some((row) => row.indexId === 'core-americana'), false);
  assert.equal(after?.rows.find((row) => row.indexId === 'core-americana')?.latest, 1);
  assert.equal(after?.logged, 4);
  assert.equal(beltCoverage(state, 'stu-priya', 'purple')?.gaps.map((row) => row.name).join(', '), 'Underhook knee slice');
});

test('lesson attach, journal, and belt coverage share one index id', () => {
  const seeded = seedPreview();
  const created = saveIndexEntry(seeded, {
    name: 'Gift wrap',
    kind: 'core',
    positionId: 'pos-mount',
    id: 'core-gift',
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const attached = attachLesson(created.state, {
    indexId: created.entry.id,
    fundamentals: true,
    id: 'lesson-gift',
    addedAt: '2026-11-05T16:00:00.000Z',
  });
  assert.equal(attached.ok, true);
  if (!attached.ok) return;
  assert.equal(attached.line.indexId, 'core-gift');
  assert.equal(attached.line.fundamentals, true);

  const again = attachLesson(attached.state, { indexId: 'core-gift', fundamentals: false });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.state.lessons.filter((lesson) => lesson.indexId === 'core-gift').length, 1);
  assert.equal(again.line.fundamentals, false);

  const logged = logJournal(again.state, {
    studentId: 'stu-maya',
    indexId: attached.line.indexId,
    rating: 4,
    id: 'j-gift',
  });
  assert.equal(logged.ok, true);
  if (!logged.ok) return;
  assert.equal(logged.line.indexId, attached.line.indexId);
  assert.equal(attachLesson(seeded, { indexId: 'pos-mount', fundamentals: true }).ok, false);
});

test('preview storage stays off the live technique tree key and a broken store falls back to the sample', () => {
  assert.notEqual(PREVIEW_STORAGE_KEY, TECHNIQUE_TREE_STORAGE_KEY);
  const storage = memoryStorage({ [TECHNIQUE_TREE_STORAGE_KEY]: '{"keep":true}' });
  assert.equal(savePreviewState(storage, seedPreview()), true);
  assert.equal(storage.getItem(TECHNIQUE_TREE_STORAGE_KEY), '{"keep":true}');
  const loaded = loadPreviewState(storage);
  assert.equal(loaded.students[0]?.name, 'Maya Chen');
  assert.equal(loaded.journal.some((entry) => entry.id === 'j-maya-arm-2'), true);

  const broken = memoryStorage({ [PREVIEW_STORAGE_KEY]: '{oops' });
  assert.equal(loadPreviewState(broken).entries.length, seedPreview().entries.length);
  assert.equal(previewBackTarget(null), '/products');
  assert.equal(previewBackTarget('tools'), '/coaching-tools');
  assert.equal(previewBackTarget('unlimited'), '/coach-unlimited');
});
