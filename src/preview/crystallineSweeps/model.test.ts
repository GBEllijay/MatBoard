import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { APPROVED_FUNDAMENTALS, AXES, SHEET_AXIS_IDS } from '../assessmentRadar/model.ts';
import { FUNDAMENTALS_CATALOG } from '../../lib/progress/catalog.ts';
import {
  ASSESSMENT_STORAGE_KEY,
  emptyAssessments,
  saveAssessment,
  writeAssessments,
  type AssessmentScores,
} from '../../lib/studentAssessment.ts';
import { addJournalEntry, blankStudentReport, saveStudentReport, setFundamentalLevel, STUDENT_EDITION_STORAGE_KEY } from '../../lib/studentEdition.ts';
import { techniqueNodePath } from '../../lib/gamePlan.ts';
import { TECHNIQUE_TREE_STORAGE_KEY } from '../../lib/techniqueTreeStore.ts';
import { adoptWorkingNode, connectWorkingNodes, emptyWorkingGraph } from '../../lib/workingTechniques.ts';
import {
  CRYSTAL_PREVIEW_PATH,
  EXAMPLE_RELIEF,
  IGNORED_PREVIEW_TREE_KEY,
  readSweepsProof,
  tileRelief,
  withStudent,
} from './adapter.ts';
import {
  HEIGHT_RATIO,
  buildSweepLayout,
  buildTileMesh,
  centroidOf,
  distance,
  facetCurve,
  fitEnvelope,
  heightCap,
  tileVertices,
} from './geometry.ts';
import { FIT_PAD, VIEW_SIZE, defaultCamera, labelTier, projectLayout } from './project.ts';
import { TOPO_H, TOPO_LEVEL, buildTopo, demoLevel } from './topo.ts';
import { EXAMPLE_OPPONENT_FACTORS, EXAMPLE_OPPONENT_SWEEPS, EXAMPLE_SELF_FACTORS, EXAMPLE_SELF_SWEEPS, exampleCompare, factorComparisons } from './overlay.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    snapshot() {
      return JSON.stringify([...store.entries()].sort(([a], [b]) => a.localeCompare(b)));
    },
  };
}

function seven(passing = 5): AssessmentScores {
  return {
    guard: 3,
    passing,
    takedowns: 4,
    escapes: 2,
    submissions: 4,
    conditioning: 2,
    mindset: 3,
  };
}

const SWEEP_IDS = [
  'sweep.scissor',
  'sweep.hip-bump',
  'sweep.pendulum',
  'sweep.flower',
  'sweep.tripod',
  'sweep.butterfly',
] as const;

test('catalog ids are unique and the Sweeps factor map is the six real moves', () => {
  const ids = FUNDAMENTALS_CATALOG.categories.flatMap((category) => category.items.map((item) => item.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 47);
  const sweeps = FUNDAMENTALS_CATALOG.categories.find((category) => category.id === 'sweeps');
  assert.deepEqual(sweeps?.items.map((item) => item.id), [...SWEEP_IDS]);
  const mapped = APPROVED_FUNDAMENTALS.filter((row) => row.axis === 'sweeps').map((row) => row.id);
  assert.deepEqual(mapped, [...SWEEP_IDS]);
  assert.equal(AXES.find((axis) => axis.id === 'sweeps')?.meaning.includes('Sit-up sweep'), true);
});

test('layout is deterministic, shared, and has no extra move', () => {
  const first = buildSweepLayout(SWEEP_IDS);
  const second = buildSweepLayout(SWEEP_IDS);
  assert.equal(first.revision, 'sweeps-hex-r1');
  assert.deepEqual(first, second);
  assert.equal(first.tiles.length, 6);
  assert.equal(first.vertices.length, 7);
  assert.deepEqual(
    first.tiles.map((tile) => tile.id),
    [...SWEEP_IDS],
  );
  const shared = first.tiles[0].vertexIndices.filter((index) => first.tiles[1].vertexIndices.includes(index));
  assert.deepEqual(shared, [2, 0]);
  const center = first.vertices[0];
  for (const tile of first.tiles) {
    assert.equal(tileVertices(first, tile.vertexIndices)[2], center);
  }
});

test('apex offsets keep the boundary fixed and separate an empty score from flat 3', () => {
  const layout = buildSweepLayout(SWEEP_IDS);
  const cap = heightCap(layout);
  const boundary = tileVertices(layout, layout.tiles[0].vertexIndices);
  const base = Math.max(...boundary.map((point) => distance(centroidOf(boundary), point)));
  assert.equal(cap, base * HEIGHT_RATIO);
  assert.ok(cap < base);
  const sunk = buildTileMesh(layout, 'sweep.scissor', 1);
  const shallow = buildTileMesh(layout, 'sweep.scissor', 2);
  const flat = buildTileMesh(layout, 'sweep.scissor', 3);
  const raised = buildTileMesh(layout, 'sweep.scissor', 4);
  const tall = buildTileMesh(layout, 'sweep.scissor', 5);
  const empty = buildTileMesh(layout, 'sweep.scissor', null);
  assert.ok(sunk && shallow && flat && raised && tall && empty);
  assert.deepEqual(sunk.boundary, tall.boundary);
  assert.equal(sunk.boundary[0], layout.vertices[layout.tiles[0].vertexIndices[0]]);
  assert.equal(sunk.apex && tall.apex && sunk.apex.z, -cap);
  assert.equal(shallow.apex?.z, -cap / 2);
  assert.equal(flat.apex?.z, 0);
  assert.equal(raised.apex?.z, cap / 2);
  assert.equal(tall.apex?.z, cap);
  assert.ok(sunk.apex && shallow.apex && flat.apex && raised.apex && tall.apex);
  assert.ok(sunk.apex.z < shallow.apex.z && shallow.apex.z < flat.apex.z && flat.apex.z < raised.apex.z && raised.apex.z < tall.apex.z);
  assert.equal(empty.apex, null);
  assert.equal(empty.height, null);
  assert.equal(empty.facets, null);
  assert.equal(flat.facets?.length, 3);
  assert.ok(flat.facets?.every((facet) => facet.corners.every((corner) => corner.z === 0)));
  const neighbor = buildTileMesh(layout, 'sweep.hip-bump', 1);
  assert.equal(sunk.boundary[1], neighbor?.boundary[0]);
});

test('curved relief bows edges and leaves the apex and boundary where they are', () => {
  const layout = buildSweepLayout(SWEEP_IDS);
  const tall = buildTileMesh(layout, 'sweep.tripod', 5);
  const flat = buildTileMesh(layout, 'sweep.pendulum', 3);
  assert.ok(tall?.facets && flat?.facets);
  const before = tall.facets[0].corners.map((point) => ({ ...point }));
  const curve = facetCurve(tall.facets[0]);
  assert.deepEqual(tall.facets[0].corners, before);
  assert.equal(curve.base[0], tall.facets[0].corners[0]);
  assert.equal(curve.base[1], tall.facets[0].corners[1]);
  assert.equal(curve.toApex[0].to, tall.facets[0].corners[2]);
  assert.ok(Math.abs(curve.toApex[0].control.z) < Math.abs(tall.facets[0].corners[2].z));
  assert.ok(curve.toApex[0].control.z !== 0);
  const flatCurve = facetCurve(flat.facets[0]);
  assert.equal(flatCurve.toApex[0].control.z, 0);
  assert.equal(flatCurve.toApex[0].control.x, (flat.facets[0].corners[1].x + flat.facets[0].corners[2].x) / 2);
});

test('the face fits inside the pad at zoom 1, and names wait for zoom', () => {
  const layout = buildSweepLayout(SWEEP_IDS);
  const camera = defaultCamera();
  const { place } = projectLayout(layout, camera);
  for (const point of fitEnvelope(layout)) {
    const placed = place(point);
    assert.ok(placed.x >= FIT_PAD - 0.05 && placed.x <= VIEW_SIZE - FIT_PAD + 0.05);
    assert.ok(placed.y >= FIT_PAD - 0.05 && placed.y <= VIEW_SIZE - FIT_PAD + 0.05);
  }
  assert.equal(labelTier(1), 'none');
  assert.equal(labelTier(1.6), 'short');
  assert.equal(labelTier(2.2), 'full');
  const start = performance.now();
  for (let i = 0; i < 2000; i += 1) projectLayout(layout, camera);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 500, `projection took ${elapsed}ms`);
});

test('saved scores stay on their own records and a missing Sweeps factor is not copied', () => {
  const store = memory();
  let report = blankStudentReport(10);
  report = setFundamentalLevel(report, { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' }, 1, 11, {
    note: 'Knee across.',
  });
  report = setFundamentalLevel(report, { catalogItemId: 'sweep.hip-bump', categoryId: 'sweeps', name: 'Hip bump sweep' }, 0, 12);
  report = setFundamentalLevel(report, { catalogItemId: 'sweep.pendulum', categoryId: 'sweeps', name: 'Pendulum sweep' }, 3, 13);
  const position = adoptWorkingNode(emptyWorkingGraph(), { title: 'Closed guard', id: 'work-guard', now: 14 });
  const hip = adoptWorkingNode(position.graph, {
    title: 'Hip bump sweep',
    id: 'work-hip',
    fundamentalId: 'sweep.hip-bump',
    now: 15,
  });
  const joined = connectWorkingNodes(hip.graph, { fromId: 'work-guard', toId: 'work-hip', relation: 'branch', id: 'edge-hip', now: 16 });
  assert.equal(joined.ok, true);
  if (joined.ok) {
    report = {
      ...report,
      working: {
        ...joined.graph,
        nodes: joined.graph.nodes.map((node) => (node.id === 'work-hip' ? { ...node, notes: 'Post the hand.' } : node)),
      },
    };
  }
  report = addJournalEntry(
    report,
    {
      date: '2026-11-02',
      className: 'Night',
      gameTag: '',
      techniques: [{ id: 'sweep.flower', name: 'Flower sweep', note: 'Under the hook.' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: '',
    },
    17,
  );
  saveStudentReport(store, report);
  writeAssessments(store, saveAssessment(emptyAssessments(), { date: '2026-11-01', note: 'seven', scores: seven(5) }, 18));
  store.setItem(
    TECHNIQUE_TREE_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      activeId: 'tree-sweeps',
      trees: [
        {
          id: 'tree-sweeps',
          name: 'Guard',
          root: {
            id: 'node-closed',
            slotId: 'slot-closed',
            kind: 'root',
            title: 'Closed guard',
            notes: '',
            collapsed: false,
            children: [
              {
                id: 'node-scissor',
                slotId: 'slot-scissor',
                kind: 'branch',
                title: 'Scissor sweep',
                notes: 'Angle out.',
                collapsed: false,
                children: [],
              },
            ],
          },
        },
      ],
    }),
  );
  store.setItem(IGNORED_PREVIEW_TREE_KEY, '{"entries":[{"id":"fake","name":"Scissor sweep","parentId":"made-up"}]}');
  const before = store.snapshot();
  const asked: string[] = [];
  const proof = readSweepsProof({
    getItem(key: string) {
      asked.push(key);
      return store.getItem(key);
    },
  });
  assert.equal(store.snapshot(), before);
  assert.equal(asked.includes(IGNORED_PREVIEW_TREE_KEY), false);
  assert.equal(proof.catalogItemCount, 47);
  assert.equal(proof.faces.length, 8);
  assert.deepEqual(proof.faces.map((face) => face.id), [...SHEET_AXIS_IDS]);
  assert.equal(proof.faces.find((face) => face.id === 'sweeps')?.index.length, 6);
  assert.equal(proof.faces.find((face) => face.id === 'conditioning')?.index.length, 0);
  assert.equal(proof.faces.every((face) => face.index.every((item) => item.name)), true);
  assert.equal(proof.sweepsMapped, 6);
  assert.equal(proof.about, AXES.find((axis) => axis.id === 'sweeps')?.meaning);
  assert.equal(proof.factor.value, null);
  assert.equal(proof.factor.fieldPresent, false);
  assert.match(proof.factor.detail, /no Sweeps field/);
  const byId = new Map(proof.moves.map((move) => [move.id, move]));
  assert.equal(byId.get('sweep.scissor')?.score, 1);
  assert.equal(byId.get('sweep.hip-bump')?.score, null);
  assert.equal(byId.get('sweep.pendulum')?.score, 3);
  assert.equal(byId.get('sweep.flower')?.score, null);
  assert.equal(byId.get('sweep.butterfly')?.score, null);
  assert.equal(byId.get('sweep.scissor')?.checklistNote, 'Knee across.');
  assert.equal(byId.get('sweep.hip-bump')?.checklistNote, '');
  assert.deepEqual(byId.get('sweep.pendulum')?.variations, []);
  assert.equal(byId.get('sweep.scissor')?.coachNodes[0]?.href, techniqueNodePath('tree-sweeps', 'node-scissor'));
  assert.deepEqual(byId.get('sweep.scissor')?.coachNodes[0]?.ancestors, ['Closed guard']);
  assert.deepEqual(byId.get('sweep.scissor')?.coachNodes[0]?.children, []);
  assert.equal(byId.get('sweep.scissor')?.coachNodes[0]?.notes, 'Angle out.');
  assert.equal(byId.get('sweep.butterfly')?.coachNodes.length, 0);
  assert.equal(byId.get('sweep.hip-bump')?.workingNodes[0]?.href, '/student/working?view=tree&node=work-hip');
  assert.equal(byId.get('sweep.hip-bump')?.workingNodes[0]?.links[0]?.relation, 'branch');
  assert.equal(byId.get('sweep.hip-bump')?.workingNodes[0]?.notes, 'Post the hand.');
  assert.equal(byId.get('sweep.flower')?.cards.length, 1);
  assert.match(byId.get('sweep.flower')?.cards[0]?.href ?? '', /^\/student\/cards\//);
  assert.equal(byId.get('sweep.flower')?.cards[0]?.note, 'Under the hook.');
  assert.equal(proof.categoryNodes.length, 0);
  assert.equal(tileRelief('example', { id: 'sweep.scissor', score: 1 }), 1);
  assert.equal(tileRelief('example', { id: 'sweep.butterfly', score: 5 }), null);
  assert.equal(tileRelief('saved', { id: 'sweep.butterfly', score: null }), null);
  assert.notEqual(tileRelief('saved', { id: 'sweep.scissor', score: 1 }), proof.factor.value);

  writeAssessments(
    store,
    saveAssessment(emptyAssessments(), { date: '2026-11-03', note: 'eight', scores: { ...seven(5), sweeps: 1 } }, 19),
  );
  const eight = readSweepsProof(store);
  assert.equal(eight.factor.value, 1);
  assert.equal(eight.factor.fieldPresent, true);
  assert.equal(eight.moves.find((move) => move.id === 'sweep.butterfly')?.score, null);
  assert.equal(eight.moves.find((move) => move.id === 'sweep.pendulum')?.score, 3);
  assert.equal(eight.moves.find((move) => move.id === 'sweep.scissor')?.score, 1);
  assert.equal(eight.moves.find((move) => move.id === 'sweep.scissor')?.scoreSource, 'checklist-level');
});

test('topography uses the live map and keeps demo heights off the factor score', () => {
  const demo = buildTopo(demoLevel);
  assert.equal(demo.matchesCitedLists, true);
  assert.equal(demo.faces.length, 8);
  assert.deepEqual(
    demo.faces.map((face) => face.moves.length),
    [11, 4, 6, 4, 6, 10, 0, 0],
  );
  assert.deepEqual(
    demo.unmapped.map((item) => item.id),
    ['pos.standing', 'move.breakfalls', 'move.shrimp', 'move.bridge', 'move.technical-standup', 'def.sprawl'],
  );
  assert.equal(demo.faces[2].id, 'sweeps');
  const sweepTiles = demo.tiles.filter((tile) => tile.faceId === 'sweeps');
  assert.ok(sweepTiles.length > 6);
  assert.equal(sweepTiles.filter((tile) => tile.move).length, 6);
  assert.ok(sweepTiles.some((tile) => tile.move == null && tile.apex == null));
  const shared = sweepTiles[0].tri[1];
  assert.ok(sweepTiles.some((tile, index) => index > 0 && tile.tri.includes(shared)));
  assert.equal(TOPO_LEVEL[1], -TOPO_H);
  assert.equal(TOPO_LEVEL[3], 0);
  assert.equal(TOPO_LEVEL[5], TOPO_H);
  assert.equal(demoLevel('sweep.scissor'), demoLevel('sweep.scissor'));
  const saved = buildTopo((id) => (id === 'sweep.pendulum' ? 3 : null));
  const pendulum = saved.tiles.find((tile) => tile.move?.id === 'sweep.pendulum');
  const scissor = saved.tiles.find((tile) => tile.move?.id === 'sweep.scissor');
  assert.equal(pendulum?.offset, 0);
  assert.ok(pendulum?.apex);
  assert.equal(scissor?.offset, null);
  assert.equal(scissor?.apex, null);
});

test('example overlay scores differ on every factor and on the six Sweeps moves', () => {
  const rows = factorComparisons();
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map((row) => row.id), [
    'guard-control',
    'passing',
    'sweeps',
    'takedowns',
    'escapes-defense',
    'submissions',
    'conditioning',
    'mindset',
  ]);
  for (const row of rows) {
    assert.notEqual(row.self, row.opponent);
    assert.equal(row.note, exampleCompare(row.self, row.opponent));
    assert.equal(row.note.includes('prediction'), false);
  }
  assert.equal(EXAMPLE_SELF_FACTORS.sweeps, 4);
  assert.equal(EXAMPLE_OPPONENT_FACTORS.sweeps, 1);
  const ids = Object.keys(EXAMPLE_SELF_SWEEPS);
  assert.deepEqual(ids, [...SWEEP_IDS]);
  assert.equal(ids.length, 6);
  for (const id of ids) {
    const self = EXAMPLE_SELF_SWEEPS[id as keyof typeof EXAMPLE_SELF_SWEEPS];
    const opponent = EXAMPLE_OPPONENT_SWEEPS[id as keyof typeof EXAMPLE_OPPONENT_SWEEPS];
    assert.notEqual(self, opponent);
    assert.ok(self >= 1 && self <= 5 && opponent >= 1 && opponent <= 5);
  }
  assert.equal(exampleCompare(3, 3), 'Same example score');
  assert.equal(exampleCompare(5, 1), 'Example self is higher');
  assert.equal(exampleCompare(1, 4), 'Example opponent is higher');
});

test('student links keep student=1 and the coach tree link does not', () => {
  assert.equal(withStudent('/student/fundamentals', ''), '/student/fundamentals');
  assert.equal(withStudent('/student/working?view=tree&node=work-hip', '?student=1'), '/student/working?view=tree&node=work-hip&student=1');
  assert.equal(techniqueNodePath('tree a', 'node b'), '/technique-tree?tree=tree+a&node=node+b');
});

test('the preview modules do not write records and the route stays outside the coach gate', () => {
  for (const name of ['adapter.ts', 'geometry.ts', 'project.ts', 'topo.ts', 'overlay.ts', 'TopoStage.tsx', 'CrystallineSweepsPreview.tsx']) {
    const text = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /saveStudentReport|writeAssessments|saveTechniqueArchive|loadTechniqueArchive|loadStudentReport|localStorage\.setItem/);
  }
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  const at = app.indexOf('CRYSTAL_PREVIEW_PATH');
  assert.ok(at > 0);
  const route = app.slice(at, at + 220);
  assert.match(route, /CrystallineSweepsPreview/);
  assert.doesNotMatch(route, /CoachRoute|StudentRoute/);
  assert.equal(CRYSTAL_PREVIEW_PATH, '/preview/crystalline-sweeps');
  assert.equal(ASSESSMENT_STORAGE_KEY.length > 0, true);
  assert.equal(STUDENT_EDITION_STORAGE_KEY.length > 0, true);
});
