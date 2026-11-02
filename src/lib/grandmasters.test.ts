import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GRANDMASTER_IDS,
  GRANDMASTERS,
  grandmasterById,
  grandmasterForCheer,
  isGrandmasterId,
  pickGrandmaster,
  resolveGrandmasterId,
  type GrandmasterId,
} from './grandmasters.ts';

test('five masters rotate and never repeat the one just shown', () => {
  assert.deepEqual([...GRANDMASTER_IDS], ['classic', 'a', 'b', 'c', 'd']);
  for (const previous of GRANDMASTER_IDS) {
    const pool = new Set<GrandmasterId>();
    for (let step = 0; step < GRANDMASTER_IDS.length - 1; step += 1) {
      const next = pickGrandmaster(previous, () => (step + 0.01) / (GRANDMASTER_IDS.length - 1));
      assert.notEqual(next, previous);
      pool.add(next);
    }
    assert.equal(pool.size, 4);
    assert.equal(pool.has(previous), false);
  }
  const all = new Set<GrandmasterId>();
  for (let step = 0; step < GRANDMASTER_IDS.length; step += 1) {
    all.add(pickGrandmaster(null, () => (step + 0.01) / GRANDMASTER_IDS.length));
  }
  assert.equal(all.size, GRANDMASTER_IDS.length);
});

test('a cheer key picks the same master on every screen, then a new cheer moves on', () => {
  const first = grandmasterForCheer('classic', 'bout:1');
  assert.equal(grandmasterForCheer('classic', 'bout:1'), first);
  assert.notEqual(first, 'classic');
  const second = grandmasterForCheer(first, 'bout:2');
  assert.equal(grandmasterForCheer(first, 'bout:2'), second);
  assert.notEqual(second, first);
  assert.equal(resolveGrandmasterId({ masterId: first, cheerKey: 'bout:1' }, 'bout:1'), first);
  assert.equal(resolveGrandmasterId({ masterId: first, cheerKey: 'bout:1' }, 'bout:2'), second);
});

test('each master keeps a measured face box the speech bubble can avoid', () => {
  const classic = grandmasterById('classic');
  assert.equal(classic.src, '/assets/kids/grandmaster-classic.webp');
  assert.deepEqual(classic.face, { left: 22, top: 2, width: 50, height: 40 });
  assert.equal(classic.nodSrc, undefined);

  const measured = {
    a: { left: 25, top: 0, width: 48, height: 33 },
    b: { left: 26, top: 0, width: 42, height: 36 },
    c: { left: 30, top: 0, width: 42, height: 32 },
    d: { left: 28, top: 0, width: 46, height: 36 },
  } as const;
  for (const master of GRANDMASTERS) {
    assert.equal(isGrandmasterId(master.id), true);
    assert.equal(master.src, `/assets/kids/grandmaster-${master.id}.webp`);
    assert.ok(master.face.left >= 22, master.id);
    assert.ok(master.face.left + master.face.width <= 74, master.id);
    assert.ok(master.face.width >= 42, master.id);
    assert.ok(master.face.height >= 32, master.id);
    if (master.id !== 'classic') assert.deepEqual(master.face, measured[master.id]);
  }

  const thumbs = grandmasterById('a').avoid;
  assert.deepEqual(thumbs, [
    { left: 0, top: 32, width: 36, height: 26 },
    { left: 70, top: 33, width: 30, height: 25 },
  ]);
  assert.deepEqual(grandmasterById('c').avoid, [{ left: 4, top: 27, width: 28, height: 16 }]);
  const nod = grandmasterById('d');
  assert.equal(nod.nodSrc, '/assets/kids/grandmaster-d-nod.webp');
  assert.deepEqual(nod.face, measured.d);
});
