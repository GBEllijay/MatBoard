import assert from 'node:assert/strict';
import test from 'node:test';
import { exportProgressPacket, mergeStudentProgress, parseProgressPacket } from './progress/format.ts';
import { blankStudentReport } from './studentEdition.ts';
import { mergeStudentReports } from './studentBackup.ts';
import { normalizeStoredRank, setRankLineage, setTeachingLineage } from './studentRank.ts';
import {
  addHeadTree,
  chainNames,
  confirmSuggestion,
  declineSuggestion,
  renameTeacher,
  setTeachingVisible,
  suggestionForTree,
  teachingChain,
  teachingFromLineage,
  unknownContinuation,
  TEACHING_SUGGESTIONS,
  type TeachingSuggestion,
} from './teachingLineage.ts';

const fabio = TEACHING_SUGGESTIONS[0]!;
const romero = TEACHING_SUGGESTIONS[1]!;

function line(head: string, upward: string[] = []) {
  return { ...teachingFromLineage([head, ...upward]).trees[0]!, headName: head, upward };
}

test('a known name offers one next teacher, and an unknown name stops', () => {
  assert.equal(suggestionForTree(line('Fábio Gurgel'))?.id, 'fabio-to-romero');
  assert.equal(suggestionForTree(line('fabio gurgel'))?.nextTeacher, "Romero 'Jacaré' Cavalcanti");
  assert.equal(suggestionForTree(line('Gurgel')), null);
  assert.equal(suggestionForTree(line('Jacaré')), null);
  assert.equal(unknownContinuation(line('Coach Lane')), true);
  assert.equal(suggestionForTree(line('Romero Jacare Cavalcanti'))?.id, 'romero-to-rolls');
  assert.equal(suggestionForTree(line('Rolls Gracie')), null);
  assert.equal(TEACHING_SUGGESTIONS.some((item) => /maeda|carlos gracie sr/i.test(item.nextTeacher)), false);
});

test('confirm adds the suggested teacher, and cancel leaves the names', () => {
  const start = line('Fábio Gurgel', ['My Coach']);
  assert.equal(suggestionForTree(start), null);
  assert.deepEqual(chainNames(confirmSuggestion(start, fabio)), ['Fábio Gurgel', 'My Coach']);
  const open = line('Fábio Gurgel');
  const added = confirmSuggestion(open, fabio);
  assert.deepEqual(chainNames(added), ['Fábio Gurgel', "Romero 'Jacaré' Cavalcanti"]);
  const declined = declineSuggestion(open, fabio);
  assert.deepEqual(chainNames(declined), ['Fábio Gurgel']);
  assert.equal(suggestionForTree(declined), null);
  const renamed = renameTeacher(added, 1, 'Someone else');
  assert.equal(renamed.confirmed.includes(1), false);
  assert.equal(renamed.upward[0], 'Someone else');
});

test('hiding lineage keeps the trees, and a second head instructor is another line', () => {
  const visible = addHeadTree(teachingFromLineage(['Coach Ana', 'Professor Luis']));
  visible.trees[1] = { ...visible.trees[1]!, headName: 'Coach Ellis', stillTraining: true, startedOn: '2024-01-02' };
  const hidden = setTeachingVisible(visible, false);
  assert.equal(hidden.visible, false);
  assert.equal(hidden.trees[0]?.headName, 'Coach Ana');
  assert.deepEqual(hidden.trees[0]?.upward, ['Professor Luis']);
  assert.equal(teachingChain(hidden.trees[1]!), 'You → Coach Ellis');
  const shown = setTeachingVisible(hidden, true);
  assert.equal(shown.trees[1]?.startedOn, '2024-01-02');
});

test('teaching lines survive a backup and a merge does not replace them', () => {
  const saved = setTeachingLineage(
    blankStudentReport(4),
    setTeachingVisible(teachingFromLineage(['Fábio Gurgel']), false),
    5,
  );
  const parsed = parseProgressPacket(exportProgressPacket(saved));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.rank?.teaching?.visible, false);
  assert.equal(parsed.value.rank?.teaching?.trees[0]?.headName, 'Fábio Gurgel');
  assert.deepEqual(parsed.value.rank?.lineage, ['Fábio Gurgel']);
  const other = setTeachingLineage(blankStudentReport(4), teachingFromLineage(['Someone else']), 6);
  const merged = mergeStudentProgress(saved, other);
  assert.equal(merged.report.rank?.teaching?.trees[0]?.headName, 'Fábio Gurgel');
  assert.ok(merged.conflicts.some((line) => line.includes('Teaching lineage was kept')));
  const normalized = normalizeStoredRank(saved.rank);
  assert.equal(normalized.teaching?.trees[0]?.headName, 'Fábio Gurgel');
  const newerKept = mergeStudentReports(saved, { ...other, updatedAt: 1 });
  assert.equal(newerKept.rank?.teaching?.trees[0]?.headName, 'Fábio Gurgel');
});

test('an older lineage list still imports as one straight line', () => {
  const report = setRankLineage(blankStudentReport(8), ['Coach Ana', 'Professor Luis'], 9);
  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value.rank?.lineage, ['Coach Ana', 'Professor Luis']);
  assert.equal(parsed.value.rank?.teaching, undefined);
  const viewed = teachingFromLineage(parsed.value.rank?.lineage ?? []);
  assert.equal(viewed.trees[0]?.headName, 'Coach Ana');
  assert.deepEqual(viewed.trees[0]?.upward, ['Professor Luis']);
});

void (null as TeachingSuggestion | null);
