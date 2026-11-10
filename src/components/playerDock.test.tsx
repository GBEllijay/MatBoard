/**
 * Play and fullscreen sit on the player. A lesson-plan clip opens there
 * and does not leave the plan.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
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

function installFullscreen() {
  fullscreenNode = null;
  const proto = view.HTMLElement.prototype as HTMLElement & {
    requestFullscreen?: (options?: { navigationUI?: 'hide' }) => Promise<void>;
  };
  view.HTMLVideoElement.prototype.play = () => Promise.resolve();
  view.HTMLVideoElement.prototype.pause = () => undefined;
  proto.requestFullscreen = function requestFullscreen() {
    fullscreenNode = this;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  };
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenNode });
  document.exitFullscreen = async () => {
    fullscreenNode = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  };
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
  const exit = buttonNamed(host, 'Exit fullscreen');
  assert.equal(fullscreenNode, host.querySelector('[data-lesson-player]'));
  assert.ok(fullscreenNode?.contains(exit));
  assert.ok(player.contains(exit));
  assert.match(exit.className, /play-fs/);

  await click(exit);
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
});
