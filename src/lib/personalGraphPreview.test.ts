import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERSONAL_GRAPH_PREVIEW_BANNER,
  basePositions,
  centerNode,
  exampleEdges,
  exampleNodes,
  fitView,
  goalCaption,
  graphBounds,
  practiceCaption,
  sharedArrivals,
  zoomAt,
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

test('fit all keeps every bubble inside a phone viewport', () => {
  const viewport = { width: 390, height: 480 };
  const view = fitView(viewport, 16);
  const bounds = graphBounds();
  assert.ok(view.scale > 0 && view.scale < 1);
  for (const node of exampleNodes()) {
    const left = view.x + node.x * view.scale;
    const top = view.y + node.y * view.scale;
    const right = left + node.w * view.scale;
    const bottom = top + node.h * view.scale;
    assert.ok(left >= 15, `${node.title} left ${left}`);
    assert.ok(top >= 15, `${node.title} top ${top}`);
    assert.ok(right <= viewport.width - 15, `${node.title} right ${right}`);
    assert.ok(bottom <= viewport.height - 15, `${node.title} bottom ${bottom}`);
  }
  const fittedWidth = bounds.width * view.scale;
  assert.ok(fittedWidth <= viewport.width - 32);
});

test('zoom stays bounded and a close-up centers the same node', () => {
  const start = fitView({ width: 800, height: 600 }, 20);
  const closer = zoomAt(start, 400, 300, start.scale * 4);
  assert.ok(closer.scale <= 2.4);
  const away = zoomAt(closer, 400, 300, 0.01);
  assert.equal(away.scale, 0.18);
  const node = exampleNodes()[0];
  const centered = centerNode({ width: 390, height: 520 }, node, 1);
  const midX = centered.x + (node.x + node.w / 2);
  const midY = centered.y + (node.y + node.h / 2);
  assert.ok(Math.abs(midX - 195) < 0.01);
  assert.ok(Math.abs(midY - 260) < 0.01);
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
