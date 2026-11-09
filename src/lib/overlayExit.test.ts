/**
 * Full-screen overlay exit: Back, Escape, and scroll unlock.
 * Safe-area rules for the expand views that were trapping iPhone.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { armOverlayExit, overlayHistoryId, resetOverlayExitForTests } from './overlayExit.ts';
import { pageScrollIsLocked, resetPageScrollLockForTests } from './pageScrollLock.ts';
import { exitInlineVideoFullscreen, onIosVideoFullscreen } from './fullscreen.ts';

const dom = new Window({ url: 'http://localhost/student?student=1' });
const view = dom as unknown as Window & typeof globalThis;

function install(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

install('window', view);
install('document', view.document);
install('history', view.history);
install('HTMLElement', view.HTMLElement);
install('HTMLInputElement', view.HTMLInputElement);
install('KeyboardEvent', view.KeyboardEvent);
install('Event', view.Event);

function flush(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

test('Back and Escape close the overlay, and Close pops the history entry', async () => {
  resetOverlayExitForTests();
  resetPageScrollLockForTests(document);
  const start = history.length;
  let closes = 0;
  const release = armOverlayExit('assessment-diamond', () => {
    closes += 1;
  }, { lockScroll: true });
  assert.equal(history.length, start + 1);
  assert.equal(overlayHistoryId(), 'assessment-diamond');
  assert.equal(pageScrollIsLocked(document), true);

  history.back();
  assert.equal(closes, 1);
  assert.equal(pageScrollIsLocked(document), false);
  assert.equal(overlayHistoryId(), null);

  closes = 0;
  const again = armOverlayExit('assessment-diamond', () => {
    closes += 1;
  }, { lockScroll: true });
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(closes, 1);
  assert.equal(pageScrollIsLocked(document), false);
  await flush();
  assert.equal(overlayHistoryId(), null);
  again();

  const typed = armOverlayExit('student-technique-picker', () => {
    closes += 1;
  });
  const input = document.createElement('input');
  document.body.appendChild(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(closes, 1, 'Escape in a text field does not close the picker');
  typed();
  input.remove();
  await flush();
  resetPageScrollLockForTests(document);
});

test('Strict Mode remount keeps a single history entry', async () => {
  resetOverlayExitForTests();
  let closes = 0;
  const first = armOverlayExit('lesson-cover', () => {
    closes += 1;
  });
  first();
  const second = armOverlayExit('lesson-cover', () => {
    closes += 1;
  });
  await flush();
  assert.equal(closes, 0);
  assert.equal(overlayHistoryId(), 'lesson-cover');
  second();
  await flush();
  assert.equal(overlayHistoryId(), null);
  assert.equal(closes, 0);
});

test('iOS video fullscreen is exited so the page Close can show', () => {
  const video = document.createElement('video') as HTMLVideoElement & {
    webkitDisplayingFullscreen?: boolean;
    webkitExitFullscreen?: () => void;
  };
  let began = 0;
  let exited = 0;
  video.webkitDisplayingFullscreen = true;
  video.webkitExitFullscreen = () => {
    exited += 1;
    video.webkitDisplayingFullscreen = false;
  };
  const stop = onIosVideoFullscreen(video, () => {
    began += 1;
    exitInlineVideoFullscreen(video);
  });
  video.dispatchEvent(new Event('webkitbeginfullscreen'));
  assert.equal(began, 1);
  assert.equal(exited, 1);
  exitInlineVideoFullscreen(video);
  assert.equal(exited, 1, 'a second exit is a no-op once iOS has left fullscreen');
  stop();
});

test('expand and full-screen Close rules clear the top safe area', () => {
  const diamond = readFileSync(new URL('../pages/student/studentCardLayout.css', import.meta.url), 'utf8');
  const diamondRule = diamond.slice(diamond.indexOf('.sheet-diamond-full {'), diamond.indexOf('.sheet-diamond-full__bar'));
  assert.match(diamondRule, /env\(safe-area-inset-top, 0px\)/);
  assert.match(diamondRule, /env\(safe-area-inset-right, 0px\)/);
  assert.match(diamondRule, /env\(safe-area-inset-bottom, 0px\)/);
  assert.match(diamondRule, /env\(safe-area-inset-left, 0px\)/);
  assert.match(diamond, /\.sheet-diamond-full__body[\s\S]*overflow:\s*auto/);
  assert.match(diamond, /\.sheet-diamond-full__body[\s\S]*touch-action:\s*pan-y/);

  const student = readFileSync(new URL('../student-edition.css', import.meta.url), 'utf8');
  const picker = student.slice(student.indexOf('.student-picker {'), student.indexOf('.student-picker h2'));
  assert.match(picker, /var\(--safe-t\)/);
  assert.match(picker, /var\(--safe-r\)/);
  assert.match(picker, /var\(--safe-b\)/);
  assert.match(picker, /var\(--safe-l\)/);

  const app = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(app, /\.saver\.saver--belt > \.sheet\.sheet--dock-footer \.sheet__head \{[^}]*top:\s*var\(--safe-t\)/);
  const sheetPanel = app.slice(app.indexOf('\n.sheet__panel {'));
  assert.match(sheetPanel.slice(0, sheetPanel.indexOf('}')), /env\(safe-area-inset-top, 0px\)/);
  assert.match(app, /\.replay-player--fs,\s*\.replay-player:fullscreen \{[^}]*env\(safe-area-inset-top, 0px\)/);
  assert.match(app, /\.techniques__chrome \{[^}]*var\(--safe-b\)/);
  assert.match(app, /\.techniques__chrome \{[^}]*var\(--safe-l\)/);
  const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(indexHtml, /viewport-fit=cover/);
});
