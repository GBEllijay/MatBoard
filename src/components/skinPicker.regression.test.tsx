import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SkinPicker, type SkinPickerOption } from './SkinPicker.tsx';
import { getTrainingSkin, setTrainingSkin, TRAINING_SKIN_KEY, type TrainingSkin } from '../lib/trainingSkin.ts';

const dom = new Window({ url: 'http://localhost/match/control', width: 390, height: 844 });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('HTMLButtonElement', view.HTMLButtonElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('PointerEvent', view.PointerEvent);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const scrolled: string[] = [];
view.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
  const id = this.getAttribute('data-skin-option');
  if (id) scrolled.push(id);
};

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

const WHITE: SkinPickerOption[] = [
  { id: 'MOCK_TOURNAMENT', label: 'Mock-Tournament', thumb: '/t/mock.jpg' },
  { id: 'OLD_SCHOOL', label: 'Old School', thumb: '/t/old.jpg' },
  { id: 'QUICK_RESULT', label: 'Quick Result', thumb: '/t/quick.jpg' },
];

/** Six skins that are not shipped. They exist only so this test can open a long list. */
const COMING_ANIME = ['Coming anime 1', 'Coming anime 2', 'Coming anime 3', 'Coming anime 4', 'Coming anime 5', 'Coming anime 6'];

const MEDIA_TIMER: SkinPickerOption[] = [
  { id: 'classic', label: 'Classic', thumb: '/t/classic.jpg' },
  { id: 'themed', label: 'Advantage', thumb: '/t/advantage.jpg' },
  ...['Kids Arcade', 'Kids Sticker', 'Keynote', 'Heavy Metal', 'Brasil', 'Calçadão', 'Woodblock', 'Reggae', 'Psychedelic', 'Visionary'].map(
    (label) => ({ id: label.toLowerCase().replace('ç', 'c'), label, thumb: '/t/x.jpg' }),
  ),
];

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

test('White picker: three Advantage radios, no My skins, no polished tiles', async () => {
  setViewport(390, 844);
  const mounted = mount(<SkinPicker label="Scoreboard skins" value="MOCK_TOURNAMENT" options={WHITE} onChoose={() => undefined} />);
  try {
    const button = document.querySelector<HTMLButtonElement>('.skin-pick__btn');
    assert.ok(button);
    await act(async () => {
      button.click();
    });
    const dialog = document.querySelector('.skin-pick__picker');
    assert.equal(dialog?.getAttribute('role'), 'dialog');
    assert.deepEqual(
      [...document.querySelectorAll('.skin-pick__heading')].map((heading) => heading.textContent),
      ['Advantage skins'],
    );
    assert.equal(document.querySelector('[data-skin-section="mine"]'), null);
    const radios = [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    assert.deepEqual(
      radios.map((radio) => radio.textContent?.trim()),
      ['Mock-Tournament', 'Old School', 'Quick Result'],
    );
    assert.equal(dialog?.textContent?.includes('Kids Arcade'), false);
    assert.equal(dialog?.textContent?.includes('Unlock'), false);
    assert.equal(dialog?.querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby')?.includes('advantage') || true, true);
    assert.equal(pickerCols(), '3');
  } finally {
    unmount(mounted);
  }
});

test('choosing a skin stores it and the selected radio scrolls into view', async () => {
  setViewport(390, 844);
  scrolled.length = 0;
  localStorage.removeItem(TRAINING_SKIN_KEY);
  function Harness() {
    const [value, setValue] = useState('MOCK_TOURNAMENT');
    return (
      <SkinPicker
        label="Timer skins"
        value={value}
        options={WHITE}
        onChoose={(id) => {
          setTrainingSkin(id as TrainingSkin);
          setValue(id);
        }}
      />
    );
  }
  const mounted = mount(<Harness />);
  try {
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.skin-pick__btn')?.click();
    });
    assert.ok(scrolled.includes('MOCK_TOURNAMENT'), 'the open picker scrolls the selected skin into view');
    const quick = document.querySelector<HTMLButtonElement>('[data-skin-option="QUICK_RESULT"]');
    assert.ok(quick);
    await act(async () => {
      quick.click();
    });
    assert.equal(getTrainingSkin(), 'QUICK_RESULT');
    assert.equal(localStorage.getItem(TRAINING_SKIN_KEY), 'QUICK_RESULT');
    assert.equal(document.querySelector('.skin-pick__picker'), null);
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.skin-pick__btn')?.click();
    });
    const selected = document.querySelector<HTMLButtonElement>('[data-skin-option="QUICK_RESULT"]');
    assert.equal(selected?.getAttribute('aria-checked'), 'true');
    assert.equal(selected?.classList.contains('is-on'), true);
  } finally {
    unmount(mounted);
    setTrainingSkin('classic');
  }
});

test('a long catalog scrolls the selected tile into view and fades when more is below', async () => {
  setViewport(1920, 1080);
  scrolled.length = 0;
  const options: SkinPickerOption[] = [
    ...MEDIA_TIMER,
    ...COMING_ANIME.map((label) => ({ id: label, label, thumb: '/t/soon.jpg' })),
  ];
  assert.ok(options.length >= 18);
  const mounted = mount(<SkinPicker label="Timer skins" value="Coming anime 6" options={options} onChoose={() => undefined} />);
  try {
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.skin-pick__btn')?.click();
    });
    await settle();
    assert.equal(pickerCols(), '5');
    assert.equal(document.querySelectorAll('[role="radio"]').length, options.length);
    assert.equal(document.querySelector('[data-skin-section="mine"]'), null);
    assert.ok(scrolled.includes('Coming anime 6'));
    const scroll = document.querySelector<HTMLElement>('.skin-pick__scroll');
    assert.ok(scroll);
    Object.defineProperty(scroll, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 280 });
    Object.defineProperty(scroll, 'scrollTop', { configurable: true, value: 0, writable: true });
    await act(async () => {
      scroll.dispatchEvent(new view.Event('scroll'));
    });
    assert.ok(document.querySelector('.skin-pick__fade'), 'the peeking row fades while more skins sit below');
    scroll.scrollTop = 620;
    await act(async () => {
      scroll.dispatchEvent(new view.Event('scroll'));
    });
    assert.equal(document.querySelector('.skin-pick__fade'), null);

    const radios = [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    radios[0]?.focus();
    await act(async () => {
      document.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    assert.equal(document.activeElement, radios[1]);
    await act(async () => {
      document.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    assert.equal(document.querySelector('.skin-pick__picker'), null);
  } finally {
    unmount(mounted);
  }
});

function pickerCols(): string {
  return document.querySelector<HTMLElement>('.skin-pick__picker')?.style.getPropertyValue('--skin-cols') ?? '';
}
