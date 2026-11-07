import assert from 'node:assert/strict';
import test from 'node:test';
import { PARENT_GATE_KEY } from './parentGate.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { blankStudentReport, loadStudentReport, placeOnFundamentals, saveStudentReport } from './studentEdition.ts';
import {
  addChild,
  emptyTree,
  sanitizeArchive,
  setRoot,
  updateActive,
  updateNode,
  type TechniqueTreeDoc,
} from './techniqueTreeStore.ts';
import {
  applyCoachImport,
  applyWorkingImport,
  previewWorkingImport,
  readTechniqueShare,
  shareFromCoachTree,
  shareFromWorking,
  workingImportBlocked,
  writeTechniqueShare,
  TECHNIQUE_SHARE_MAX_CHARS,
} from './techniqueShare.ts';
import {
  adoptWorkingNode,
  connectWorkingNodes,
  emptyWorkingGraph,
  readWorkingGraph,
  removeWorkingNode,
  treeFrom,
  unlinkWorkingEdge,
  type WorkingGraph,
} from './workingTechniques.ts';

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

function accept(graph: WorkingGraph, text: string) {
  const before = graph;
  const read = readTechniqueShare(text);
  if (!read.ok) return { graph: before, error: read.error };
  return { graph: applyWorkingImport(before, read.file), error: '' };
}

function coachSample(): TechniqueTreeDoc {
  let doc = setRoot(emptyTree('Closed guard tree'), 'Closed guard', 'private coach note');
  const branch = addChild(doc, doc.root!.id, 'branch');
  doc = updateNode(branch.doc, branch.id!, { title: 'Triangle', notes: 'secret coach note' });
  const defense = addChild(doc, doc.root!.id, 'defense');
  doc = updateNode(defense.doc, defense.id!, { title: 'Posture and frame', notes: 'also secret' });
  return doc;
}

test('a coach tree exports to a share file and imports onto a student graph once', () => {
  const doc = coachSample();
  const text = writeTechniqueShare(shareFromCoachTree(doc));
  assert.equal(text.includes('private coach note'), false);
  assert.equal(text.includes('secret'), false);
  const read = readTechniqueShare(text);
  assert.equal(read.ok, true);
  if (!read.ok) return;
  const first = applyWorkingImport(emptyWorkingGraph(), read.file, new Map(), 50);
  assert.equal(first.nodes.length, 3);
  assert.equal(first.edges.length, 2);
  assert.equal(first.nodes.every((node) => node.notes === '' && node.fundamentalId === ''), true);
  const position = first.nodes.find((node) => node.title === 'Closed guard');
  assert.equal(position?.kind, 'position');
  const defense = first.edges.find((edge) => edge.relation === 'defense');
  assert.ok(defense);
  const second = applyWorkingImport(first, read.file, new Map(), 60);
  assert.equal(second.nodes.length, 3);
  assert.equal(second.edges.length, 2);
  assert.deepEqual(
    second.nodes.map((node) => node.id),
    first.nodes.map((node) => node.id),
  );
});

test('a student graph with a cycle exports and imports onto a coach tree without copying nodes', () => {
  let graph = emptyWorkingGraph();
  const uchi = adoptWorkingNode(graph, { title: 'Uchi Mata from Sprawl', id: 'wuchi', now: 1 });
  graph = uchi.graph;
  const ankle = adoptWorkingNode(graph, { title: 'Ankle pick', id: 'wankle', now: 2 });
  graph = ankle.graph;
  const sprawl = adoptWorkingNode(graph, { title: 'Sprawl', id: 'wsprawl', kind: 'position', now: 3 });
  graph = sprawl.graph;
  for (const input of [
    { fromId: 'wuchi', toId: 'wankle', relation: 'defense' as const, label: 'defended', id: 'edef' },
    { fromId: 'wankle', toId: 'wsprawl', relation: 'follow' as const, label: 'step behind', id: 'efollow' },
    { fromId: 'wsprawl', toId: 'wuchi', relation: 'branch' as const, label: 'back to the throw', id: 'ecycle' },
  ]) {
    const step = connectWorkingNodes(graph, input);
    assert.equal(step.ok, true);
    if (!step.ok) return;
    graph = step.graph;
  }
  graph = {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === 'wuchi' ? { ...node, notes: 'private student note' } : node)),
  };
  const text = writeTechniqueShare(shareFromWorking(graph, 'Working'));
  assert.equal(text.includes('private student note'), false);
  assert.equal(text.includes('journal'), false);
  const read = readTechniqueShare(text);
  assert.equal(read.ok, true);
  if (!read.ok) return;
  const coach = applyCoachImport(emptyTree('Imported'), read.file);
  const flat = shareFromCoachTree(coach);
  assert.equal(flat.nodes.length, 3);
  assert.equal(flat.edges.length, 3);
  assert.ok((coach.links ?? []).length >= 1);
  const saved = sanitizeArchive({ version: 2, activeId: coach.id, trees: [coach] }).archive;
  const reloaded = saved.trees[0];
  assert.equal(shareFromCoachTree(reloaded).edges.length, 3);
  const back = applyWorkingImport(emptyWorkingGraph(), shareFromCoachTree(reloaded), new Map(), 9);
  assert.equal(back.nodes.length, 3);
  assert.equal(back.edges.length, 3);
  const seen = new Set<string>();
  const walk = (frame: ReturnType<typeof treeFrom>) => {
    if (!frame || seen.has(frame.node.id)) return;
    seen.add(frame.node.id);
    if (frame.cycle) return;
    for (const step of frame.steps) walk(step.next);
  };
  walk(treeFrom(back, back.nodes[0].id));
  assert.equal(seen.size, 3);
  const again = applyCoachImport(coach, read.file);
  assert.equal(shareFromCoachTree(again).nodes.length, 3);
  assert.equal(shareFromCoachTree(again).edges.length, 3);
});

test('identity conflicts keep the local technique unless the person chooses otherwise', () => {
  const local = adoptWorkingNode(emptyWorkingGraph(), {
    title: 'Uchi Mata',
    id: 'localuchi',
    now: 4,
  }).graph;
  const titled = local.nodes.map((node) => ({ ...node, shareId: 'localuchi', notes: 'keep this note' }));
  const graph = { ...local, nodes: titled };
  const renamed = readTechniqueShare(
    writeTechniqueShare({
      kind: 'advantage-technique-share',
      version: 1,
      name: 'Coach',
      nodes: [{ shareId: 'localuchi', title: 'Uchi Mata from Sprawl', kind: 'technique' }],
      edges: [],
    }),
  );
  assert.equal(renamed.ok, true);
  if (!renamed.ok) return;
  const kept = applyWorkingImport(graph, renamed.file);
  assert.equal(kept.nodes.length, 1);
  assert.equal(kept.nodes[0].title, 'Uchi Mata');
  assert.equal(kept.nodes[0].notes, 'keep this note');
  const taken = applyWorkingImport(graph, renamed.file, new Map([['localuchi', 'take']]));
  assert.equal(taken.nodes[0].title, 'Uchi Mata from Sprawl');

  const other = readTechniqueShare(
    writeTechniqueShare({
      kind: 'advantage-technique-share',
      version: 1,
      name: 'Other',
      nodes: [{ shareId: 'otheruchi', title: 'Uchi Mata', kind: 'technique' }],
      edges: [{ shareId: 'e1', fromId: 'otheruchi', toId: 'otheruchi', relation: 'branch', label: '' }],
    }),
  );
  assert.equal(other.ok, false);
  const separate = readTechniqueShare(
    writeTechniqueShare({
      kind: 'advantage-technique-share',
      version: 1,
      name: 'Other',
      nodes: [
        { shareId: 'otheruchi', title: 'Uchi Mata', kind: 'technique' },
        { shareId: 'otherstep', title: 'Ankle pick', kind: 'technique' },
      ],
      edges: [{ shareId: 'e1', fromId: 'otheruchi', toId: 'otherstep', relation: 'defense', label: 'defended' }],
    }),
  );
  assert.equal(separate.ok, true);
  if (!separate.ok) return;
  const preview = previewWorkingImport(graph, separate.file);
  assert.equal(preview.conflicts.some((item) => item.kind === 'exact-title' && item.shareId === 'otheruchi'), true);
  const skipped = applyWorkingImport(graph, separate.file);
  assert.equal(skipped.nodes.length, 2);
  assert.equal(skipped.nodes.some((node) => node.shareId === 'otheruchi'), false);
  assert.equal(skipped.edges.length, 0);
  const used = applyWorkingImport(graph, separate.file, new Map([['otheruchi', 'use-local']]));
  assert.equal(used.nodes.length, 2);
  assert.equal(used.nodes.find((node) => node.id === 'localuchi')?.aliases?.includes('otheruchi'), true);
  assert.equal(used.edges.length, 1);
  assert.equal(used.edges[0].fromId, 'localuchi');
});

test('a bad share file does not change the graph', () => {
  const graph = adoptWorkingNode(emptyWorkingGraph(), { title: 'Sprawl', id: 'wsprawl', kind: 'position' }).graph;
  for (const text of ['{', '[]', '{"kind":"advantage-technique-share","version":9}', 'null']) {
    const result = accept(graph, text);
    assert.equal(result.graph, graph);
    assert.ok(result.error);
  }
  const unsafe = accept(
    graph,
    writeTechniqueShare({
      kind: 'advantage-technique-share',
      version: 1,
      name: 'Bad',
      nodes: [{ shareId: 'bad1', title: 'javascript:alert(1)', kind: 'technique' }],
      edges: [],
    }),
  );
  assert.equal(unsafe.graph, graph);
  const huge = accept(graph, `{"kind":"advantage-technique-share"${' '.repeat(TECHNIQUE_SHARE_MAX_CHARS)}}`);
  assert.equal(huge.graph, graph);
});

test('import does not mark fundamentals or satisfy a saved level', () => {
  const placed = placeOnFundamentals(blankStudentReport(), 'Uchi Mata', 5);
  const report = {
    ...placed.report,
    checklist: placed.report.checklist.map((row) => (row.id === placed.id ? { ...row, level: 3 as const, learnedOn: '2026-01-02' } : row)),
    working: adoptWorkingNode(emptyWorkingGraph(), { title: 'Uchi Mata', id: 'localuchi', now: 5 }).graph,
  };
  const file = readTechniqueShare(
    writeTechniqueShare({
      kind: 'advantage-technique-share',
      version: 1,
      name: 'Class',
      nodes: [{ shareId: 'newank', title: 'Ankle pick', kind: 'technique' }],
      edges: [],
    }),
  );
  assert.equal(file.ok, true);
  if (!file.ok) return;
  const next = applyWorkingImport(readWorkingGraph(report.working)!, file.file, new Map(), 8);
  assert.equal(next.nodes.find((node) => node.title === 'Ankle pick')?.fundamentalId, '');
  assert.equal(report.checklist.find((row) => row.id === placed.id)?.level, 3);
  assert.equal(report.checklist.find((row) => row.id === placed.id)?.learnedOn, '2026-01-02');
});

test('parent approval blocks a student import and a coach import keeps local-only steps', () => {
  const store = memory();
  store.setItem(PARENT_GATE_KEY, JSON.stringify({ version: 1, on: true, pinHash: 'abc', held: [], declined: [] }));
  assert.equal(workingImportBlocked(store), 'Waiting for a parent to approve.');
  assert.equal(workingImportBlocked(memory()), '');

  let doc = coachSample();
  const extra = addChild(doc, doc.root!.id, 'branch');
  doc = updateNode(extra.doc, extra.id!, { title: 'Only on this phone', notes: 'stay' });
  const file = shareFromCoachTree(doc);
  const without = {
    ...file,
    nodes: file.nodes.filter((node) => node.title !== 'Only on this phone'),
    edges: file.edges.filter((edge) => file.nodes.some((node) => node.title !== 'Only on this phone' && (node.shareId === edge.fromId || node.shareId === edge.toId))),
  };
  const imported = applyCoachImport(doc, {
    ...without,
    nodes: [...without.nodes, { shareId: 'brandnew', title: 'Gift wrap', kind: 'technique' }],
  });
  const titles = shareFromCoachTree(imported).nodes.map((node) => node.title);
  assert.ok(titles.includes('Only on this phone'));
  assert.ok(titles.includes('Gift wrap'));
  assert.equal(imported.root?.notes, 'private coach note');
});

test('unlinking or deleting stays until the person accepts the file again', () => {
  const file = shareFromCoachTree(coachSample());
  const text = writeTechniqueShare(file);
  const first = accept(emptyWorkingGraph(), text).graph;
  const unlinked = unlinkWorkingEdge(first, first.edges[0].id);
  assert.equal(unlinked.edges.length, first.edges.length - 1);
  const held = accept(unlinked, '{');
  assert.equal(held.graph, unlinked);
  assert.ok(held.error);
  const preview = previewWorkingImport(unlinked, file);
  assert.equal(preview.edges.some((edge) => edge.state === 'new'), true);
  assert.equal(unlinked.edges.length, first.edges.length - 1);
  const restored = applyWorkingImport(unlinked, file);
  assert.equal(restored.edges.length, first.edges.length);
  const removedId = restored.nodes.find((node) => node.kind === 'technique')!.id;
  const removed = removeWorkingNode(restored, removedId);
  assert.equal(removed.nodes.length, restored.nodes.length - 1);
  const refused = readTechniqueShare('not json');
  assert.equal(refused.ok, false);
  assert.equal(removed.nodes.length, restored.nodes.length - 1);
});

test('older coach archives and older student files still load, and students stay isolated', () => {
  const old = sanitizeArchive({
    version: 2,
    activeId: 'treeold',
    trees: [
      {
        id: 'treeold',
        name: 'Old',
        root: {
          id: 'n1',
          slotId: 'slotold',
          kind: 'root',
          title: 'Mount',
          notes: 'kept',
          collapsed: false,
          children: [],
        },
      },
    ],
  });
  assert.equal(old.archive.trees[0].root?.title, 'Mount');
  assert.equal(old.archive.trees[0].root?.notes, 'kept');
  assert.equal(old.archive.trees[0].links, undefined);
  const round = sanitizeArchive(updateActive(old.archive, old.archive.trees[0])).archive;
  assert.equal(round.trees[0].root?.title, 'Mount');

  const store = memory();
  const saved = saveStudentReport(store, blankStudentReport());
  const loaded = loadStudentReport(store);
  assert.equal(loaded.working, undefined);
  assert.equal(saved.journal.length, loaded.journal.length);
  const packet = parseProgressPacket(exportProgressPacket(saved));
  assert.equal(packet?.working, undefined);

  const left = memory();
  const right = memory();
  const withGraph = {
    ...blankStudentReport(),
    working: adoptWorkingNode(emptyWorkingGraph(), { title: 'Left only', id: 'wleft', now: 1 }).graph,
  };
  saveStudentReport(left, withGraph);
  saveStudentReport(right, blankStudentReport());
  assert.equal(loadStudentReport(right).working, undefined);
  assert.equal(readWorkingGraph(loadStudentReport(left).working)?.nodes[0].title, 'Left only');
});
