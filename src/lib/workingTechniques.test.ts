import assert from 'node:assert/strict';
import test from 'node:test';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { addJournalEntry, blankStudentReport, fundamentalsBoard, isFundamentalLink, loadStudentReport, saveStudentReport } from './studentEdition.ts';
import { proficiencySummary } from './fundamentals.ts';
import { techniqueKey } from './techniqueIndex.ts';
import {
  adoptWorkingNode,
  connectWorkingNodes,
  emptyWorkingGraph,
  readWorkingGraph,
  removeWorkingNode,
  treeFrom,
  unlinkWorkingEdge,
  workingRoots,
  workingTitleKey,
} from './workingTechniques.ts';
import { addCustomFundamental } from './studentEdition.ts';

function memory() {
  const bag = new Map<string, string>();
  return {
    getItem: (key: string) => (bag.has(key) ? bag.get(key)! : null),
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
    removeItem: (key: string) => {
      bag.delete(key);
    },
  };
}

test('adding a drilled name links an existing technique instead of copying it', () => {
  const first = adoptWorkingNode(emptyWorkingGraph(), { title: 'Uchi Mata from Sprawl', now: 10, id: 'wuchi' });
  assert.equal(first.created, true);
  assert.equal(first.node.id, 'wuchi');
  const again = adoptWorkingNode(first.graph, { title: '  uchi   mata from sprawl ' });
  assert.equal(again.created, false);
  assert.equal(again.node.id, 'wuchi');
  assert.equal(again.graph.nodes.length, 1);
  const other = adoptWorkingNode(again.graph, { title: 'Uchi Mata from standing', now: 11, id: 'wstand' });
  assert.equal(other.created, true);
  assert.equal(other.graph.nodes.length, 2);
  assert.equal(workingTitleKey('Uchi Mata from Sprawl'), techniqueKey('Uchi Mata from Sprawl'));
});

test('a step points at an existing node, and a cycle renders once', () => {
  let graph = emptyWorkingGraph();
  const uchi = adoptWorkingNode(graph, { title: 'Uchi Mata from Sprawl', kind: 'technique', now: 1, id: 'wuchi' });
  graph = uchi.graph;
  const ankle = adoptWorkingNode(graph, { title: 'Step behind, ankle pick', kind: 'technique', now: 2, id: 'wankle' });
  graph = ankle.graph;
  const sprawl = adoptWorkingNode(graph, { title: 'Sprawl', kind: 'position', now: 3, id: 'wsprawl' });
  graph = sprawl.graph;
  const defended = connectWorkingNodes(graph, { fromId: 'wuchi', toId: 'wankle', relation: 'defense', label: 'defended', id: 'edef' });
  assert.equal(defended.ok, true);
  if (!defended.ok) return;
  graph = defended.graph;
  const back = connectWorkingNodes(graph, { fromId: 'wankle', toId: 'wsprawl', relation: 'follow', label: 'step behind', id: 'eback' });
  assert.equal(back.ok, true);
  if (!back.ok) return;
  graph = back.graph;
  const cycle = connectWorkingNodes(graph, { fromId: 'wsprawl', toId: 'wuchi', relation: 'branch', label: 'they stand', id: 'ecycle' });
  assert.equal(cycle.ok, true);
  if (!cycle.ok) return;
  graph = cycle.graph;
  assert.equal(graph.nodes.length, 3);
  const self = connectWorkingNodes(graph, { fromId: 'wuchi', toId: 'wuchi', relation: 'defense' });
  assert.equal(self.ok, false);
  const frame = treeFrom(graph, 'wuchi');
  assert.ok(frame);
  assert.equal(frame?.cycle, false);
  assert.equal(frame?.steps.length, 1);
  assert.equal(frame?.steps[0]?.next.node.id, 'wankle');
  const sprawlFrame = frame?.steps[0]?.next.steps[0]?.next;
  assert.equal(sprawlFrame?.node.id, 'wsprawl');
  assert.equal(sprawlFrame?.steps[0]?.next.cycle, true);
  assert.equal(sprawlFrame?.steps[0]?.next.node.id, 'wuchi');
  assert.equal(sprawlFrame?.steps[0]?.next.steps.length, 0);
  let seen = 0;
  const walk = (node: NonNullable<typeof frame>) => {
    seen += 1;
    assert.ok(seen < 8);
    if (node.cycle) return;
    for (const step of node.steps) walk(step.next);
  };
  walk(frame!);
  assert.equal(seen, 4);
});

test('unlink and delete remove the step and leave the other technique', () => {
  let graph = adoptWorkingNode(emptyWorkingGraph(), { title: 'Uchi Mata from Sprawl', id: 'wuchi', now: 1 }).graph;
  graph = adoptWorkingNode(graph, { title: 'Step behind, ankle pick', id: 'wankle', now: 2 }).graph;
  graph = adoptWorkingNode(graph, { title: 'Sprawl', kind: 'position', id: 'wsprawl', now: 3 }).graph;
  const linked = connectWorkingNodes(graph, { fromId: 'wuchi', toId: 'wankle', relation: 'defense', id: 'edef' });
  assert.equal(linked.ok, true);
  if (!linked.ok) return;
  graph = connectWorkingNodes(linked.graph, { fromId: 'wankle', toId: 'wsprawl', relation: 'follow', id: 'eback' }).ok
    ? (connectWorkingNodes(linked.graph, { fromId: 'wankle', toId: 'wsprawl', relation: 'follow', id: 'eback' }) as { graph: typeof graph }).graph
    : linked.graph;
  const unlinked = unlinkWorkingEdge(graph, 'edef');
  assert.equal(unlinked.edges.some((edge) => edge.id === 'edef'), false);
  assert.equal(unlinked.nodes.length, 3);
  const removed = removeWorkingNode(unlinked, 'wankle');
  assert.deepEqual(removed.nodes.map((node) => node.id).sort(), ['wsprawl', 'wuchi']);
  assert.equal(removed.edges.length, 0);
  assert.equal(treeFrom(removed, 'wuchi')?.steps.length, 0);
  assert.equal(workingRoots(removed).length, 2);
});

test('an older student file keeps its journal and gains no working list until one is saved', () => {
  const report = addJournalEntry(
    blankStudentReport(1),
    {
      date: '2026-11-01',
      className: 'Night class',
      gameTag: '',
      techniques: [{ id: 'free.uchi.0.1', name: 'Uchi Mata from Sprawl', note: 'Add step behind, ankle pick' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'keep this',
    },
    2,
  );
  const packet = JSON.parse(exportProgressPacket(report)) as Record<string, unknown>;
  delete packet.working;
  const parsed = parseProgressPacket(JSON.stringify(packet));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.working, undefined);
  assert.equal(parsed.value.journal[0]?.techniqueRefs[0]?.name, 'Uchi Mata from Sprawl');
  assert.equal(parsed.value.journal[0]?.techniqueRefs[0]?.workingId, undefined);
  assert.match(parsed.value.journal[0]?.body ?? '', /Add step behind, ankle pick/);
  const again = exportProgressPacket(parsed.value);
  assert.equal(again.includes('"working"'), false);
});

test('a real student file keeps the working link after reload, apart from the demo flag', () => {
  const storage = memory();
  let report = blankStudentReport(20);
  const adopted = adoptWorkingNode(emptyWorkingGraph(), { title: 'Uchi Mata from Sprawl', now: 21, id: 'wuchi' });
  report = { ...report, working: adopted.graph };
  const ankle = adoptWorkingNode(report.working!, { title: 'Step behind, ankle pick', now: 22, id: 'wankle' });
  const sprawl = adoptWorkingNode(ankle.graph, { title: 'Sprawl', kind: 'position', now: 23, id: 'wsprawl' });
  const linked = connectWorkingNodes(sprawl.graph, { fromId: 'wuchi', toId: 'wankle', relation: 'defense', label: 'defended', id: 'edef' });
  assert.equal(linked.ok, true);
  if (!linked.ok) return;
  report = { ...report, working: linked.graph };
  report = addJournalEntry(
    report,
    {
      date: '2026-11-05',
      className: 'Black belt rounds',
      gameTag: '',
      techniques: [{ id: 'free.uchi.0.m', name: 'Uchi Mata from Sprawl', note: 'Add step behind, ankle pick', workingId: 'wuchi' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: '',
    },
    24,
  );
  const saved = saveStudentReport(storage, report);
  const loaded = loadStudentReport(storage);
  assert.equal(loaded.studentId, saved.studentId);
  assert.equal(loaded.working?.nodes.find((node) => node.id === 'wuchi')?.title, 'Uchi Mata from Sprawl');
  assert.equal(loaded.journal[0]?.techniqueRefs[0]?.workingId, 'wuchi');
  assert.equal(loaded.working?.edges[0]?.toId, 'wankle');
  assert.equal(storage.getItem('advantage.studentUnlocked'), null);
});

test('putting a name on fundamentals does not mark it learned and does not replace the working node', () => {
  const before = fundamentalsBoard(blankStudentReport(1)).flatMap((category) => category.items);
  const started = proficiencySummary(before);
  const next = addCustomFundamental(blankStudentReport(1), 'movement', 'Uchi Mata from Sprawl', 30);
  const row = next.checklist.find((entry) => entry.name === 'Uchi Mata from Sprawl');
  assert.ok(row);
  assert.equal(row?.level, 0);
  assert.equal(row?.learnedOn, '');
  assert.equal(isFundamentalLink(row?.id ?? ''), true);
  const after = proficiencySummary(fundamentalsBoard(next).flatMap((category) => category.items));
  assert.equal(after.started, started.started);
  const graph = adoptWorkingNode(emptyWorkingGraph(), { title: 'Uchi Mata from Sprawl', fundamentalId: row?.id, id: 'wuchi', now: 31 });
  assert.equal(graph.graph.nodes.length, 1);
  assert.equal(graph.node.fundamentalId, row?.id);
});

test('a broken working list does not drop the journal', () => {
  const report = addJournalEntry(
    blankStudentReport(1),
    {
      date: '2026-11-02',
      className: 'Class',
      gameTag: '',
      techniques: [{ id: 'free.arm.0.1', name: 'Armbar', note: 'Finish high' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: '',
    },
    2,
  );
  const packet = JSON.parse(exportProgressPacket(report)) as Record<string, unknown>;
  packet.working = { nodes: [{ id: 'bad id', title: 'Nope' }, { id: 'wuchi', title: 'Uchi Mata from Sprawl', kind: 'technique', notes: 'keep', fundamentalId: '', createdAt: 1, updatedAt: 1 }], edges: [{ id: 'e1', fromId: 'wuchi', toId: 'missing', relation: 'defense', label: '' }] };
  const parsed = parseProgressPacket(JSON.stringify(packet));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.journal[0]?.techniqueRefs[0]?.name, 'Armbar');
  assert.equal(readWorkingGraph(parsed.value.working)?.nodes.length, 1);
  assert.equal(readWorkingGraph(parsed.value.working)?.edges.length, 0);
});
