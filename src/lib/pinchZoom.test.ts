import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clampScale,
  fitScale,
  focalScroll,
  minScaleForView,
  pinchScale,
  TOURNAMENT_VIEWPORT,
  MIN_SCALE_FLOOR,
  MAX_SCALE,
} from './pinchZoom.ts';

describe('fitScale', () => {
  it('fits a wide bracket into a phone viewport', () => {
    const scale = fitScale(390, 700, 1472, 576);
    assert.ok(scale < 1);
    assert.equal(Number(scale.toFixed(3)), Number((390 / 1472).toFixed(3)));
  });

  it('returns the raw cover ratio when the board already fits', () => {
    assert.equal(fitScale(1600, 900, 800, 450), 2);
  });
});

describe('minScaleForView', () => {
  it('lets pinch-out shrink to fit-to-screen, not below the floor', () => {
    const min = minScaleForView(390, 700, 1472, 576);
    assert.ok(min <= 1);
    assert.ok(min >= MIN_SCALE_FLOOR);
    assert.ok(min < 0.3);
  });

  it('fits a 92rem Bright tree into phone landscape without going below the floor', () => {
    const min = minScaleForView(844, 390, 92 * 16, 36 * 16);
    assert.ok(min < 1);
    assert.ok(min >= MIN_SCALE_FLOOR);
    assert.equal(Number(min.toFixed(3)), Number((844 / (92 * 16)).toFixed(3)));
  });

  it('stays at 1 when the tree already fits', () => {
    assert.equal(minScaleForView(1600, 900, 1200, 600), 1);
  });
});

describe('clampScale', () => {
  it('blocks zoom-out past minScale and zoom-in past max', () => {
    assert.equal(clampScale(0.05, 0.25), 0.25);
    assert.equal(clampScale(9, 0.25), MAX_SCALE);
    assert.equal(clampScale(1.2, 0.25), 1.2);
  });
});

describe('pinchScale', () => {
  it('scales from the two-finger distance ratio', () => {
    assert.equal(pinchScale(1, 100, 50), 0.5);
    assert.equal(pinchScale(1, 100, 200), 2);
  });
});

describe('focalScroll', () => {
  it('leaves scroll put when the scale does not change', () => {
    assert.equal(focalScroll(40, 10, 1, 1), 40);
  });

  it('keeps the finger point on the same diagram coordinate', () => {
    assert.equal(focalScroll(0, 100, 1, 2), 100);
    assert.equal(focalScroll(100, 50, 2, 1), 25);
  });
});

describe('tournament viewport', () => {
  it('locks native page zoom so pinch cannot reflow the layout viewport', () => {
    assert.match(TOURNAMENT_VIEWPORT, /maximum-scale=1/);
    assert.match(TOURNAMENT_VIEWPORT, /user-scalable=no/);
  });
});
