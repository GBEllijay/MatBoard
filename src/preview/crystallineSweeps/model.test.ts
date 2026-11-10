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
import { TOPO_H, TOPO_LEVEL, buildTopo, demoLevel, reliefScale, tileTone, toneForName } from './topo.ts';
import { EXAMPLE_OPPONENT_FACTORS, EXAMPLE_OPPONENT_SWEEPS, EXAMPLE_SELF_FACTORS, EXAMPLE_SELF_SWEEPS, exampleCompare, factorComparisons } from './overlay.ts';
import {
  FOCUS_FRAME_ZOOM,
  REST_ZOOM,
  ZOOM_STEP,
  crystalLabelState,
  drillAfterZoom,
  faceShowsTechniqueLabels,
  tileShowsTechniqueLabel,
  zoomAfterClosingDrill,
  zoomPastRest,
} from './labels.ts';
import { classifyTap, connectionLayout, demoCard, gridCells, growOffEdge, labelVisible, midpointQuarters, screenSides, sidesWithBack, subdivideTriangle, triangleArea, barycentric, walkDemo, assignDrillCells } from './demoLinks.ts';

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
  assert.equal(sunk.apex && tall.apex && sunk.apex.z, -3.5 * cap);
  assert.equal(shallow.apex?.z, -1.5 * cap);
  assert.equal(flat.apex?.z, 0);
  assert.equal(raised.apex?.z, 1.5 * cap);
  assert.equal(tall.apex?.z, 3.5 * cap);
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
  assert.equal(TOPO_LEVEL[1], -3.5 * TOPO_H);
  assert.equal(TOPO_LEVEL[2], -1.5 * TOPO_H);
  assert.equal(TOPO_LEVEL[3], 0);
  assert.equal(TOPO_LEVEL[4], 1.5 * TOPO_H);
  assert.equal(TOPO_LEVEL[5], 3.5 * TOPO_H);
  for (const fill of ['center', 'edges'] as const) {
    const placed = buildTopo(() => 4, fill);
    const face = placed.faces.find((item) => item.id === 'sweeps');
    assert.ok(face);
    const tiles = placed.tiles.filter((tile) => tile.faceId === 'sweeps');
    const filled = tiles.filter((tile) => tile.move);
    const empty = tiles.filter((tile) => !tile.move);
    assert.equal(filled.length, 6);
    assert.equal(empty.length, tiles.length - 6);
    const mid = (points: { p: [number, number, number] }[]) =>
      [0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point.p[axis], 0) / points.length) as [number, number, number];
    const faceMid = mid(tiles[0] ? [tiles[0].tri[0], tiles[0].tri[1], tiles[0].tri[2]] : []);
    // Face centroid from all tile vertices is steadier than one tile.
    const verts = tiles.flatMap((tile) => tile.tri.map((corner) => corner.p));
    const unique = [...new Map(verts.map((point) => [point.join(), point])).values()];
    const centroid = [0, 1, 2].map((axis) => unique.reduce((sum, point) => sum + point[axis], 0) / unique.length) as [number, number, number];
    const distance = (point: [number, number, number]) => Math.hypot(point[0] - centroid[0], point[1] - centroid[1], point[2] - centroid[2]);
    const tileDistance = (tile: (typeof tiles)[number]) => distance(mid(tile.tri));
    const emptyFar = Math.max(...empty.map(tileDistance));
    const filledNear = Math.min(...filled.map(tileDistance));
    const filledFar = Math.max(...filled.map(tileDistance));
    const emptyNear = Math.min(...empty.map(tileDistance));
    if (fill === 'center') assert.ok(filledFar <= emptyNear + 1e-6);
    else assert.ok(emptyFar <= filledNear + 1e-6);
    const mean = [0, 1, 2].map((axis) => filled.reduce((sum, tile) => sum + mid(tile.tri)[axis], 0) / filled.length) as [number, number, number];
    assert.ok(distance(mean) < distance(faceMid) || distance(mean) < 0.35, fill);
  }
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
  for (const name of ['adapter.ts', 'geometry.ts', 'project.ts', 'topo.ts', 'overlay.ts', 'demoLinks.ts', 'labels.ts', 'TopoStage.tsx', 'CrystallineSweepsPreview.tsx']) {
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

test('example sides stay local and the Mount walk is recursive', () => {
  const mount = demoCard('Mount');
  assert.deepEqual(mount.sides, { left: 'Armbar', base: 'Cross collar choke', right: 'Americana' });
  assert.deepEqual(mount.outgoing, ['Armbar', 'Cross collar choke', 'Americana']);
  for (const name of ['Scissor sweep', 'Hip bump sweep', 'Flower sweep', 'Pendulum sweep']) {
    assert.equal(mount.incoming.includes(name), true);
    assert.equal(mount.more.includes(name), true);
    assert.equal(mount.outgoing.includes(name), false);
  }
  const upright: [[number, number], [number, number], [number, number]] = [
    [100, 10],
    [40, 100],
    [160, 100],
  ];
  const sides = screenSides(upright);
  assert.equal(sides.find((side) => side.role === 'base')?.edge, 1);
  assert.equal(sides.find((side) => side.role === 'left')?.edge, 0);
  assert.equal(sides.find((side) => side.role === 'right')?.edge, 2);
  const grown = growOffEdge(
    [
      [0, 0, 0],
      [2, 0, 0],
      [1, 2, 0],
    ],
    0,
  );
  assert.deepEqual(grown[0], [0, 0, 0]);
  assert.deepEqual(grown[1], [2, 0, 0]);
  assert.deepEqual(grown[2], [1, -2, 0]);
  const walk = walkDemo('Mount', ['Armbar', 'Wrist lock']);
  assert.deepEqual(walk.map((step) => step.name), ['Mount', 'Armbar', 'Wrist lock']);
  assert.equal(walk[1]?.sides.left, 'Wrist lock');
  assert.equal(walk[1]?.sides.right, 'Triangle choke');
  assert.equal(walk[1]?.sides.base, 'Mount');
  assert.equal(walk[2]?.sides.base, 'Armbar');
  assert.equal(walk[2]?.sides.left, null);
  assert.equal(walk[2]?.sides.right, null);
  assert.deepEqual(sidesWithBack('Armbar', null), { left: 'Wrist lock', base: null, right: 'Triangle choke' });
  assert.equal(walkDemo('Mount', ['Wrist lock']).map((step) => step.name).join('>'), 'Mount');
  const mountGrid = connectionLayout('Mount', null);
  assert.equal(mountGrid.mode, 'grid');
  if (mountGrid.mode !== 'grid') return;
  assert.equal(mountGrid.n, 3);
  assert.equal(mountGrid.n * mountGrid.n, 9);
  assert.equal(mountGrid.blanks, 2);
  assert.deepEqual(mountGrid.names.slice(0, 3), ['Armbar', 'Cross collar choke', 'Americana']);
  for (const name of ['Scissor sweep', 'Hip bump sweep', 'Flower sweep', 'Pendulum sweep']) {
    assert.equal(mountGrid.names.includes(name), true);
  }
  const armbar = connectionLayout('Armbar', 'Mount');
  assert.equal(armbar.mode, 'grid');
  if (armbar.mode !== 'grid') return;
  assert.equal(armbar.n, 2);
  assert.equal(armbar.names.length, 4);
  assert.equal(armbar.names.includes('Wrist lock'), true);
  assert.equal(armbar.names.includes('Triangle choke'), true);
  assert.equal(armbar.names.includes('Mount'), true);
  assert.equal(connectionLayout('Wrist lock', 'Armbar').mode, 'edges');
  assert.equal(connectionLayout('Closed guard', null).mode, 'edges');
  assert.equal(gridCells(3), null);
  assert.equal(gridCells(4), 4);
  assert.equal(gridCells(7), 9);
  assert.equal(gridCells(10), 16);
  const cells = assignDrillCells(
    [
      [0, 0, 0],
      [3, 0, 0],
      [0, 3, 0],
    ],
    mountGrid.names,
  );
  assert.equal(cells.length, 9);
  assert.equal(cells.filter((cell) => cell.name).length, 7);
  assert.equal(new Set(cells.map((cell) => cell.name).filter(Boolean)).size, 7);
  assert.equal(subdivideTriangle([[0, 0, 0], [2, 0, 0], [0, 2, 0]], 2).length, 4);
  assert.equal(labelVisible({ w: 30, h: 40 }, 'Armbar'), false);
  assert.equal(labelVisible({ w: 80, h: 40 }, 'Armbar'), true);
  assert.equal(labelVisible({ w: 80, h: 40 }, 'Cross collar choke'), false);
  assert.equal(classifyTap({ pinching: true, moved: false, edge: null, edgeHasLink: false, sameTile: true, elapsedMs: 10 }), 'ignore');
  assert.equal(classifyTap({ pinching: false, moved: true, edge: null, edgeHasLink: false, sameTile: true, elapsedMs: 10 }), 'ignore');
  assert.equal(classifyTap({ pinching: false, moved: false, edge: 0, edgeHasLink: true, sameTile: true, elapsedMs: 10 }), 'edge');
  assert.equal(classifyTap({ pinching: false, moved: false, edge: null, edgeHasLink: false, sameTile: true, elapsedMs: 200 }), 'double');
  assert.equal(classifyTap({ pinching: false, moved: false, edge: null, edgeHasLink: false, sameTile: false, elapsedMs: 10 }), 'single');
  assert.equal(classifyTap({ pinching: false, moved: false, edge: 1, edgeHasLink: false, sameTile: true, elapsedMs: 10 }), 'single');
  assert.equal(tileTone('pos.mount'), 'position');
  assert.equal(tileTone('escape.mount'), 'defense');
  assert.equal(tileTone('def.guard-retention'), 'defense');
  assert.equal(tileTone('sub.americana'), 'submission');
  assert.equal(tileTone('pass.knee-slice'), 'pass');
  assert.equal(tileTone('sweep.scissor'), 'pass');
  assert.equal(tileTone('td.double-leg'), 'position');
  const parent: [[number, number, number], [number, number, number], [number, number, number]] = [
    [0, 0, 0],
    [4, 0, 1],
    [1, 3, 2],
  ];
  const parts = midpointQuarters(parent);
  const kids = [parts.center, ...parts.corners];
  const parentArea = triangleArea(parent[0], parent[1], parent[2]);
  let sum = 0;
  for (const tri of kids) {
    for (const vertex of tri) {
      for (const weight of barycentric(vertex, parent[0], parent[1], parent[2])) assert.ok(weight >= -1e-8);
    }
    sum += triangleArea(tri[0], tri[1], tri[2]);
  }
  assert.ok(Math.abs(sum - parentArea) < 1e-6);
  const nested = midpointQuarters(parts.corners[0]);
  for (const tri of [nested.center, ...nested.corners]) {
    for (const vertex of tri) {
      for (const weight of barycentric(vertex, parent[0], parent[1], parent[2])) assert.ok(weight >= -1e-8);
    }
  }
  assert.equal(reliefScale(3.5, 0), 0);
  assert.equal(reliefScale(-3.5, 1), -3.5);
  assert.equal(reliefScale(3.5, 2), 3.5);
  assert.equal(toneForName('Mount'), 'position');
  assert.equal(toneForName('Armbar'), 'submission');
  assert.equal(toneForName('Triangle choke'), 'submission');
  assert.equal(toneForName('Pendulum sweep'), 'pass');
});

test('default zoom hides technique names; zoom-in or a face drill shows one face', () => {
  const topo = buildTopo(() => 3, 'center');
  const sweepsFace = topo.faces.findIndex((face) => face.id === 'sweeps');
  assert.equal(topo.faces.map((face) => face.name).join('|'), AXES.map((axis) => axis.label).join('|'));
  assert.deepEqual(
    topo.faces.map((face) => face.name),
    ['Guard/Control', 'Passing', 'Sweeps', 'Takedowns', 'Escapes/Defense', 'Submissions', 'Conditioning', 'Mindset'],
  );
  const empty = topo.faces.filter((face) => face.moves.length === 0).map((face) => face.id);
  assert.deepEqual(empty, ['conditioning', 'mindset']);
  for (const name of ['labels.ts', 'TopoStage.tsx', 'CrystallineSweepsPreview.tsx']) {
    const text = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /MINDSET_GOALS|CONDITIONING_ITEMS/);
  }
  const rest = {
    zoom: REST_ZOOM,
    drilledFace: -1,
    focusedFace: -1,
    frontFace: 3,
    comparison: false,
    pair: false,
    sweepsFace,
  };
  assert.equal(zoomPastRest(REST_ZOOM), false);
  assert.equal(zoomPastRest(FOCUS_FRAME_ZOOM), false);
  assert.equal(zoomPastRest(REST_ZOOM * ZOOM_STEP), true);
  assert.deepEqual(crystalLabelState(rest), { tier: 'faces', face: -1 });
  assert.deepEqual(crystalLabelState({ ...rest, zoom: FOCUS_FRAME_ZOOM, focusedFace: 4 }), { tier: 'faces', face: -1 });
  for (let face = 0; face < topo.faces.length; face += 1) {
    assert.deepEqual(crystalLabelState({ ...rest, focusedFace: face }), { tier: 'faces', face: -1 });
    assert.deepEqual(crystalLabelState({ ...rest, drilledFace: face, focusedFace: face }), { tier: 'techniques', face });
    assert.equal(faceShowsTechniqueLabels(crystalLabelState({ ...rest, drilledFace: face }), face, topo.faces[face].moves.length, false), topo.faces[face].moves.length > 0);
    const zoomed = crystalLabelState({ ...rest, zoom: REST_ZOOM * ZOOM_STEP, focusedFace: face, frontFace: (face + 1) % 8 });
    assert.deepEqual(zoomed, { tier: 'techniques', face });
    for (const tile of topo.tiles) {
      const show = tileShowsTechniqueLabel(zoomed, tile.faceIndex, Boolean(tile.move), false);
      if (show) assert.equal(tile.faceIndex, face);
      if (tile.faceIndex !== face || !tile.move) assert.equal(show, false);
    }
    const names = topo.tiles
      .filter((tile) => tileShowsTechniqueLabel(zoomed, tile.faceIndex, Boolean(tile.move), false))
      .map((tile) => tile.move?.name ?? '')
      .sort();
    assert.deepEqual(
      names,
      topo.faces[face].moves.map((move) => move.name).sort(),
    );
  }
  const spinning = crystalLabelState({ ...rest, zoom: REST_ZOOM * ZOOM_STEP, frontFace: 2 });
  assert.deepEqual(spinning, { tier: 'techniques', face: 2 });
  assert.deepEqual(crystalLabelState({ ...rest, zoom: REST_ZOOM * ZOOM_STEP, drilledFace: 5, focusedFace: 1, frontFace: 2 }), {
    tier: 'techniques',
    face: 5,
  });
  assert.equal(drillAfterZoom(REST_ZOOM * ZOOM_STEP, FOCUS_FRAME_ZOOM, 5), -1);
  assert.equal(drillAfterZoom(REST_ZOOM, REST_ZOOM / ZOOM_STEP, 5), -1);
  assert.equal(drillAfterZoom(REST_ZOOM, REST_ZOOM * ZOOM_STEP, 5), 5);
  assert.equal(zoomAfterClosingDrill(REST_ZOOM * ZOOM_STEP), FOCUS_FRAME_ZOOM);
  assert.equal(zoomAfterClosingDrill(REST_ZOOM), REST_ZOOM);
  assert.deepEqual(crystalLabelState({ ...rest, pair: true, zoom: 2, drilledFace: 2 }), { tier: 'faces', face: -1 });
  assert.deepEqual(crystalLabelState({ ...rest, comparison: true, zoom: 2, focusedFace: 1, frontFace: 1 }), { tier: 'faces', face: -1 });
  assert.deepEqual(
    crystalLabelState({ ...rest, comparison: true, zoom: 2, focusedFace: sweepsFace, drilledFace: sweepsFace }),
    { tier: 'techniques', face: sweepsFace },
  );
  const drilledMindset = crystalLabelState({ ...rest, drilledFace: topo.faces.findIndex((face) => face.id === 'mindset') });
  assert.equal(tileShowsTechniqueLabel(drilledMindset, drilledMindset.face, false, false), false);
  assert.equal(faceShowsTechniqueLabels(drilledMindset, drilledMindset.face, 0, false), false);
});
