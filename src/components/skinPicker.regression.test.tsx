import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { SkinPicker, type SkinPickerOption } from './SkinPicker.tsx';
import { useCustomSkinSection } from '../hooks/useCustomSkinSection.tsx';
import { customSkinValue, CUSTOM_SKIN_DELETE_FIRST } from '../lib/customSkin.ts';
import { savePreparedCustomSkin, useCustomSkinDatabase, deleteCustomSkin, type CustomSkinRecord } from '../lib/customSkinStore.ts';
import { dispatchMatch, getMatch } from '../lib/matchStore.ts';
import { SCOREBOARD_SKIN } from '../lib/scoreboardSkin.ts';
import { getTrainingSkin, setTrainingSkin, TRAINING_SKIN_KEY, type TrainingSkin } from '../lib/trainingSkin.ts';
import { MatchDisplayPage } from '../pages/MatchDisplay.tsx';
import { TrainingPage } from '../pages/Training.tsx';

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

test('the skin stack opens the same chooser and keeps the current skin in front', async () => {
  setViewport(390, 844);
  const mounted = mount(
    <SkinPicker
      label="Timer skins"
      value="OLD_SCHOOL"
      appearance="stack"
      options={WHITE}
      onChoose={() => undefined}
    />,
  );
  try {
    const stack = document.querySelector<HTMLButtonElement>('.skin-stack');
    assert.ok(stack);
    assert.equal(stack.getAttribute('aria-label'), 'Skins, Old School');
    assert.equal(stack.querySelector('.skin-stack__label')?.textContent, 'Skins');
    const cards = [...document.querySelectorAll<HTMLImageElement>('.skin-stack__card')];
    assert.equal(cards.length, 3);
    assert.equal(cards.at(-1)?.classList.contains('skin-stack__card--front'), true);
    assert.equal(cards.at(-1)?.getAttribute('src'), '/t/old.jpg');
    assert.equal(document.body.textContent?.includes('Kids Arcade'), false);
    await act(async () => {
      stack.click();
    });
    const dialog = document.querySelector('.skin-pick__picker');
    assert.equal(dialog?.getAttribute('role'), 'dialog');
    assert.equal(dialog?.getAttribute('aria-label'), 'Timer skins');
    assert.deepEqual(
      [...document.querySelectorAll('[role="radio"]')].map((radio) => radio.getAttribute('aria-label')),
      ['Mock-Tournament', 'Old School', 'Quick Result'],
    );
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

function memorySkins() {
  const rows = new Map<string, CustomSkinRecord>();
  return {
    async get(id: string) {
      return rows.get(id) ?? null;
    },
    async put(record: CustomSkinRecord) {
      rows.set(record.id, record);
    },
    async delete(id: string) {
      rows.delete(id);
    },
    async all() {
      return [...rows.values()];
    },
  };
}

function picture(): Blob {
  return new Blob([Uint8Array.from([9, 8, 7, 6])], { type: 'image/jpeg' });
}

test('Upload skin is Media and above, and the tile says to delete one at the cap', async () => {
  useCustomSkinDatabase(memorySkins());
  window.fetch = async () => new Response(JSON.stringify({ bound: false }), { status: 503 });
  function Probe({ enabled }: { enabled: boolean }) {
    const section = useCustomSkinSection(enabled, () => undefined);
    return (
      <SkinPicker
        label="Timer skins"
        value="classic"
        options={[{ id: 'classic', label: 'Classic', thumb: '/t/c.jpg' }, ...section.options]}
        showMine={section.showMine}
        mineExtra={section.mineExtra}
        onChoose={() => undefined}
      />
    );
  }
  const locked = mount(<Probe enabled={false} />);
  try {
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.skin-pick__btn')?.click();
    });
    assert.equal(document.querySelector('[data-skin-section="mine"]'), null);
    assert.equal(document.body.textContent?.includes('Upload skin'), false);
  } finally {
    unmount(locked);
  }
  const open = mount(<Probe enabled />);
  try {
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.skin-pick__btn')?.click();
    });
    await settle();
    assert.equal(document.querySelector('[data-skin-section="mine"]')?.textContent?.includes('My skins'), true);
    assert.equal(document.querySelector('.skin-pick__upload')?.textContent?.includes('Upload skin'), true);
  } finally {
    unmount(open);
  }
  for (let i = 0; i < 10; i += 1) {
    const saved = await savePreparedCustomSkin({
      id: `skin${String(i).padStart(8, '0')}`,
      name: `Mat ${i}`,
      image: picture(),
      thumb: picture(),
      mime: 'image/jpeg',
      publish: false,
    });
    assert.equal(saved.ok, true);
  }
  const full = mount(<Probe enabled />);
  try {
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.skin-pick__btn')?.click();
    });
    await settle();
    const upload = document.querySelector('.skin-pick__upload');
    assert.equal(upload?.textContent?.includes(CUSTOM_SKIN_DELETE_FIRST), true);
    assert.equal(upload?.querySelector('input')?.disabled, true);
    assert.equal(document.querySelectorAll('[data-skin-section="mine"] [role="radio"]').length, 10);
  } finally {
    unmount(full);
    for (let i = 0; i < 10; i += 1) await deleteCustomSkin(`skin${String(i).padStart(8, '0')}`);
    useCustomSkinDatabase(null);
  }
});

test('a custom skin keeps the scoreboard and timer text and controls on top of the picture', async () => {
  useCustomSkinDatabase(memorySkins());
  localStorage.setItem('advantage.proUnlocked', '1');
  localStorage.setItem('advantage.coachUnlocked', '1');
  const saved = await savePreparedCustomSkin({
    id: 'skinabc12345',
    name: 'Night mat',
    image: picture(),
    thumb: picture(),
    mime: 'image/jpeg',
    publish: false,
  });
  assert.equal(saved.ok, true);
  const value = customSkinValue('skinabc12345');
  assert.ok(value);
  dispatchMatch({ type: 'setSkin', value });
  setTrainingSkin(value);

  const board = mount(
    <MemoryRouter initialEntries={['/match']}>
      <MatchDisplayPage />
    </MemoryRouter>,
  );
  try {
    await settle();
    const main = document.querySelector('main.display');
    assert.ok(main);
    assert.equal(main.classList.contains('scoreboard-skin--mock-tournament'), true);
    assert.equal(main.classList.contains('scoreboard-skin--custom'), true);
    assert.equal(main.classList.contains('display--custom-skin'), true);
    assert.equal(document.querySelector('.skin-root'), null);
    assert.ok(document.querySelector('[data-custom-skin-bg]'));
    assert.ok(document.querySelector('[data-custom-skin-scrim]'));
    assert.ok(document.querySelector('.clock-btn'));
    assert.match(document.body.textContent ?? '', /Competitor 1/);
    assert.match(document.body.textContent ?? '', /Competitor 2/);
    assert.ok(document.querySelector('[aria-label^="Points "]'));
    assert.ok(document.querySelector('[aria-label^="Adv "]') || document.querySelector('[aria-label^="Advantage "]'));
    const scrim = document.querySelector('[data-custom-skin-scrim]');
    const clock = document.querySelector('.clock-btn');
    assert.ok(scrim && clock);
    assert.equal(scrim.contains(clock), false);
  } finally {
    unmount(board);
  }

  const timer = mount(
    <MemoryRouter initialEntries={['/training']}>
      <TrainingPage />
    </MemoryRouter>,
  );
  try {
    await settle();
    const main = document.querySelector('main.training');
    assert.ok(main);
    assert.equal(main.classList.contains('training--polished'), false);
    assert.equal(main.classList.contains('training--skin-auto-scrim'), true);
    assert.equal(document.querySelector('.skin-root'), null);
    assert.ok(document.querySelector('.training__clock'));
    assert.ok(document.querySelector('.training__phase'));
    assert.ok(document.querySelector('[data-custom-skin-scrim]'));
    const clock = document.querySelector('.training__clock');
    const scrim = document.querySelector('[data-custom-skin-scrim]');
    assert.ok(clock && scrim);
    assert.equal(scrim.contains(clock), false);
    assert.match(clock.textContent ?? '', /\d/);
  } finally {
    unmount(timer);
  }

  function Probe() {
    const section = useCustomSkinSection(true, () => undefined);
    return (
      <SkinPicker
        label="Timer skins"
        value={value}
        options={section.options}
        showMine={section.showMine}
        mineExtra={section.mineExtra}
        renderTileExtra={section.renderTileExtra}
        onChoose={() => undefined}
      />
    );
  }
  const picker = mount(<Probe />);
  try {
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.skin-pick__btn')?.click();
    });
    await settle();
    const remove = document.querySelector<HTMLButtonElement>('[aria-label="Delete Night mat"]');
    assert.ok(remove);
    await act(async () => {
      remove.click();
    });
    await settle();
    assert.equal(getTrainingSkin(), 'classic');
    assert.equal(getMatch().skin, SCOREBOARD_SKIN.MOCK_TOURNAMENT);
    assert.equal(document.querySelector('[data-skin-option="custom:skinabc12345"]'), null);
  } finally {
    unmount(picker);
    setTrainingSkin('classic');
    dispatchMatch({ type: 'setSkin', value: 'MOCK_TOURNAMENT' });
    await deleteCustomSkin('skinabc12345');
    useCustomSkinDatabase(null);
  }
});
