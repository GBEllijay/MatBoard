import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUD_CATEGORIES,
  PERSONAL_GRAPH_PREVIEW_BANNER,
  RESET_POSE,
  basePositions,
  categoryLabel,
  directNodeIds,
  exampleEdges,
  exampleNodes,
  gestureIntent,
  goalCaption,
  poseFacing,
  practiceCaption,
  projectNodes,
  rotatePose,
  sharedArrivals,
  zoomPose,
} from './personalGraphPreview.ts';

test('the example is fifteen nodes, two bases, and one copy of each shared position', () => {
  const nodes = exampleNodes();
  const edges = exampleEdges();
  assert.equal(nodes.length, 15);
  assert.equal(new Set(nodes.map((node) => node.id)).size, 15);
  assert.equal(new Set(nodes.map((node) => node.title)).size, 15);
  const bases = basePositions();
  assert.deepEqual(
    bases.map((node) => node.title),
    ['Closed guard', 'Sprawl'],
  );
  assert.equal(bases.every((node) => node.kind === 'position' && node.base), true);
  for (const edge of edges) {
    assert.ok(nodes.some((node) => node.id === edge.fromId));
    assert.ok(nodes.some((node) => node.id === edge.toId));
    assert.notEqual(edge.fromId, edge.toId);
  }
  const mount = nodes.filter((node) => node.id === 'p-mount');
  assert.equal(mount.length, 1);
  const arrivals = sharedArrivals();
  const mountArrivals = arrivals.find((item) => item.id === 'p-mount');
  assert.ok(mountArrivals && mountArrivals.arrivals >= 3);
  assert.equal(nodes.filter((node) => node.title === 'Mount').length, 1);
  assert.equal(nodes.filter((node) => node.title === 'Closed guard').length, 1);
  assert.equal(edges.filter((edge) => edge.toId === 'p-closed').length >= 2, true);
  assert.ok(edges.some((edge) => edge.relation === 'defense'));
  assert.ok(edges.some((edge) => edge.relation === 'follow'));
  assert.ok(edges.some((edge) => edge.relation === 'transition'));
  assert.match(PERSONAL_GRAPH_PREVIEW_BANNER, /Preview only/);
  assert.match(PERSONAL_GRAPH_PREVIEW_BANNER, /not belt requirements/i);
});

test('the cloud is not a set of flowchart rows, and every legend category is used', () => {
  const nodes = exampleNodes();
  const ys = new Set(nodes.map((node) => node.y));
  const zs = nodes.map((node) => Math.abs(node.z));
  assert.ok(ys.size >= 8);
  assert.ok(Math.max(...zs) > 0.4);
  const used = new Set(nodes.map((node) => node.category));
  assert.deepEqual(
    CLOUD_CATEGORIES.map((item) => item.id).filter((id) => used.has(id)),
    CLOUD_CATEGORIES.map((item) => item.id),
  );
  assert.equal(categoryLabel('passing'), 'Guard Passing');
  assert.equal(categoryLabel('standing'), 'Standing and Takedowns');
});

test('fit keeps every dot inside a phone viewport, including after a turn', () => {
  const viewport = { width: 390, height: 480 };
  for (const pose of [RESET_POSE, rotatePose(RESET_POSE, 140, -40)]) {
    const placed = projectNodes(viewport, pose, 28);
    assert.equal(placed.length, 15);
    for (const node of placed) {
      assert.ok(node.x - node.r >= 8, `${node.id} left`);
      assert.ok(node.y - node.r >= 8, `${node.id} top`);
      assert.ok(node.x + node.r <= viewport.width - 8, `${node.id} right`);
      assert.ok(node.y + node.r <= viewport.height - 8, `${node.id} bottom`);
    }
  }
});

test('drag rotates, a short press does not, and zoom stays bounded', () => {
  assert.equal(gestureIntent(3), 'tap');
  assert.equal(gestureIntent(12), 'rotate');
  const turned = rotatePose(RESET_POSE, 40, 10);
  assert.notEqual(turned.yaw, RESET_POSE.yaw);
  assert.equal(turned.flat, false);
  const capped = rotatePose(RESET_POSE, 0, 5000);
  assert.ok(capped.pitch <= 1.05);
  const closer = zoomPose(RESET_POSE, 8);
  assert.equal(closer.zoom, 2.6);
  const away = zoomPose(RESET_POSE, 0.01);
  assert.equal(away.zoom, 0.55);
  const flat = projectNodes({ width: 400, height: 400 }, { ...RESET_POSE, flat: true, yaw: 1, pitch: 1 });
  const alsoFlat = projectNodes({ width: 400, height: 400 }, { yaw: 0, pitch: 0, zoom: 1, flat: true });
  const left = flat.find((item) => item.id === 'p-closed');
  const right = alsoFlat.find((item) => item.id === 'p-closed');
  assert.equal(left?.x, right?.x);
  assert.equal(left?.y, right?.y);
});

test('facing a node brings that same id forward, and only its direct steps are linked', () => {
  const node = exampleNodes().find((item) => item.id === 'p-mount');
  assert.ok(node);
  const pose = poseFacing(node, RESET_POSE);
  const placed = projectNodes({ width: 600, height: 600 }, pose);
  const mount = placed.find((item) => item.id === 'p-mount');
  const mean = placed.reduce((sum, item) => sum + item.depth, 0) / placed.length;
  assert.ok(mount && mount.depth > mean);
  const links = directNodeIds('p-mount');
  assert.ok(links.includes('t-hip'));
  assert.ok(links.includes('t-flower'));
  assert.ok(links.includes('p-side'));
  assert.equal(links.includes('t-uchi'), false);
  assert.equal(new Set(links).size, links.length);
});

test('example goals and practice time are labels, not completed benchmarks', () => {
  assert.match(goalCaption('coach-interval'), /blue → purple/);
  assert.match(goalCaption('coach-interval'), /Not a stripe/);
  assert.match(goalCaption('personal'), /Not shared/);
  assert.match(practiceCaption(40), /not mastery/);
  assert.match(practiceCaption(0), /No practice time/);
  const interval = exampleNodes().filter((node) => node.goal === 'coach-interval');
  assert.ok(interval.length >= 1);
  assert.equal(interval.some((node) => node.practiceMinutes > 0), true);
});
