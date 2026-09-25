import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  KEYBOARD_INSET_MIN_PX,
  clampScroll,
  clipComfortBand,
  comfortBand,
  coveredScrollportPad,
  deltaToReveal,
  horizontalDelta,
  inputTypeUsesKeyboard,
  keyboardInsetPx,
  keyboardIsOpen,
  layoutKeyboardOverlap,
  overlayBottomInset,
  revealAction,
  shouldKeepFieldInView,
} from './keepFieldVisible.ts';

describe('keyboard inset', () => {
  it('holds the open state while the keyboard animates shut', () => {
    assert.equal(keyboardIsOpen(100, false), false);
    assert.equal(keyboardIsOpen(KEYBOARD_INSET_MIN_PX, false), true);
    assert.equal(keyboardIsOpen(100, true), true);
    assert.equal(keyboardIsOpen(40, true), false);
  });

  it('treats a shrunk visual viewport as keyboard height', () => {
    assert.equal(keyboardInsetPx(800, 470), 330);
    assert.equal(keyboardInsetPx(800, 800), 0);
    assert.equal(keyboardInsetPx(800, 900), 0);
  });

  it('follows a focused field on a phone and when a keyboard inset is real', () => {
    assert.equal(
      shouldKeepFieldInView({
        layoutHeight: 800,
        visualHeight: 780,
        coarsePointer: true,
        layoutWidth: 390,
      }),
      true,
    );
    assert.equal(
      shouldKeepFieldInView({
        layoutHeight: 900,
        visualHeight: 900 - KEYBOARD_INSET_MIN_PX,
        coarsePointer: false,
        layoutWidth: 1280,
      }),
      true,
    );
  });

  it('leaves desktop and TV scroll alone when no keyboard is covering the page', () => {
    assert.equal(
      shouldKeepFieldInView({
        layoutHeight: 900,
        visualHeight: 820,
        coarsePointer: false,
        layoutWidth: 1440,
      }),
      false,
    );
    assert.equal(
      shouldKeepFieldInView({
        layoutHeight: 1080,
        visualHeight: 1080,
        coarsePointer: true,
        layoutWidth: 1920,
      }),
      false,
    );
    assert.equal(
      shouldKeepFieldInView({
        layoutHeight: 430,
        visualHeight: 430,
        coarsePointer: true,
        layoutWidth: 932,
      }),
      false,
    );
  });
});

describe('keyboard fields', () => {
  it('keeps text entry types and skips controls that do not open a keyboard', () => {
    assert.equal(inputTypeUsesKeyboard('text'), true);
    assert.equal(inputTypeUsesKeyboard('search'), true);
    assert.equal(inputTypeUsesKeyboard('number'), true);
    assert.equal(inputTypeUsesKeyboard('date'), true);
    assert.equal(inputTypeUsesKeyboard(''), true);
    assert.equal(inputTypeUsesKeyboard('checkbox'), false);
    assert.equal(inputTypeUsesKeyboard('radio'), false);
    assert.equal(inputTypeUsesKeyboard('file'), false);
    assert.equal(inputTypeUsesKeyboard('range'), false);
    assert.equal(inputTypeUsesKeyboard('button'), false);
    assert.equal(inputTypeUsesKeyboard('hidden'), false);
  });
});

describe('visible band', () => {
  it('centers a covered field in the band above the keyboard', () => {
    const band = comfortBand(480);
    const delta = deltaToReveal({ top: 520, bottom: 568, height: 48 }, band, 'center');
    assert.ok(delta > 0);
    assert.equal(Math.round(520 + 24 - delta), Math.round(band.center));
  });

  it('on later viewport events only moves a field that has left the band', () => {
    assert.equal(
      revealAction({
        keyboardOpen: true,
        rectTop: 80,
        rectBottom: 140,
        rectHeight: 60,
        visualHeight: 480,
        mode: 'viewport',
      }),
      'none',
    );
    assert.equal(
      revealAction({
        keyboardOpen: true,
        rectTop: 430,
        rectBottom: 490,
        rectHeight: 60,
        visualHeight: 480,
        mode: 'viewport',
      }),
      'into-band',
    );
    const band = comfortBand(480);
    const delta = deltaToReveal({ top: 430, bottom: 490, height: 60 }, band, 'into-band');
    assert.equal(delta, 490 - band.bottom);
  });

  it('does not pre-scroll a field already in the safe upper half before the keyboard opens', () => {
    assert.equal(
      revealAction({
        keyboardOpen: false,
        rectTop: 40,
        rectBottom: 100,
        rectHeight: 60,
        visualHeight: 800,
        mode: 'focus',
      }),
      'none',
    );
    assert.equal(
      revealAction({
        keyboardOpen: false,
        rectTop: 640,
        rectBottom: 700,
        rectHeight: 60,
        visualHeight: 800,
        mode: 'focus',
      }),
      'center',
    );
  });

  it('clips the band to a nested sheet instead of the full screen', () => {
    const band = comfortBand(500);
    const clipped = clipComfortBand(band, 180, 500);
    assert.ok(clipped.top >= 180);
    assert.ok(clipped.bottom <= band.bottom);
    assert.ok(clipped.center > band.center);
  });
});

describe('scroll limits', () => {
  it('clamps scroll deltas to the scroller range', () => {
    assert.equal(clampScroll(100, 50, 120), 120);
    assert.equal(clampScroll(10, -40, 200), 0);
    assert.equal(clampScroll(10, 15, 200), 25);
  });

  it('scrolls horizontally only far enough to bring the field inside', () => {
    assert.equal(horizontalDelta(20, 180, 0, 390, 12), 0);
    assert.equal(horizontalDelta(400, 560, 0, 390, 12), 560 - (390 - 12));
    assert.equal(horizontalDelta(-30, 120, 0, 390, 12), -30 - 12);
  });

  it('lifts a bottom sheet by the covered amount once, without stacking', () => {
    const visual = 500;
    const natural = 812;
    const overlap = layoutKeyboardOverlap(812, visual, 0);
    const first = overlayBottomInset(natural, visual, overlap);
    assert.equal(first, 312);
    const after = natural - first;
    assert.equal(overlayBottomInset(after + first, visual, overlap), first);
    assert.equal(overlayBottomInset(visual, visual, overlap), 0);
  });

  it('counts only the overlap an iOS pan has not already absorbed', () => {
    const overlap = layoutKeyboardOverlap(800, 500, 200);
    assert.equal(overlap, 100);
    assert.equal(overlayBottomInset(600, 500, overlap), 100);
    assert.equal(overlayBottomInset(500, 500, layoutKeyboardOverlap(800, 500, 0)), 0);
  });

  it('pads a scrollport that still extends behind the keyboard', () => {
    assert.equal(coveredScrollportPad(500, 500), 0);
    assert.equal(coveredScrollportPad(780, 480), 780 - 480 + 20);
  });
});
