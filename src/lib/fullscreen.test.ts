import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { exitPageFullscreen, fullscreenElement, requestElementFullscreen } from './fullscreen.ts';
import { LESSON_COVER_HOME_HINT } from './lessonScreenCover.ts';

type FakeEl = {
  className?: string;
  requestFullscreen?: (options?: { navigationUI?: 'hide' }) => Promise<void>;
  webkitRequestFullscreen?: () => void;
};

const state: {
  element: FakeEl | null;
  webkitElement: FakeEl | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
} = {
  element: null,
  webkitElement: null,
};

function installDocument() {
  state.element = null;
  state.webkitElement = null;
  state.exitFullscreen = undefined;
  state.webkitExitFullscreen = undefined;
  const doc = {
    get fullscreenElement() {
      return state.element;
    },
    get webkitFullscreenElement() {
      return state.webkitElement;
    },
    fullscreenEnabled: false,
    webkitFullscreenEnabled: false,
    documentElement: { className: 'root' } as FakeEl,
    exitFullscreen: () => state.exitFullscreen?.() ?? Promise.resolve(),
    webkitExitFullscreen: () => state.webkitExitFullscreen?.(),
  };
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
  return doc;
}

test('Chromium fullscreen is requestFullscreen on the cover element', async () => {
  installDocument();
  state.element = null;
  const cover: FakeEl = { className: 'notes-cover' };
  let options: { navigationUI?: 'hide' } | undefined;
  cover.requestFullscreen = async (next) => {
    options = next;
    state.element = cover;
  };
  const result = await requestElementFullscreen(cover as unknown as HTMLElement);
  assert.equal(result, 'standard');
  assert.equal(options?.navigationUI, 'hide');
  assert.equal(fullscreenElement(), cover);
});

test('WebKit fullscreen uses the prefixed request when the standard API is missing', async () => {
  installDocument();
  state.element = null;
  state.webkitElement = null;
  const cover: FakeEl = { className: 'notes-cover' };
  let called = 0;
  cover.webkitRequestFullscreen = () => {
    called += 1;
    state.webkitElement = cover;
  };
  const result = await requestElementFullscreen(cover as unknown as HTMLElement);
  assert.equal(result, 'webkit');
  assert.equal(called, 1);
  assert.equal(fullscreenElement(), cover);

  let exited = 0;
  state.exitFullscreen = undefined;
  const doc = document as Document & { exitFullscreen?: () => Promise<void>; webkitExitFullscreen?: () => void };
  doc.exitFullscreen = undefined;
  state.webkitExitFullscreen = () => {
    exited += 1;
    state.webkitElement = null;
  };
  await exitPageFullscreen();
  assert.equal(exited, 1);
  assert.equal(fullscreenElement(), null);
});

test('a rejected standard request falls through to the webkit prefix', async () => {
  installDocument();
  state.element = null;
  state.webkitElement = null;
  const cover: FakeEl = { className: 'notes-cover' };
  cover.requestFullscreen = async () => {
    throw new Error('not allowed');
  };
  cover.webkitRequestFullscreen = () => {
    state.webkitElement = cover;
  };
  assert.equal(await requestElementFullscreen(cover as unknown as HTMLElement), 'webkit');
  assert.equal(fullscreenElement(), cover);
});

test('iOS Safari without element fullscreen stays unsupported and the cover uses 100dvh', async () => {
  installDocument();
  const cover: FakeEl = { className: 'notes-cover' };
  assert.equal(await requestElementFullscreen(cover as unknown as HTMLElement), 'unsupported');
  assert.equal(fullscreenElement(), null);
  assert.equal(LESSON_COVER_HOME_HINT, 'Add this site to the Home Screen for full coverage.');

  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const coverSource = readFileSync(new URL('../components/LessonScreenCover.tsx', import.meta.url), 'utf8');
  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /\.notes-cover[\s\S]*height:\s*100dvh/);
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /lesson-cover-open[\s\S]*overflow:\s*hidden/);
  assert.match(coverSource, /notes-cover--fallback/);
  assert.match(coverSource, /LESSON_COVER_HOME_HINT/);
});
