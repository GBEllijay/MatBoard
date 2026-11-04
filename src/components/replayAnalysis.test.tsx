/**
 * Video replay analysis card and player, mounted in happy-dom.
 * Plus source checks that the Daily Lesson Plan controls around it are unchanged.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { INSTRUCTOR_PRESETS, visibleCoachControl } from '../lib/instructorSeats.ts';
import { ADD_REPLAY_LABEL, createReplay, type ReplayBlock } from '../lib/replayAnalysis.ts';
import { ReplayAnalysisCard } from './ReplayAnalysisCard.tsx';
import { ReplayPlayer } from './ReplayPlayer.tsx';

const dom = new Window({ url: 'http://localhost/training-notes' });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('sessionStorage', view.sessionStorage);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('navigator', view.navigator);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

type Mounted = { root: Root; host: HTMLElement };

function mount(node: ReactNode): Mounted {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: Mounted) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function buttons(host: ParentNode): HTMLButtonElement[] {
  return [...host.querySelectorAll('button')] as HTMLButtonElement[];
}

function button(host: ParentNode, text: string): HTMLButtonElement {
  const found = buttons(host).find((b) => (b.textContent ?? '').trim() === text);
  assert.ok(found, `button "${text}"`);
  return found;
}

function click(node: Element) {
  act(() => {
    (node as HTMLElement).click();
  });
}

function card(props: Partial<Parameters<typeof ReplayAnalysisCard>[0]> = {}) {
  const replay: ReplayBlock = props.replay ?? createReplay();
  const patches: Partial<ReplayBlock>[] = [];
  const mounted = mount(
    <ReplayAnalysisCard
      replay={replay}
      heading="Video replay analysis"
      dateKey="2026-11-04"
      readOnly={false}
      canCapture
      onChange={(patch) => patches.push(patch)}
      {...props}
    />,
  );
  return { mounted, patches, replay };
}

test('the card offers Record / Pick from gallery through the add-video popup', () => {
  const { mounted, replay } = card();
  const text = mounted.host.textContent ?? '';
  assert.ok(text.includes('Video replay analysis'));
  assert.ok(text.includes('What are we reviewing?'));
  click(button(mounted.host, 'Record or pick video'));
  const page = document.body.textContent ?? '';
  assert.ok(page.includes('Record'), 'Record choice');
  assert.ok(page.includes('Pick from gallery'), 'Pick from gallery choice');
  const record = document.getElementById(`replay-${replay.id}-record`) as HTMLInputElement | null;
  const library = document.getElementById(`replay-${replay.id}-library`) as HTMLInputElement | null;
  assert.ok(record && library);
  assert.equal(record.getAttribute('type'), 'file');
  assert.ok(record.hasAttribute('capture'), 'record opens the camera');
  assert.equal(library.hasAttribute('capture'), false);
  assert.ok(document.querySelector(`label[for="replay-${replay.id}-record"]`));
  assert.ok(document.querySelector(`label[for="replay-${replay.id}-library"]`));
  unmount(mounted);
});

test('a seat without upload permission, or a read-only day, sees no capture controls', () => {
  for (const props of [{ canCapture: false }, { readOnly: true }]) {
    const { mounted, replay } = card(props);
    assert.equal(buttons(mounted.host).some((b) => /Record or pick video/.test(b.textContent ?? '')), false);
    assert.equal(document.getElementById(`replay-${replay.id}-record`), null);
    assert.ok((mounted.host.textContent ?? '').includes('No clip yet.'));
    unmount(mounted);
  }
});

test('typing a title and notes patches the card', () => {
  const { mounted, patches, replay } = card();
  const title = document.getElementById(`replay-${replay.id}-title`) as HTMLInputElement;
  const notes = document.getElementById(`replay-${replay.id}-notes`) as HTMLTextAreaElement;
  assert.ok(title && notes);
  // happy-dom does not drive React's input tracker; call the bound handler like the other page tests.
  const setValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set?.call(el, value);
    const key = Object.keys(el).find((name) => name.startsWith('__reactProps'));
    const props = key ? (el as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    act(() => props?.onChange?.({ target: el, currentTarget: el }));
  };
  setValue(title, 'Round 2');
  setValue(notes, 'Elbows in');
  assert.deepEqual(patches, [{ title: 'Round 2' }, { notes: 'Elbows in' }]);
  unmount(mounted);
});

function player() {
  return mount(<ReplayPlayer src="blob:http://localhost/clip" label="Video replay analysis" frameName="frame.png" />);
}

test('player: paused shows the markup toolbar; Undo and Clear start disabled', () => {
  const mounted = player();
  const toolbar = mounted.host.querySelector('[role="toolbar"][aria-label="Markup"]');
  assert.ok(toolbar);
  for (const label of ['Circle', 'Arrow', 'Pen', 'Undo', 'Clear', 'Save picture']) button(toolbar, label);
  assert.equal(button(toolbar, 'Undo').disabled, true);
  assert.equal(button(toolbar, 'Clear').disabled, true);
  assert.ok(mounted.host.querySelector('[role="slider"][aria-label="Scrub Video replay analysis"]'));
  unmount(mounted);
});

test('player: picking a markup tool turns the frame into a drawing surface', () => {
  const mounted = player();
  const canvas = mounted.host.querySelector('canvas');
  assert.ok(canvas);
  assert.equal(canvas.classList.contains('replay-player__ink--on'), false);
  assert.ok(mounted.host.querySelector('[data-testid="replay-tap-layer"]'));
  const circle = button(mounted.host, 'Circle');
  click(circle);
  assert.equal(circle.getAttribute('aria-pressed'), 'true');
  assert.equal(canvas.classList.contains('replay-player__ink--on'), true);
  assert.equal(mounted.host.querySelector('[data-testid="replay-tap-layer"]'), null);
  click(circle);
  assert.equal(canvas.classList.contains('replay-player__ink--on'), false);
  unmount(mounted);
});

test('player: +10s / −10s buttons and side double-tap move the clip 10 seconds', () => {
  const mounted = player();
  const video = mounted.host.querySelector('video') as HTMLVideoElement;
  assert.ok(video);
  let current = 0;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => current,
    set: (v: number) => {
      current = v;
    },
  });
  Object.defineProperty(video, 'duration', { configurable: true, get: () => 60 });
  click(button(mounted.host, '+10s'));
  assert.equal(current, 10);
  click(button(mounted.host, '−10s'));
  assert.equal(current, 0);

  const taps = mounted.host.querySelector('[data-testid="replay-tap-layer"]') as HTMLElement;
  taps.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  const tap = (x: number) =>
    act(() => {
      taps.dispatchEvent(new view.PointerEvent('pointerup', { bubbles: true, clientX: x }) as unknown as Event);
    });
  tap(90);
  assert.equal(current, 0, 'a single tap does not skip');
  tap(90);
  assert.equal(current, 10, 'double-tap right skips forward');
  tap(10);
  tap(10);
  assert.equal(current, 0, 'double-tap left skips back');
  unmount(mounted);
});

test('player: drawing a circle enables Undo and Clear; Undo after Clear restores it', () => {
  const mounted = player();
  click(button(mounted.host, 'Circle'));
  const canvas = mounted.host.querySelector('canvas') as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  const fire = (type: string, x: number, y: number) =>
    act(() => {
      canvas.dispatchEvent(new view.PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }) as unknown as Event);
    });
  fire('pointerdown', 20, 20);
  fire('pointermove', 80, 70);
  fire('pointerup', 80, 70);
  const undo = button(mounted.host, 'Undo');
  const clear = button(mounted.host, 'Clear');
  assert.equal(undo.disabled, false);
  assert.equal(clear.disabled, false);
  click(clear);
  assert.equal(clear.disabled, true);
  assert.equal(undo.disabled, false);
  click(undo);
  assert.equal(clear.disabled, false, 'undo after clear brings the circle back');
  click(undo);
  assert.equal(clear.disabled, true);
  assert.equal(undo.disabled, true);
  unmount(mounted);
});

test('seat rule: Assistant coach can capture, Program director cannot, owner can', () => {
  const preset = (id: string) => INSTRUCTOR_PRESETS.find((p) => p.id === id)!;
  const seat = (id: string) => ({ status: 'active' as const, permissions: { ...preset(id).permissions } });
  assert.equal(visibleCoachControl('uploadForDistribution', { owner: true, seat: null }), true);
  assert.equal(visibleCoachControl('uploadForDistribution', { owner: true, seat: seat('assistant-coach') }), true);
  assert.equal(visibleCoachControl('uploadForDistribution', { owner: true, seat: seat('program-director') }), false);
});

test('Daily Lesson Plan keeps its controls and adds the replay button beside them', () => {
  const src = readFileSync('src/pages/TrainingNotes.tsx', 'utf8');
  for (const needle of ['Add technique', 'Add game', '{ADD_REPLAY_LABEL}', '<BlockTools', 'addLessonTechnique', 'addLessonGame', 'moveLessonBlock', 'removeLessonBlock']) {
    assert.ok(src.includes(needle), needle);
  }
  assert.equal(ADD_REPLAY_LABEL, 'Add video replay analysis section');
  // The card only renders for replay blocks, never for a technique, warm-up or game.
  const cardUses = src.split('<ReplayAnalysisCard').length - 1;
  assert.equal(cardUses, 2, 'block list + competition section');
  assert.ok(/block\.kind === 'replay' && replay \? \(\s*<ReplayAnalysisCard/.test(src));
  // Capture follows the existing seat permission.
  assert.ok(src.includes("visibleCoachControl('uploadForDistribution'"));
});
