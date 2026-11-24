import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { resetBracketRosterForTests } from '../lib/bracketRosterStore.ts';
import { PRO_UNLOCK_STORAGE_KEY } from '../lib/proUnlock.ts';
import { RosterNameField } from './RosterNameField.tsx';

const dom = new Window({ url: 'http://localhost/match/control?from=white' });
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
installGlobal('HTMLInputElement', view.HTMLInputElement);
installGlobal('HTMLTextAreaElement', view.HTMLTextAreaElement);
installGlobal('HTMLButtonElement', view.HTMLButtonElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('PointerEvent', view.PointerEvent);
installGlobal('InputEvent', view.InputEvent);
installGlobal('FocusEvent', view.FocusEvent);
installGlobal('MutationObserver', view.MutationObserver);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={['/match/control?from=white']}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => {
    mounted.root.unmount();
  });
  mounted.host.remove();
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function reactProps(node: Element): Record<string, (...args: never[]) => void> | null {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  return key ? (node as unknown as Record<string, Record<string, (...args: never[]) => void>>)[key] : null;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  reactProps(input)?.onChange?.({
    target: input,
    currentTarget: input,
    nativeEvent: new Event('input'),
  } as never);
}

function ScoreboardName({
  names,
  defaultName,
  initial = 'Alex Rivera',
}: {
  names: 'white' | 'competitor';
  defaultName?: string;
  initial?: string;
}) {
  const [name, setName] = useState(initial);
  const [gym, setGym] = useState('City Jiu-Jitsu');
  const [rank, setRank] = useState('Blue');
  return (
    <div>
      <RosterNameField
        value={name}
        ariaLabel="Blue name"
        names={names}
        defaultName={defaultName}
        onChange={setName}
        onPrefill={(prefill) => {
          setName(prefill.name);
          setRank(prefill.belt);
          setGym(prefill.gym);
        }}
      />
      <span data-name>{name}</span>
      <span data-gym>{gym}</span>
      <span data-rank>{rank}</span>
    </div>
  );
}

async function openPicker(host: HTMLElement) {
  const field = host.querySelector('[aria-label="Blue name"]');
  assert.ok(field instanceof HTMLInputElement, 'name field renders');
  await act(async () => {
    field.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
  const typed = document.querySelector('input.roster-pick__name');
  assert.ok(typed instanceof HTMLInputElement, 'picker opens');
  return typed;
}

function clickButton(label: string) {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === label);
  assert.ok(button, `${label} button is present`);
  reactProps(button)?.onClick?.({
    preventDefault() {},
    currentTarget: button,
    target: button,
  } as never);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

test('clearing a White scoreboard name and closing the picker keeps Competitor 1', async () => {
  resetBracketRosterForTests();
  const mounted = mount(<ScoreboardName names="white" defaultName="Competitor 1" />);
  try {
    const typed = await openPicker(mounted.host);
    assert.equal(typed.value, 'Alex Rivera');
    assert.ok(document.querySelector('.roster-pick__clear'), 'Clear name is offered');
    await act(async () => {
      setInputValue(typed, '');
    });
    await settle();
    await act(async () => {
      clickButton('Close');
    });
    await settle();
    assert.equal(mounted.host.querySelector('[data-name]')?.textContent, 'Competitor 1');
    assert.equal(mounted.host.querySelector('[data-gym]')?.textContent, '');
    assert.equal(mounted.host.querySelector('[data-rank]')?.textContent, '');
    const field = mounted.host.querySelector('[aria-label="Blue name"]');
    assert.ok(field instanceof HTMLInputElement);
    assert.equal(field.value, 'Competitor 1');

    const again = await openPicker(mounted.host);
    assert.equal(again.value, 'Competitor 1');
  } finally {
    unmount(mounted);
  }
});

test('Clear name on the White picker resets the board to the default', async () => {
  resetBracketRosterForTests();
  const mounted = mount(<ScoreboardName names="white" defaultName="Competitor 2" initial="Sam Ortiz" />);
  try {
    await openPicker(mounted.host);
    await act(async () => {
      clickButton('Clear name');
    });
    await settle();
    const field = mounted.host.querySelector('[aria-label="Blue name"]');
    assert.ok(field instanceof HTMLInputElement);
    assert.equal(field.value, 'Competitor 2');
    assert.equal(mounted.host.querySelector('[data-name]')?.textContent, 'Competitor 2');
    assert.ok(!document.querySelector('input.roster-pick__name'), 'picker closes after clear');
  } finally {
    unmount(mounted);
  }
});

test('a White bracket field without a default does not invent Competitor 1 on close', async () => {
  resetBracketRosterForTests();
  const mounted = mount(<ScoreboardName names="white" initial="Alex Rivera" />);
  try {
    const typed = await openPicker(mounted.host);
    await act(async () => {
      setInputValue(typed, '');
    });
    await settle();
    await act(async () => {
      clickButton('Close');
    });
    await settle();
    const field = mounted.host.querySelector('[aria-label="Blue name"]');
    assert.ok(field instanceof HTMLInputElement);
    assert.equal(field.value, 'Alex Rivera');
  } finally {
    unmount(mounted);
  }
});

test('clearing a Pro scoreboard name also falls back to the default', async () => {
  resetBracketRosterForTests();
  localStorage.setItem(PRO_UNLOCK_STORAGE_KEY, '1');
  const mounted = mount(<ScoreboardName names="competitor" defaultName="Competitor 1" />);
  try {
    const typed = await openPicker(mounted.host);
    await act(async () => {
      setInputValue(typed, '');
    });
    await settle();
    await act(async () => {
      clickButton('Close');
    });
    await settle();
    const field = mounted.host.querySelector('[aria-label="Blue name"]');
    assert.ok(field instanceof HTMLInputElement);
    assert.equal(field.value, 'Competitor 1');
  } finally {
    localStorage.removeItem(PRO_UNLOCK_STORAGE_KEY);
    unmount(mounted);
  }
});
