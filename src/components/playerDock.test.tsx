/**
 * Play and fullscreen sit on the player. A lesson-plan clip opens there
 * and does not leave the plan.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { LessonSectionVideo } from './LessonSectionVideo.tsx';
import { lessonClipLoopMs } from '../lib/lessonPlayback.ts';
import { emptyVideoPlan, setSlotDrill } from '../lib/techniqueLogic.ts';

const dom = new Window({ url: 'http://localhost/notes?from=coach' });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('navigator', view.navigator);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('Element', view.Element);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let fullscreenNode: Element | null = null;
const playedMuted: boolean[] = [];

function installVideo() {
  playedMuted.length = 0;
  view.HTMLVideoElement.prototype.play = function play(this: HTMLVideoElement) {
    playedMuted.push(this.muted);
    return Promise.resolve();
  };
  view.HTMLVideoElement.prototype.pause = () => undefined;
}

function installFullscreen() {
  fullscreenNode = null;
  installVideo();
  const proto = view.HTMLElement.prototype as HTMLElement & {
    requestFullscreen?: (options?: { navigationUI?: 'hide' }) => Promise<void>;
    webkitRequestFullscreen?: () => void;
  };
  proto.requestFullscreen = function requestFullscreen() {
    fullscreenNode = this;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  };
  delete proto.webkitRequestFullscreen;
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenNode });
  document.exitFullscreen = async () => {
    fullscreenNode = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  };
}

function installCssFullscreen() {
  fullscreenNode = null;
  installVideo();
  const proto = view.HTMLElement.prototype as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => void;
  };
  proto.requestFullscreen = () => Promise.resolve();
  delete proto.webkitRequestFullscreen;
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  Object.defineProperty(document, 'webkitFullscreenEnabled', { configurable: true, get: () => false });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
  Object.defineProperty(document, 'webkitFullscreenElement', { configurable: true, get: () => null });
}

function mount(node: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={['/notes?from=coach']}>{node}</MemoryRouter>);
  });
  return { host, root };
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
  });
}

function buttonNamed(host: ParentNode, name: string) {
  const found = [...host.querySelectorAll('button')].find((item) => {
    const label = item.getAttribute('aria-label');
    return label === name || item.textContent?.trim() === name;
  });
  assert.ok(found, name);
  return found as HTMLButtonElement;
}

function PlanProbe({ clipUrl }: { clipUrl?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output data-path="">{`${location.pathname}${location.search}`}</output>
      <LessonSectionVideo
        showVideo
        label="Warm-up"
        clipUrl={clipUrl}
        mediaName={clipUrl ? 'Warm.mp4' : ''}
        loopMs={clipUrl ? 8 * 60 * 1000 : undefined}
        onOpenBoard={() => navigate('/techniques?focus=1&section=warmup')}
      />
    </>
  );
}

test('lesson clip loop uses the technique time, and a manual length still wins', () => {
  const plan = {
    warmupExpected: '8',
    cooldownExpected: '',
    techniques: [{ expected: '8' }, { expected: '12' }],
  };
  let videos = emptyVideoPlan();
  const technique = videos.slots.find((slot) => slot.kind === 'technique');
  assert.ok(technique);
  assert.equal(lessonClipLoopMs(plan, videos, { role: 'technique', index: 0 }), 8 * 60 * 1000);
  assert.equal(lessonClipLoopMs(plan, videos, { role: 'technique', index: 1 }), 12 * 60 * 1000);
  videos = setSlotDrill(videos, technique.slotId, 150);
  assert.equal(lessonClipLoopMs(plan, videos, { role: 'technique', index: 0 }), 150 * 1000);
  assert.equal(lessonClipLoopMs(plan, videos, { role: 'warmup' }), 8 * 60 * 1000);
  assert.equal(lessonClipLoopMs(plan, null, { role: 'cooldown' }), 5 * 60 * 1000);
});

test('a lesson-plan video plays inline and fullscreen stays on that player', async () => {
  installFullscreen();
  const { host, root } = mount(<PlanProbe clipUrl="https://example.com/warm.mp4" />);
  assert.equal(host.querySelector('[data-path]')?.textContent, '/notes?from=coach');
  assert.equal(host.querySelector('[data-lesson-player]'), null);

  await click(buttonNamed(host, 'Play Warm-up'));

  assert.equal(host.querySelector('[data-path]')?.textContent, '/notes?from=coach');
  assert.equal(host.querySelector('[data-lesson-player]'), host.querySelector('[data-player]')?.parentElement);
  const player = host.querySelector('[data-player]');
  assert.ok(player);
  const video = player.querySelector('video');
  const dock = player.querySelector('[data-player-dock]');
  assert.ok(video);
  assert.ok(dock);
  assert.equal(dock.parentElement?.parentElement, player);
  assert.equal(host.querySelector('header [data-player-dock]'), null);
  assert.match(player.textContent ?? '', /Loop/);
  assert.match(player.textContent ?? '', /08:00/);
  assert.equal(host.querySelector('.notes__video-name')?.textContent, 'Warm.mp4');
  assert.equal(buttonNamed(dock, 'Stop').disabled, false);
  assert.equal(buttonNamed(dock, 'Start').disabled, true);

  await click(buttonNamed(dock, 'Fullscreen'));

  assert.equal(host.querySelector('[data-path]')?.textContent, '/notes?from=coach');
  assert.equal(fullscreenNode, host.querySelector('[data-lesson-player]'));
  assert.equal(player.querySelector('[data-player-dock]'), null);
  assert.equal(player.querySelectorAll('button').length, 0);
  assert.equal((player.querySelector('video') as HTMLVideoElement).controls, false);
  assert.match(player.textContent ?? '', /Loop/);
  assert.match(player.textContent ?? '', /08:00/);
  assert.equal([...host.querySelectorAll('button')].some((button) => /Exit fullscreen|Start|Stop|Mute|Unmute/.test(button.textContent ?? '')), false);

  const frame = player.querySelector('.techniques__frame') as HTMLElement;
  await act(async () => {
    frame.click();
  });
  assert.equal(fullscreenNode, null);
  assert.equal(host.querySelector('[data-path]')?.textContent, '/notes?from=coach');
  assert.equal(buttonNamed(host, 'Fullscreen').className.includes('play-fs'), true);

  await act(async () => {
    root.unmount();
  });
});

test('an empty lesson slot still opens Daily Training Videos', async () => {
  installFullscreen();
  const { host, root } = mount(<PlanProbe />);
  await click(buttonNamed(host, 'Open Daily Training Videos for Warm-up'));
  assert.equal(host.querySelector('[data-path]')?.textContent, '/techniques?focus=1&section=warmup');
  assert.equal(host.querySelector('[data-lesson-player]'), null);
  await act(async () => {
    root.unmount();
  });
});

test('daily videos keep start and fullscreen on the player, and fullscreen clears the safe area', () => {
  const page = readFileSync('src/pages/Techniques.tsx', 'utf8');
  const notes = readFileSync('src/pages/TrainingNotes.tsx', 'utf8');
  const css = readFileSync('src/index.css', 'utf8');
  const header = page.slice(page.indexOf('<header className="techniques__bar">'), page.indexOf('</header>'));
  assert.doesNotMatch(header, />\s*Start\s*</);
  assert.doesNotMatch(header, /FullscreenChip|Fullscreen/);
  assert.match(header, /Mute clips/);
  assert.match(page, /data-player=/);
  assert.match(page, /<ClipDock/);
  assert.match(page, /dock=\{dock\}/);
  assert.match(notes, /LessonSectionVideo/);
  assert.match(notes, /if \(!offer\.show \|\| offer\.clipUrl\) return;/);
  assert.match(notes, /lessonClipLoopMs/);
  assert.match(notes, /lessonVideoHref/);

  const dockRule = css.slice(css.indexOf('.techniques__frame .techniques__dock {'));
  const dockBlock = dockRule.slice(0, dockRule.indexOf('}'));
  assert.match(dockBlock, /var\(--safe-l\)/);
  assert.match(dockBlock, /var\(--safe-r\)/);
  assert.match(dockBlock, /var\(--safe-b\)/);
  assert.match(css, /\.lesson-player--fill,\s*\.lesson-player:fullscreen \{/);
  assert.match(css, /\.play--fs \.techniques__frame \.techniques__dock,/);
  assert.doesNotMatch(page, /setSaverMuteVideo|getSaverPrefs/);
  const clip = readFileSync('src/components/LoopClip.tsx', 'utf8');
  assert.match(clip, /fullscreen \? null : dock/);
  assert.match(clip, /el\.muted = true/);
  assert.match(clip, /controls=\{false\}/);
});

test('a technique clip starts muted, the toggle is in the window, and the next clip starts muted', async () => {
  installFullscreen();
  const { host, root } = mount(<SwapProbe />);
  await click(buttonNamed(host, 'Play Armbar'));
  const video = host.querySelector('video') as HTMLVideoElement;
  assert.equal(playedMuted[0], true);
  assert.equal(video.muted, true);
  assert.equal(video.controls, false);
  const unmute = buttonNamed(host, 'Unmute');
  assert.equal(unmute.getAttribute('aria-pressed'), 'true');
  assert.equal(host.querySelector('[data-player-dock]')?.contains(unmute), false);

  await click(unmute);
  assert.equal(video.muted, false);
  assert.equal(buttonNamed(host, 'Mute').getAttribute('aria-pressed'), 'false');

  await click(buttonNamed(host, 'Swap clip'));
  const next = host.querySelector('video') as HTMLVideoElement;
  assert.equal(next.muted, true);
  assert.equal(playedMuted.at(-1), true);
  assert.equal(buttonNamed(host, 'Unmute').getAttribute('aria-pressed'), 'true');

  await act(async () => {
    root.unmount();
  });
});

test('the css full-screen cover has no controls and a tap leaves it', async () => {
  installCssFullscreen();
  const { host, root } = mount(<PlanProbe clipUrl="https://example.com/warm.mp4" />);
  await click(buttonNamed(host, 'Play Warm-up'));
  await click(buttonNamed(host, 'Fullscreen'));
  const player = host.querySelector('[data-lesson-player]') as HTMLElement;
  assert.match(player.className, /lesson-player--fill/);
  assert.equal(player.querySelector('[data-player-dock]'), null);
  assert.equal(player.querySelectorAll('button').length, 0);
  assert.equal((player.querySelector('video') as HTMLVideoElement).controls, false);
  assert.match(player.textContent ?? '', /Loop/);
  await act(async () => {
    (player.querySelector('.techniques__frame') as HTMLElement).click();
  });
  assert.doesNotMatch(player.className, /lesson-player--fill/);
  assert.ok(host.querySelector('[data-player-dock]'));
  await act(async () => {
    root.unmount();
  });
});

test('Escape and an iOS video fullscreen both return to the window without native controls', async () => {
  installFullscreen();
  const { host, root } = mount(<PlanProbe clipUrl="https://example.com/warm.mp4" />);
  await click(buttonNamed(host, 'Play Warm-up'));
  await click(buttonNamed(host, 'Fullscreen'));
  assert.equal(fullscreenNode, host.querySelector('[data-lesson-player]'));
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  assert.equal(fullscreenNode, null);
  assert.ok(host.querySelector('[data-player-dock]'));

  const video = host.querySelector('video') as HTMLVideoElement & {
    webkitDisplayingFullscreen?: boolean;
    webkitExitFullscreen?: () => void;
  };
  let exited = 0;
  video.webkitDisplayingFullscreen = true;
  video.webkitExitFullscreen = () => {
    exited += 1;
    video.webkitDisplayingFullscreen = false;
  };
  await act(async () => {
    video.dispatchEvent(new window.Event('webkitbeginfullscreen'));
    await Promise.resolve();
  });
  assert.equal(exited, 1);
  assert.equal(video.controls, false);
  assert.equal(fullscreenNode, host.querySelector('[data-lesson-player]'));
  assert.equal(host.querySelector('[data-player] button'), null);
  await act(async () => {
    (host.querySelector('.techniques__frame') as HTMLElement).click();
  });
  assert.equal(fullscreenNode, null);

  await act(async () => {
    root.unmount();
  });
});

function SwapProbe() {
  const [clip, setClip] = useState('https://example.com/a.mp4');
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => setClip('https://example.com/b.mp4')}>
        Swap clip
      </button>
      <LessonSectionVideo
        showVideo
        label="Armbar"
        clipUrl={clip}
        mediaName="Armbar.mp4"
        loopMs={60_000}
        onOpenBoard={() => navigate('/techniques?focus=1&section=technique&index=0')}
      />
    </>
  );
}
