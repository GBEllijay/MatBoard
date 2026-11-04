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
import { ANNOTATED_FALLBACK_COPY } from '../lib/annotatedReplay.ts';
import { SWIPE_BLOCK_SELECTOR, coachSwipeTarget, swipeGestureBlocked } from '../lib/coachSwipe.ts';
import { INSTRUCTOR_PRESETS, canCaptureReplay, replayCaptureAccess, visibleCoachControl } from '../lib/instructorSeats.ts';
import { ADD_REPLAY_LABEL, createReplay, type ReplayBlock } from '../lib/replayAnalysis.ts';
import { STANDALONE_REVIEW_KEY } from '../lib/recordForReviewStore.ts';
import { TRAINING_NOTES_STORAGE_KEY } from '../lib/trainingNotesStore.ts';
import { ReplayAnalysisCard } from './ReplayAnalysisCard.tsx';
import { ReplayPlayer } from './ReplayPlayer.tsx';
import type { ReplaySaveKind } from '../lib/replayAnalysis.ts';
import type { ReplaySaveResult } from '../lib/replaySave.ts';

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
installGlobal('Element', view.Element);
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

test('replay capture: owner/Coach/Instructors direct, Assistant coach and Program director pending, revoked none', () => {
  const preset = (id: string) => INSTRUCTOR_PRESETS.find((p) => p.id === id)!;
  const seat = (id: string, status: 'active' | 'revoked' = 'active') => ({
    status,
    presetId: id as never,
    permissions: { ...preset(id).permissions },
  });
  assert.equal(replayCaptureAccess({ owner: true, seat: null }), 'direct');
  assert.equal(replayCaptureAccess({ owner: false, seat: null }), 'none');
  assert.equal(replayCaptureAccess({ owner: true, seat: seat('coach') }), 'direct');
  assert.equal(replayCaptureAccess({ owner: true, seat: seat('instructors') }), 'direct');
  assert.equal(replayCaptureAccess({ owner: true, seat: seat('assistant-coach') }), 'pending');
  assert.equal(replayCaptureAccess({ owner: true, seat: seat('program-director') }), 'pending');
  assert.equal(replayCaptureAccess({ owner: true, seat: seat('program-director', 'revoked') }), 'none');
  assert.equal(canCaptureReplay({ owner: true, seat: seat('program-director') }), true);
  // The PD preset itself is unchanged.
  assert.equal(preset('program-director').permissions.uploadForDistribution, false);
  assert.equal(preset('program-director').permissions.dailyLessonPlanAccess, false);
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
  // Private lesson sits in the template picker with its own confirm copy.
  assert.ok(src.includes("template === 'private'"));
  assert.ok(src.includes('LESSON_TEMPLATES.map'));
  // Capture follows the replay-only seat rule.
  assert.ok(src.includes('replayCanCapture({ owner: true, seat })'));
});

// ---------- Competition curriculum: three per-block modes + Record for Review ----------

function curriculumCards(host: ParentNode): HTMLElement[] {
  return [...host.querySelectorAll('section.notes__card[aria-labelledby^="curriculum-"]')] as HTMLElement[];
}

function cardTitled(host: ParentNode, title: string): HTMLElement {
  const found = curriculumCards(host).find((el) => (el.querySelector('h2')?.textContent ?? '').trim() === title);
  assert.ok(found, `curriculum card "${title}"`);
  return found;
}

async function curriculumPage() {
  localStorage.clear();
  const { CompetitionCurriculumPage } = await import('../pages/CompetitionCurriculum.tsx');
  return mount(<CompetitionCurriculumPage embedded />);
}

test('curriculum: clock blocks offer Timer only / Looping video / Record for replay', async () => {
  const mounted = await curriculumPage();
  const groups = [...mounted.host.querySelectorAll('[role="radiogroup"].curriculum__modes')];
  assert.ok(groups.length >= 4, 'warm-up, body, takedown, specific each have modes');
  for (const group of groups) {
    const labels = [...group.querySelectorAll('[role="radio"]')].map((el) => (el.textContent ?? '').trim());
    assert.deepEqual(labels, ['Timer only', 'Looping video', 'Record for replay']);
  }
  unmount(mounted);
});

test('curriculum: Record for replay shows the replay recorder and hides the round timer; Timer only restores it', async () => {
  const mounted = await curriculumPage();
  const first = curriculumCards(mounted.host)[0];
  const title = (first.querySelector('h2')?.textContent ?? '').trim();
  assert.ok(buttons(first).some((b) => (b.textContent ?? '').includes('Open round timer')));
  assert.equal(first.querySelector('.replay-card--embedded'), null);
  click(button(first, 'Record for replay'));
  let card = cardTitled(mounted.host, title);
  assert.ok(card.querySelector('.replay-card--embedded'), 'replay recorder appears');
  assert.ok(buttons(card).some((b) => (b.textContent ?? '').trim() === 'Record or pick video'));
  assert.equal(buttons(card).some((b) => (b.textContent ?? '').includes('Open round timer')), false);
  assert.equal(card.querySelector('.replay-card__heading'), null, 'embedded: no second heading');
  click(button(card, 'Looping video'));
  card = cardTitled(mounted.host, title);
  assert.equal(card.querySelector('.replay-card--embedded'), null);
  click(button(card, 'Timer only'));
  card = cardTitled(mounted.host, title);
  assert.equal(card.querySelector('.replay-card--embedded'), null);
  assert.ok(buttons(card).some((b) => (b.textContent ?? '').includes('Open round timer')));
  unmount(mounted);
});

test('curriculum: Record for Review is on Live Rounds and Specific Training among the starter blocks; it keeps the timer', async () => {
  const mounted = await curriculumPage();
  const blockSwitches = curriculumCards(mounted.host)
    .map((card) => [(card.querySelector('h2')?.textContent ?? '').trim(), card.querySelector('[data-record-review]')] as const)
    .filter(([, sw]) => sw);
  const titles = blockSwitches.map(([t]) => t);
  assert.equal(titles.length, 2, titles.join(','));
  assert.ok(titles.some((t) => /live/i.test(t)), 'live');
  assert.ok(titles.some((t) => /specific/i.test(t)), 'specific');
  for (const card of curriculumCards(mounted.host)) {
    const h = (card.querySelector('h2')?.textContent ?? '').trim();
    if (/warm|body|takedown|technique|cool/i.test(h)) assert.equal(card.querySelector('[data-record-review]'), null, h);
  }
  const title = titles.find((t) => /live/i.test(t)) as string;
  const sw = cardTitled(mounted.host, title).querySelector('[data-record-review]') as HTMLButtonElement;
  assert.equal(sw.getAttribute('aria-checked'), 'false');
  assert.equal(sw.getAttribute('role'), 'switch');
  click(sw);
  const card = cardTitled(mounted.host, title);
  const on = card.querySelector('[data-record-review]') as HTMLButtonElement;
  assert.equal(on.getAttribute('aria-checked'), 'true');
  assert.ok(card.querySelector('.replay-card--embedded'), 'recorder appears');
  assert.ok(buttons(card).some((b) => (b.textContent ?? '').includes('Open round timer')), 'timer stays');
  click(on);
  assert.equal(cardTitled(mounted.host, title).querySelector('.replay-card--embedded'), null);
  unmount(mounted);
});

test('curriculum: the Closing (outro) section offers Record for Review and shows the recorder when on', async () => {
  const mounted = await curriculumPage();
  const label = mounted.host.querySelector('[aria-label="Record for Review for Closing"]') as HTMLButtonElement;
  assert.ok(label, 'closing switch');
  click(label);
  const on = mounted.host.querySelector('[aria-label="Record for Review for Closing"]') as HTMLButtonElement;
  assert.equal(on.getAttribute('aria-checked'), 'true');
  assert.ok(on.parentElement?.querySelector('.replay-card--embedded'));
  unmount(mounted);
});

test('Daily Lesson Plan source: Intro, Specific Training and Closing carry Record for Review; Cool down does not', () => {
  const src = readFileSync('src/pages/TrainingNotes.tsx', 'utf8');
  for (const kind of ['intro', 'specific', 'closing']) assert.ok(src.includes(`blockOffersReviewToggle('${kind}')`), kind);
  assert.equal(src.includes("blockOffersReviewToggle('cooldown')"), false);
});

test('player: Restart returns the clip to 0:00 and pauses', () => {
  const mounted = player();
  const video = mounted.host.querySelector('video') as HTMLVideoElement;
  let current = 0;
  let paused = 0;
  Object.defineProperty(video, 'currentTime', { configurable: true, get: () => current, set: (v: number) => { current = v; } });
  Object.defineProperty(video, 'duration', { configurable: true, get: () => 60 });
  video.pause = () => { paused += 1; };
  click(button(mounted.host, '+10s'));
  click(button(mounted.host, '+10s'));
  assert.equal(current, 20);
  click(button(mounted.host, 'Restart'));
  assert.equal(current, 0);
  assert.equal(paused, 1);
  unmount(mounted);
});

test('curriculum source: modes and toggle come from the shared lists; Program director cannot capture', () => {
  const src = readFileSync('src/pages/CompetitionCurriculum.tsx', 'utf8');
  assert.ok(src.includes('CURRICULUM_TIMINGS.map'));
  assert.ok(src.includes('blockOffersReviewToggle(block.kind)'));
  assert.ok(src.includes('replayCanCapture({ owner: true, seat })'));
  assert.ok(src.includes('Open round timer'));
  assert.ok(src.includes('<LessonMediaRail'));
});


function pictureHarness(targets: ReplaySaveKind[], result: (kind: ReplaySaveKind) => ReplaySaveResult) {
  const calls: ReplaySaveKind[] = [];
  const mounted = mount(
    <ReplayPlayer
      src="blob:http://localhost/clip"
      label="Video replay analysis"
      frameName="frame.png"
      dateKey="2026-11-04"
      pictureTargets={() => targets}
      captureFrame={async () => new Blob([Uint8Array.from([1])], { type: 'image/png' })}
      savePicture={async (kind) => {
        calls.push(kind);
        return result(kind);
      }}
    />,
  );
  const video = mounted.host.querySelector('video') as HTMLVideoElement;
  Object.defineProperty(video, 'duration', { configurable: true, get: () => 60 });
  act(() => {
    video.dispatchEvent(new view.Event('durationchange') as unknown as Event);
  });
  return { mounted, calls };
}

function pictureOptions(host: ParentNode): string[] {
  return [...host.querySelectorAll('[data-picture-target]')].map((el) => el.getAttribute('data-picture-target') ?? '');
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test('Save picture opens a choice; nothing saves until the coach picks', () => {
  const { mounted, calls } = pictureHarness(['advantage-cloud'], () => ({ ok: true, kind: 'advantage-cloud', ref: 'x' }));
  assert.deepEqual(pictureOptions(mounted.host), []);
  click(button(mounted.host, 'Save picture'));
  assert.deepEqual(pictureOptions(mounted.host), ['device', 'advantage-cloud']);
  assert.deepEqual(calls, []);
  unmount(mounted);
});

test('Save picture options follow access: device always, Cloud and Drives only when available', () => {
  for (const targets of [[], ['advantage-cloud'], ['google-drive'], ['onedrive'], ['advantage-cloud', 'google-drive', 'onedrive']] as ReplaySaveKind[][]) {
    const { mounted } = pictureHarness(targets, (kind) => ({ ok: true, kind, ref: 'x' }));
    click(button(mounted.host, 'Save picture'));
    assert.deepEqual(pictureOptions(mounted.host), ['device', ...targets]);
    unmount(mounted);
  }
});

test('each Save picture choice calls its own save path and says how it went', async () => {
  for (const kind of ['advantage-cloud', 'google-drive', 'onedrive'] as ReplaySaveKind[]) {
    const { mounted, calls } = pictureHarness(['advantage-cloud', 'google-drive', 'onedrive'], (k) => ({ ok: true, kind: k, ref: 'x' }));
    click(button(mounted.host, 'Save picture'));
    click(mounted.host.querySelector(`[data-picture-target="${kind}"]`)!);
    await flush();
    assert.deepEqual(calls, [kind]);
    assert.match(mounted.host.querySelector('[data-picture-message]')?.textContent ?? '', /^Picture saved to /);
    unmount(mounted);
  }
  // Pending (assistant coach / program director) and failure messages.
  const pending = pictureHarness(['advantage-cloud'], () => ({ ok: true, kind: 'advantage-cloud', ref: 'x', pending: true }));
  click(button(pending.mounted.host, 'Save picture'));
  click(pending.mounted.host.querySelector('[data-picture-target="advantage-cloud"]')!);
  await flush();
  assert.match(pending.mounted.host.querySelector('[data-picture-message]')?.textContent ?? '', /head coach for approval/);
  unmount(pending.mounted);
  const failed = pictureHarness(['google-drive'], () => ({ ok: false, message: 'Connect Google Drive in Settings first.' }));
  click(button(failed.mounted.host, 'Save picture'));
  click(failed.mounted.host.querySelector('[data-picture-target="google-drive"]')!);
  await flush();
  assert.match(failed.mounted.host.querySelector('[data-picture-message]')?.textContent ?? '', /^Picture not saved to Google Drive\./);
  unmount(failed.mounted);
  // This device downloads the PNG and never calls a cloud path.
  const device = pictureHarness(['advantage-cloud'], () => ({ ok: true, kind: 'advantage-cloud', ref: 'x' }));
  const realCreate = URL.createObjectURL;
  URL.createObjectURL = () => 'blob:http://localhost/frame';
  click(button(device.mounted.host, 'Save picture'));
  click(device.mounted.host.querySelector('[data-picture-target="device"]')!);
  await flush();
  URL.createObjectURL = realCreate;
  assert.deepEqual(device.calls, []);
  assert.equal(device.mounted.host.querySelector('[data-picture-message]')?.textContent, 'Picture saved to this device.');
  unmount(device.mounted);
});

function withDuration(mounted: Mounted) {
  const video = mounted.host.querySelector('video') as HTMLVideoElement;
  Object.defineProperty(video, 'duration', { configurable: true, get: () => 60 });
  let current = 12;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => current,
    set: (value: number) => {
      current = value;
    },
  });
  act(() => {
    video.dispatchEvent(new view.Event('durationchange') as unknown as Event);
  });
  return video;
}

test('drawing on Record for Review does not navigate to Daily Training Videos', () => {
  const mounted = player();
  click(button(mounted.host, 'Arrow'));
  const root = mounted.host.querySelector('.replay-player') as HTMLElement;
  const canvas = mounted.host.querySelector('canvas') as HTMLElement;
  assert.equal(root.hasAttribute('data-coach-no-swipe'), true);
  assert.equal(root.classList.contains('replay-player'), true);
  assert.equal(swipeGestureBlocked(canvas), true);
  assert.match(SWIPE_BLOCK_SELECTOR, /\.replay-player/);
  assert.equal(coachSwipeTarget('/notes', 'left'), '/techniques');
  let reached = 0;
  const onStart = () => {
    reached += 1;
  };
  document.addEventListener('touchstart', onStart);
  act(() => {
    canvas.dispatchEvent(new view.Event('touchstart', { bubbles: true }) as unknown as Event);
  });
  document.removeEventListener('touchstart', onStart);
  assert.equal(reached, 0, 'the stroke never reaches the page swipe');
  unmount(mounted);
});

test('fullscreen keeps Arrow selected, the play bar tappable, and drawing on the paused frame', async () => {
  const mounted = player();
  const root = mounted.host.querySelector('.replay-player') as HTMLElement;
  const video = withDuration(mounted);
  click(button(mounted.host, 'Arrow'));
  click(button(mounted.host, 'Full screen'));
  await flush();
  assert.equal(root.getAttribute('data-fullscreen'), 'true');
  assert.equal(root.classList.contains('replay-player--fs'), true);
  assert.equal(root.classList.contains('replay-player--overlay'), true, 'happy-dom has no element fullscreen, so the iOS overlay is used');
  assert.equal(button(mounted.host, 'Arrow').getAttribute('aria-pressed'), 'true');
  const stage = root.querySelector('.replay-player__stage') as HTMLElement;
  const playBar = root.querySelector('[data-play-bar]') as HTMLElement;
  const scrub = root.querySelector('[role="slider"]') as HTMLElement;
  assert.equal(stage.contains(playBar), false);
  assert.equal(stage.contains(scrub), false);
  assert.ok(playBar.querySelector('button'));
  const before = video.currentTime;
  click(button(playBar, '+10s'));
  assert.equal(video.currentTime, before + 10);
  const canvas = root.querySelector('canvas') as HTMLCanvasElement;
  assert.equal(canvas.classList.contains('replay-player__ink--on'), true);
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  act(() => {
    canvas.dispatchEvent(new view.PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1 }) as unknown as Event);
    canvas.dispatchEvent(new view.PointerEvent('pointermove', { bubbles: true, clientX: 80, clientY: 40, pointerId: 1 }) as unknown as Event);
    canvas.dispatchEvent(new view.PointerEvent('pointerup', { bubbles: true, clientX: 80, clientY: 40, pointerId: 1 }) as unknown as Event);
  });
  assert.equal(button(mounted.host, 'Undo').disabled, false);
  assert.equal(root.getAttribute('data-fullscreen'), 'true', 'drawing does not leave full screen');
  assert.equal(button(mounted.host, 'Arrow').getAttribute('aria-pressed'), 'true');
  click(button(mounted.host, 'Exit full screen'));
  await flush();
  assert.equal(root.getAttribute('data-fullscreen'), 'false');
  assert.equal(button(mounted.host, 'Arrow').getAttribute('aria-pressed'), 'true');
  unmount(mounted);
});

test('the Fullscreen API path stays up with a tool selected when the browser supports it', async () => {
  const mounted = player();
  const root = mounted.host.querySelector('.replay-player') as HTMLElement;
  const previous = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
  const previousExit = document.exitFullscreen;
  let current: Element | null = null;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
  root.requestFullscreen = (async () => {
    current = root;
  }) as HTMLElement['requestFullscreen'];
  document.exitFullscreen = async () => {
    current = null;
  };
  try {
    click(button(mounted.host, 'Pen'));
    click(button(mounted.host, 'Full screen'));
    await flush();
    assert.equal(root.getAttribute('data-fullscreen-mode'), 'api');
    assert.equal(root.classList.contains('replay-player--overlay'), false);
    assert.equal(button(mounted.host, 'Pen').getAttribute('aria-pressed'), 'true');
    assert.ok(root.querySelector('[data-play-bar]'));
    click(button(mounted.host, 'Exit full screen'));
    await flush();
    assert.equal(root.getAttribute('data-fullscreen'), 'false');
    assert.equal(button(mounted.host, 'Pen').getAttribute('aria-pressed'), 'true');
  } finally {
    if (previous) Object.defineProperty(document, 'fullscreenElement', previous);
    else delete (document as { fullscreenElement?: Element | null }).fullscreenElement;
    document.exitFullscreen = previousExit;
    unmount(mounted);
  }
});

test('play controls wrap inside the player so a phone-width row can shrink', () => {
  const css = readFileSync('src/index.css', 'utf8');
  assert.match(css, /\.replay-player \{[^}]*min-width:\s*0/);
  assert.match(css, /\.replay-player__controls[\s\S]*flex-wrap:\s*wrap/);
  assert.match(css, /\.replay-player__controls \.btn \{[^}]*flex:\s*1 1 4\.5rem/);
  assert.match(css, /\.replay-player--fs[\s\S]*flex-direction:\s*column/);
  assert.match(css, /\.replay-player--fs \.replay-player__controls[\s\S]*order:\s*4/);
});

test('annotated save hands the burned file to the existing save and does not send it', async () => {
  const calls: { kind: string; picture: boolean; size: number }[] = [];
  const mounted = mount(
    <ReplayPlayer
      src="blob:http://localhost/clip"
      label="Video replay analysis"
      frameName="frame.png"
      dateKey="2026-11-04"
      pictureTargets={() => ['advantage-cloud', 'google-drive']}
      clipBlob={new Blob(['raw'], { type: 'video/mp4' })}
      clipMime="video/mp4"
      captureFrame={async () => new Blob([Uint8Array.from([1])], { type: 'image/png' })}
      recordClip={async () => ({ burned: true, blob: new Blob(['burned'], { type: 'video/mp4' }), mime: 'video/mp4' })}
      saveAnnotated={async (kind, blob, _mime, picture) => {
        calls.push({ kind, picture, size: blob.size });
        return { ok: true, kind, ref: 'cloud-ref' };
      }}
    />,
  );
  withDuration(mounted);
  assert.equal(mounted.host.querySelector('[data-annotated-target]'), null);
  click(button(mounted.host, 'Save annotated video'));
  assert.deepEqual(
    [...mounted.host.querySelectorAll('[data-annotated-target]')].map((el) => el.getAttribute('data-annotated-target')),
    ['device', 'advantage-cloud', 'google-drive'],
  );
  assert.equal(calls.length, 0);
  click(mounted.host.querySelector('[data-annotated-target="advantage-cloud"]')!);
  await flush();
  assert.deepEqual(calls, [{ kind: 'advantage-cloud', picture: false, size: 6 }]);
  assert.match(mounted.host.querySelector('[data-annotated-message]')?.textContent ?? '', /Annotated video saved to Advantage Cloud/);
  unmount(mounted);
});

test('when burn-in is unavailable, annotated save sends the clip and a still through the same save', async () => {
  const calls: { picture: boolean; type: string }[] = [];
  const mounted = mount(
    <ReplayPlayer
      src="blob:http://localhost/clip"
      label="Video replay analysis"
      frameName="frame.png"
      pictureTargets={() => ['google-drive']}
      clipBlob={new Blob(['raw-clip'], { type: 'video/mp4' })}
      clipMime="video/mp4"
      captureFrame={async () => new Blob([Uint8Array.from([2])], { type: 'image/png' })}
      recordClip={async () => ({ burned: false, reason: ANNOTATED_FALLBACK_COPY })}
      saveAnnotated={async (kind, blob, mime, picture) => {
        calls.push({ picture, type: mime || blob.type });
        return { ok: true, kind, ref: 'drive' };
      }}
    />,
  );
  withDuration(mounted);
  click(button(mounted.host, 'Save annotated video'));
  click(mounted.host.querySelector('[data-annotated-target="google-drive"]')!);
  await flush();
  assert.deepEqual(calls, [
    { picture: false, type: 'video/mp4' },
    { picture: true, type: 'image/png' },
  ]);
  assert.match(mounted.host.querySelector('[data-annotated-message]')?.textContent ?? '', /cannot bake the drawings/);
  unmount(mounted);
});

test('standalone Record for Review works with no lesson plan', async () => {
  localStorage.clear();
  const { RecordForReviewPage } = await import('../pages/RecordForReview.tsx');
  const mounted = mount(<RecordForReviewPage />);
  assert.match(mounted.host.textContent ?? '', /Record for Review/);
  assert.ok(button(mounted.host, 'Record or pick video'));
  assert.equal(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY), null);
  const saved = localStorage.getItem(STANDALONE_REVIEW_KEY);
  assert.ok(saved, 'the standalone tool stores its own review');
  assert.equal(JSON.parse(saved).clip, undefined);
  assert.ok(mounted.host.querySelector('section.replay-card'));
  assert.equal(mounted.host.querySelector('.replay-player'), null, 'no clip yet, so the shared card is waiting');
  const page = readFileSync('src/pages/RecordForReview.tsx', 'utf8');
  const notes = readFileSync('src/pages/TrainingNotes.tsx', 'utf8');
  assert.match(page, /<ReplayAnalysisCard/);
  assert.doesNotMatch(page, /TRAINING_NOTES_STORAGE_KEY|loadTrainingArchive/);
  assert.match(notes, /<ReviewSlotControls/);
  assert.match(notes, /<ReplayAnalysisCard/);
  unmount(mounted);
});
