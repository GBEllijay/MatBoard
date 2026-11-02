import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_DQ_DISAPPOINTED,
  DQ_DISAPPOINTED_SAFETY_MS,
  DQ_DISAPPOINTED_STILL,
  DQ_DISAPPOINTED_STILL_MS,
  DQ_DISAPPOINTED_VIDEO,
  canPlayVp9Alpha,
  dismissDqDisappointed,
  dqDisappointedFromSync,
  dqDisappointedMedia,
  dqDisappointedShouldPlay,
  parseDqDisappointed,
} from './dqDisappointed.ts';

const dq = { call: 'dq' as const, at: 40 };
const win = { call: 'win' as const, at: 40 };

test('the DQ reaction toggle is stored and a remote match keeps it', () => {
  assert.deepEqual(parseDqDisappointed(undefined), DEFAULT_DQ_DISAPPOINTED);
  assert.equal(DEFAULT_DQ_DISAPPOINTED.enabled, false);
  const saved = parseDqDisappointed({ enabled: true, playedAt: 12 });
  assert.equal(saved.enabled, true);
  assert.equal(saved.playedAt, 12);
  const roundTrip = JSON.parse(JSON.stringify({ dqDisappointed: saved })) as { dqDisappointed: unknown };
  assert.deepEqual(parseDqDisappointed(roundTrip.dqDisappointed), saved);
  assert.deepEqual(dqDisappointedFromSync({ enabled: true, playedAt: 9 }, null), {
    enabled: true,
    playedAt: 9,
  });
  assert.deepEqual(dqDisappointedFromSync(DEFAULT_DQ_DISAPPOINTED, { enabled: true, playedAt: 3 }), {
    enabled: true,
    playedAt: 3,
  });
  assert.equal(parseDqDisappointed({ enabled: false, playedAt: 'nope' }).playedAt, null);
});

test('the reaction plays only on a DQ, and only once for that recording', () => {
  const on = { ...DEFAULT_DQ_DISAPPOINTED, enabled: true };
  assert.equal(dqDisappointedShouldPlay({ prefs: on, outcome: null }), false);
  assert.equal(dqDisappointedShouldPlay({ prefs: on, outcome: win }), false);
  assert.equal(dqDisappointedShouldPlay({ prefs: DEFAULT_DQ_DISAPPOINTED, outcome: dq }), false);
  assert.equal(dqDisappointedShouldPlay({ prefs: on, outcome: dq }), true);
  const played = dismissDqDisappointed(on, dq.at);
  assert.equal(played.playedAt, dq.at);
  assert.equal(dqDisappointedShouldPlay({ prefs: played, outcome: dq }), false);
  assert.equal(dqDisappointedShouldPlay({ prefs: played, outcome: { call: 'dq', at: 41 } }), true);
});

test('reduced motion and missing VP9 alpha use the still, including Safari and iOS', () => {
  assert.equal(dqDisappointedMedia({ reducedMotion: true, canPlayAlpha: true }), 'still');
  assert.equal(dqDisappointedMedia({ reducedMotion: false, canPlayAlpha: false }), 'still');
  assert.equal(dqDisappointedMedia({ reducedMotion: false, canPlayAlpha: true }), 'video');
  const chrome =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const safari =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  assert.equal(canPlayVp9Alpha({ userAgent: chrome, canPlayVp9: true }), true);
  assert.equal(canPlayVp9Alpha({ userAgent: chrome, canPlayVp9: false }), false);
  assert.equal(canPlayVp9Alpha({ userAgent: safari, canPlayVp9: true }), false);
  assert.equal(canPlayVp9Alpha({ userAgent: iphone, canPlayVp9: true }), false);
  assert.equal(
    canPlayVp9Alpha({ userAgent: chrome, platform: 'MacIntel', maxTouchPoints: 5, canPlayVp9: true }),
    false,
  );
  assert.equal(DQ_DISAPPOINTED_STILL, '/assets/kids/dq-disappointed.webp');
  assert.equal(DQ_DISAPPOINTED_VIDEO, '/assets/kids/dq-disappointed-walkoff.webm');
  assert.ok(DQ_DISAPPOINTED_STILL_MS < DQ_DISAPPOINTED_SAFETY_MS);
  assert.ok(DQ_DISAPPOINTED_SAFETY_MS > 7_750);
});

test('the popup dismisses on ended, times out, and does not take taps', () => {
  const popup = readFileSync(new URL('../components/DqDisappointedPopup.tsx', import.meta.url), 'utf8');
  assert.match(popup, /onEnded=\{onFinished\}/);
  assert.match(popup, /DQ_DISAPPOINTED_SAFETY_MS/);
  assert.match(popup, /DQ_DISAPPOINTED_STILL_MS/);
  assert.match(popup, /readDqDisappointedMedia/);
  assert.doesNotMatch(popup, /<video[\s\S]*loop/);
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const start = css.indexOf('.dq-disappointed {');
  assert.ok(start >= 0);
  const block = css.slice(start, start + 280);
  assert.match(block, /pointer-events:\s*none/);
});
