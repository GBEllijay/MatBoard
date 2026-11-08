import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { JournalEntry, WorkingNode } from '../../lib/progress/types.ts';
import { addMemoryClip, copyFromReport, emptyCloud, previewCopyFromText, sampleCloud, techniquesForCard } from './model.ts';
import {
  addPreviewTechnique,
  baselineRequirements,
  brownRequirements,
  graphHasCycle,
  legLockChain,
  suggestedCloud,
  suggestedGraph,
  suggestedItems,
} from './suggestedRequirements.ts';

function node(id: string, title: string): WorkingNode {
  return { id, title, notes: 'Keep this note', kind: 'technique', fundamentalId: '', createdAt: 1, updatedAt: 1 };
}

function card(id: string, techniqueId: string, title: string): JournalEntry {
  return {
    id,
    date: '2026-02-02',
    gameTag: '',
    body: `Class: Gi\n${title}`,
    techniqueRefs: [{ id: techniqueId, name: title }],
    amendments: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

test('a preview copy reads techniques without changing the report or marking them learned', () => {
  const report = {
    working: { nodes: [node('hip.bump', 'Hip bump')], edges: [] },
    journal: [card('card-1', 'hip.bump', 'Hip bump')],
    clips: [
      {
        id: 'clip-1',
        url: 'https://example.test/clip',
        description: 'Class clip',
        note: '',
        createdAt: 1,
        updatedAt: 1,
        techniqueAnchor: { kind: 'working' as const, id: 'hip.bump', name: 'Hip bump' },
        journalEntryId: 'card-1',
      },
    ],
  };
  const before = JSON.stringify(report);
  const copy = copyFromReport(report);
  assert.equal(JSON.stringify(report), before);
  assert.equal(copy.source, 'preview-copy');
  assert.equal(copy.techniques[0]?.notes, 'Keep this note');
  assert.equal(copy.techniques[0]?.classOrigin, '2026-02-02 · Gi');
  assert.equal(copy.techniques[0]?.videos[0]?.title, 'Class clip');
  assert.deepEqual(techniquesForCard(copy, 'card-1').map((item) => item.id), ['hip.bump']);
  assert.equal(JSON.stringify(copy).includes('learned'), false);
  assert.equal(emptyCloud().techniques.length, 0);
  assert.equal(sampleCloud().note.includes('Sample only'), true);
  assert.equal(previewCopyFromText(null).note, 'No student file on this phone.');
  assert.equal(previewCopyFromText('{').note, 'This preview left the student file unread.');
});

test('memory clips stay in the list that was passed in', () => {
  const first = addMemoryClip([], 'film', 'Filmed move');
  assert.equal(first[0]?.source, 'film');
  const next = addMemoryClip(first, 'gallery', 'Gallery pick');
  assert.equal(first.length, 1);
  assert.equal(next.length, 2);
});

test('the suggested cloud autoloads eighteen requirement nodes, cycles, and one shared graph', () => {
  const baseline = baselineRequirements();
  assert.equal(baseline.length, 18);
  assert.deepEqual(
    baseline.map((row) => row.title),
    [
      'Closed guard',
      'Side control',
      'Mount',
      'Back control',
      'Escape back control',
      'Recover guard from side control',
      'Scissor sweep',
      'Hold mount, side control, and back',
      'Submission from mount',
      'Mount and side control with connected finishes',
      'Take, keep, and finish the back against resistance',
      'Pendulum sweep',
      'Technical mount and mount transitions',
      'Deep half guard',
      'S-mount armbar',
      'X-guard',
      'Knee bar',
      '50/50',
    ],
  );
  const graph = suggestedGraph();
  for (const row of baseline) {
    assert.equal(graph.nodes.filter((node) => node.id === row.key).length, 1, row.title);
  }
  assert.deepEqual(
    brownRequirements().map((row) => row.key),
    ['req.x-guard', 'req.kneebar', 'req.fifty-fifty'],
  );
  const titles = suggestedItems().map((row) => row.title);
  for (const name of ['Breakfalls', 'Shrimp', 'Bridge', 'Technical lift/stand-up', 'Sprawl', 'Situp sweep']) {
    assert.equal(titles.includes(name), false, name);
  }
  assert.equal(new Set(['Armbar', 'Armbar from the guard', 'Armbar from back'].filter((name) => titles.includes(name))).size, 3);
  const cloud = suggestedCloud();
  assert.equal(cloud.source, 'suggested');
  assert.equal(JSON.stringify(cloud).includes('"learned":true'), false);
  for (const id of ['pos.back-control', 'req.x-guard', 'req.kneebar']) {
    assert.equal(graph.nodes.filter((node) => node.id === id).length, 1);
    assert.equal(cloud.techniques.filter((node) => node.id === id).length, 1);
  }
  const pairs = graph.edges.map((edge) => `${edge.fromId}->${edge.toId}`);
  const present = (from: string, to: string) => pairs.includes(`${from}->${to}`);
  for (const [from, to] of legLockChain()) assert.equal(present(from, to), true, `${from}->${to}`);
  for (const [from, to] of [
    ['req.fifty-fifty', 'req.kneebar'],
    ['req.kneebar', 'req.x-guard'],
    ['req.x-guard', 'req.kneebar'],
    ['req.x-guard', 'req.elevator-sweep'],
    ['req.elevator-sweep', 'pos.back-control'],
    ['pos.back-control', 'sub.rear-naked-choke'],
    ['pos.back-control', 'req.double-lapel'],
    ['pos.back-control', 'req.armbar-back'],
    ['pos.back-control', 'escape.back'],
    ['pos.closed-guard', 'sweep.scissor'],
    ['sweep.scissor', 'pos.mount'],
    ['pos.mount', 'req.hold-positions'],
    ['req.hold-positions', 'pos.mount'],
    ['req.hold-positions', 'pos.side-control'],
    ['req.hold-positions', 'pos.back-control'],
    ['pos.side-control', 'req.recover-guard-side'],
    ['pos.mount', 'sub.americana'],
    ['pos.mount', 'req.armbar'],
    ['pos.mount', 'req.cross-collar'],
    ['pos.mount', 'req.maintain-mount'],
    ['req.maintain-mount', 'req.submission-mount'],
    ['req.submission-mount', 'sub.americana'],
    ['pos.side-control', 'req.maintain-side'],
    ['req.maintain-side', 'req.submit-side'],
    ['req.submit-side', 'req.mount-side-finishes'],
    ['req.submission-mount', 'req.mount-side-finishes'],
    ['pos.back-control', 'req.maintain-back'],
    ['req.maintain-back', 'req.submit-back'],
    ['req.submit-back', 'req.back-finish'],
    ['req.back-finish', 'sub.rear-naked-choke'],
    ['req.back-finish', 'req.armbar-back'],
    ['req.back-finish', 'req.collar-choke'],
    ['sweep.pendulum', 'req.armbar'],
    ['sweep.pendulum', 'pos.mount'],
    ['sweep.pendulum', 'req.armbar-guard'],
    ['pos.mount', 'req.technical-mount'],
    ['req.technical-mount', 'req.maintain-mount'],
    ['req.deep-half', 'req.x-guard'],
    ['req.deep-half', 'req.kneebar'],
    ['pos.mount', 'req.s-mount-armbar'],
  ]) {
    assert.equal(present(from, to), true, `${from}->${to}`);
  }
  assert.equal(present('req.kneebar', 'req.toe-hold'), false);
  assert.equal(present('req.kneebar', 'req.heel-hook'), false);
  assert.equal(present('req.calf-slicer', 'req.heel-hook'), false);
  assert.equal(present('req.armbar', 'req.armbar-guard'), false);
  assert.equal(present('req.armbar', 'req.armbar-back'), false);
  assert.equal(graphHasCycle(graph), true);
  const extensionIds = suggestedItems().filter((row) => row.role === 'extension').map((row) => row.id);
  assert.equal(baseline.some((row) => extensionIds.includes(row.key)), false);
  const before = JSON.stringify(graph);
  const added = addPreviewTechnique(graph, { title: 'Custom goal', parentId: 'req.kneebar' });
  assert.equal(JSON.stringify(graph), before);
  assert.equal(added.edges.some((edge) => edge.fromId === 'req.kneebar' && edge.toId === 'req.toe-hold'), false);
  assert.equal(added.nodes.some((node) => node.notes.includes('Not marked learned')), true);
});

test('the preview pages do not write a student file', () => {
  const cloud = readFileSync(new URL('./TechniqueCloudPreview.tsx', import.meta.url), 'utf8');
  const library = readFileSync(new URL('./VideoLibraryPreview.tsx', import.meta.url), 'utf8');
  for (const source of [cloud, library]) {
    assert.equal(source.includes('setItem'), false);
    assert.equal(source.includes('removeItem'), false);
    assert.equal(source.includes('saveStudentReport'), false);
  }
  assert.match(cloud, /getItem/);
  assert.match(cloud, /suggestedCloud\(\)/);
});
