import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PROMOTION_NOTE, PROPOSED_LINE } from './model.ts';

test('the proposed line names each relationship and keeps the award off the line', () => {
  assert.deepEqual(PROPOSED_LINE.map((step) => step.name), [
    'Carlos Gracie Sr.',
    'Helio Gracie',
    'Carlos Gracie Jr.',
    'Professor Fabio Costa',
    'You',
  ]);
  assert.deepEqual(
    PROPOSED_LINE.slice(0, 4).map((step) => step.linkBelow),
    ['taught', 'awarded black belt', 'awarded black belt', 'trained'],
  );
  assert.equal(PROPOSED_LINE.some((step) => step.name === PROMOTION_NOTE), false);
  assert.equal(PROPOSED_LINE.some((step) => /Ribeiro|Rolls|tattoo/i.test(step.name)), false);
  const views = readFileSync(new URL('./OwnerLineageViews.tsx', import.meta.url), 'utf8');
  assert.equal(views.includes('localStorage'), false);
  assert.equal(views.includes('PROMOTION_NOTE'), true);
  assert.equal(views.includes('profile-details'), true);
  assert.equal(/Up|Remove/.test(views), false);
  assert.match(views, /title="Instructor lineage"/);
  assert.match(views, /title="Teaching lineage"/);
});
