/**
 * Restore flow: /buy sends people to /restore, /restore runs the Turnstile person check,
 * sends its token, keeps the challenge id, and confirms a code without a link.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RESTORE_CHALLENGE_KEY, readRestoreChallenge, saveRestoreChallenge } from '../lib/restoreChallenge.ts';
import type { TurnstileApi, TurnstileRenderOptions } from '../lib/turnstile.ts';
import { BUY_RESTORE_COPY, BuyWhitePage } from './BuyWhite.tsx';
import { RestoreAccessPage } from './RestoreAccess.tsx';

const dom = new Window({ url: 'http://localhost/restore' });
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

type Call = { url: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let respond: (url: string, body: Record<string, unknown> | null) => unknown = () => ({});

installGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  calls.push({ url, body });
  return new Response(JSON.stringify(respond(url, body)), { status: 200, headers: { 'content-type': 'application/json' } });
});

function fakeTurnstile() {
  const state = { options: null as TurnstileRenderOptions | null, resets: 0, renders: 0 };
  const api: TurnstileApi = {
    render(_container, options) {
      state.options = options;
      state.renders += 1;
      return 'widget-1';
    },
    reset() {
      state.resets += 1;
    },
    remove() {},
  };
  return { api, state };
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

async function mount(node: ReactNode, entry: string): Promise<{ root: Root; host: HTMLElement }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/buy" element={node} />
          <Route path="/restore" element={node} />
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </MemoryRouter>,
    );
  });
  await flush();
  return { root, host };
}

async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function reactProps(node: Element): Record<string, (...args: never[]) => unknown> | null {
  // happy-dom forms list their controls as own keys, so take React's key from a plain element.
  let key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  if (!key) {
    const sample = document.querySelector('button, input');
    key = sample ? Object.keys(sample).find((name) => name.startsWith('__reactProps')) : undefined;
  }
  return key ? (node as unknown as Record<string, Record<string, (...args: never[]) => unknown>>)[key] : null;
}

async function setInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    setter?.call(input, value);
    reactProps(input)?.onChange?.({ target: input, currentTarget: input } as never);
  });
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  assert.ok(found, `button ${label}`);
  return found as HTMLButtonElement;
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    await reactProps(form)?.onSubmit?.({ preventDefault() {}, stopPropagation() {} } as never);
  });
  await flush();
}

test.beforeEach(() => {
  calls = [];
  respond = () => ({});
  localStorage.clear();
  sessionStorage.clear();
});

test('/buy has no restore email box and its Restore button opens /restore', async () => {
  const mounted = await mount(<BuyWhitePage />, '/buy');
  const { host } = mounted;
  assert.ok(host.textContent?.includes(BUY_RESTORE_COPY));
  assert.equal(
    BUY_RESTORE_COPY,
    'Already purchased? Enter the email from checkout. If it matches the purchase, we will email a one-time code.',
  );
  const restorePanel = host.querySelector('.buy__restore');
  assert.ok(restorePanel);
  assert.equal(restorePanel.querySelector('input'), null);
  assert.equal(host.querySelector('input[type="email"][autocomplete="email"]')?.closest('.buy__restore') ?? null, null);
  assert.equal(host.textContent?.includes('Restore White'), false);
  const restore = button(host, 'Restore');
  assert.ok(restore.className.includes('btn'));
  await act(async () => restore.click());
  assert.equal(host.querySelector('[data-testid="where"]')?.textContent, '/restore');
  assert.equal(
    calls.some((call) => call.url.includes('/api/restore/request')),
    false,
  );
  unmount(mounted);
});

test('/restore renders Turnstile, sends its token, stores the challenge, and resets the widget', async () => {
  const turnstile = fakeTurnstile();
  respond = (url) =>
    url.includes('/api/restore/request')
      ? { ok: true, message: "If that address has a purchase, we've emailed a code.", challengeId: 'challenge-abc' }
      : {};
  const mounted = await mount(
    <RestoreAccessPage deps={{ fetchSiteKey: async () => 'site-key-1', loadTurnstile: async () => turnstile.api }} />,
    '/restore',
  );
  const { host } = mounted;
  assert.equal(turnstile.state.renders, 1);
  assert.equal(turnstile.state.options?.sitekey, 'site-key-1');
  assert.equal(turnstile.state.options?.theme, 'auto');
  assert.equal(host.querySelector('input[name="code"]'), null);

  await setInput(host.querySelector('input[name="email"]') as HTMLInputElement, 'buyer@gym.test');
  await submit(button(host, 'Email me a code').closest('form') as HTMLFormElement);
  assert.equal(calls.filter((call) => call.url.includes('/api/restore/request')).length, 0, 'no token yet, no request');

  await act(async () => turnstile.state.options?.callback?.('token-xyz'));
  await submit(button(host, 'Email me a code').closest('form') as HTMLFormElement);
  const request = calls.find((call) => call.url.includes('/api/restore/request'));
  assert.ok(request);
  assert.equal(request.body?.turnstileToken, 'token-xyz');
  assert.equal(request.body?.email, 'buyer@gym.test');
  assert.equal(turnstile.state.resets, 1);
  assert.equal(readRestoreChallenge(), 'challenge-abc');
  assert.ok(host.querySelector('input[name="code"]'), 'code box on the same page');
  button(host, 'Confirm');
  unmount(mounted);
});

test('Confirm uses the stored challenge id with no URL parameter', async () => {
  saveRestoreChallenge('stored-challenge');
  respond = (url) => (url.includes('/api/restore/verify') ? { ok: false, error: "That code didn't work." } : {});
  const mounted = await mount(
    <RestoreAccessPage deps={{ fetchSiteKey: async () => null, loadTurnstile: async () => null }} />,
    '/restore',
  );
  const { host } = mounted;
  const codeInput = host.querySelector('input[name="code"]') as HTMLInputElement;
  assert.ok(codeInput);
  await setInput(codeInput, 'ABCD1234');
  await submit(button(host, 'Confirm').closest('form') as HTMLFormElement);
  const verify = calls.find((call) => call.url.includes('/api/restore/verify'));
  assert.ok(verify);
  assert.equal(verify.body?.challengeId, 'stored-challenge');
  assert.equal(verify.body?.code, 'ABCD1234');
  assert.ok(host.textContent?.includes("That code didn't work."));
  unmount(mounted);
});

test('old ?challenge= links still fill in the code box', async () => {
  respond = () => ({ ok: false, error: "That code didn't work." });
  const mounted = await mount(
    <RestoreAccessPage deps={{ fetchSiteKey: async () => null, loadTurnstile: async () => null }} />,
    '/restore?challenge=link-challenge',
  );
  const { host } = mounted;
  const codeInput = host.querySelector('input[name="code"]') as HTMLInputElement;
  assert.ok(codeInput);
  assert.equal(readRestoreChallenge(), 'link-challenge');
  await setInput(codeInput, 'ZZZZ9999');
  await submit(button(host, 'Confirm').closest('form') as HTMLFormElement);
  assert.equal(calls.find((call) => call.url.includes('/api/restore/verify'))?.body?.challengeId, 'link-challenge');
  unmount(mounted);
});

test('a missing site key keeps the page usable and says so', async () => {
  respond = () => ({ ok: false, error: 'Confirm you are a person and try again.' });
  const mounted = await mount(
    <RestoreAccessPage deps={{ fetchSiteKey: async () => null, loadTurnstile: async () => null }} />,
    '/restore',
  );
  const { host } = mounted;
  assert.ok(host.textContent?.includes('person check is not set up'));
  await setInput(host.querySelector('input[name="email"]') as HTMLInputElement, 'buyer@gym.test');
  await submit(button(host, 'Email me a code').closest('form') as HTMLFormElement);
  assert.ok(calls.some((call) => call.url.includes('/api/restore/request')));
  assert.ok(host.textContent?.includes('Confirm you are a person and try again.'));
  unmount(mounted);
});

test('stored challenges expire after 15 minutes', () => {
  saveRestoreChallenge('old', 1_000);
  assert.equal(readRestoreChallenge(1_000 + 14 * 60_000), 'old');
  assert.equal(readRestoreChallenge(1_000 + 15 * 60_000 + 1), '');
  assert.equal(localStorage.getItem(RESTORE_CHALLENGE_KEY), null);
});
