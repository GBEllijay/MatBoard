import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BAND_FIGURE_PHONE_MAX_PX,
  PHONE_BAND_FIGURE_WIDTH_PX,
  boardCheerShowsBubble,
  isPhoneBand,
  phoneBandFigureBox,
  splashFigureGutter,
} from './bandFigureLayout.ts';

const MASTERS = ['classic', 'a', 'b', 'c', 'd'] as const;

test('tablets through 1023px use the fixed figure and 1024+ stays desktop', () => {
  assert.equal(BAND_FIGURE_PHONE_MAX_PX, 1023);
  for (const width of [390, 430, 599, 600, 601, 680, 768, 820, 900, 1023]) {
    assert.equal(isPhoneBand(width), true, String(width));
    assert.equal(boardCheerShowsBubble(width), false, String(width));
  }
  assert.equal(isPhoneBand(1024), false);
  assert.equal(isPhoneBand(1440), false);
  assert.equal(boardCheerShowsBubble(1024), true);
  assert.equal(boardCheerShowsBubble(1440), true);
});

test('every master gets a 100–110px phone figure on the right edge of the band', () => {
  assert.ok(PHONE_BAND_FIGURE_WIDTH_PX >= 100);
  assert.ok(PHONE_BAND_FIGURE_WIDTH_PX <= 110);
  const display = { left: 0, top: 0, right: 390, bottom: 844 };
  const box = phoneBandFigureBox(display, 520);
  assert.equal(box.width, PHONE_BAND_FIGURE_WIDTH_PX);
  assert.equal(box.right, 390);
  assert.equal(box.bottom, 520);
  assert.ok(box.bottom - box.top > box.width);
  for (const master of MASTERS) {
    assert.equal(boardCheerShowsBubble(390), false, master);
    assert.equal(splashFigureGutter(390, box.width, true), box.width, master);
  }
});

test('the desktop board keeps its bubble and reserves no gutter', () => {
  assert.equal(boardCheerShowsBubble(1440), true);
  assert.equal(boardCheerShowsBubble(1024), true);
  assert.equal(splashFigureGutter(1440, 180, true), 0);
  assert.equal(splashFigureGutter(768, 106, true), 106);
  assert.equal(splashFigureGutter(1024, 180, true), 0);
  assert.equal(splashFigureGutter(390, 106, false), 0);
  assert.equal(splashFigureGutter(390, 0, true), 0);
});
