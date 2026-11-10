/**
 * The account reference is readable and is not something a person types.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountReference } from '../components/AccountReference.ts';
import { forgetAccountReference, readAccountReference, rememberAccountReference } from './accountReference.ts';

const dom = new Window({ url: 'http://localhost/buy' });
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
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const ID = '11111111-1111-4111-8111-111111111111';

test('the account reference renders as text and is not an input', async () => {
  forgetAccountReference();
  rememberAccountReference(ID);
  assert.equal(readAccountReference(), ID);
  rememberAccountReference('not-an-id');
  assert.equal(readAccountReference(), ID);

  const host = view.document.createElement('div');
  view.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AccountReference, { id: ID }));
  });
  const node = host.querySelector('[data-testid="account-reference"]');
  assert.ok(node);
  assert.equal(node?.querySelector('input, textarea, select'), null);
  assert.equal(host.querySelector('[data-testid="account-reference-id"]')?.textContent, ID);
  assert.match(node?.textContent ?? '', /do not need to type this/i);
  await act(async () => {
    root.render(createElement(AccountReference, { id: null }));
  });
  assert.equal(host.querySelector('[data-testid="account-reference"]'), null);
  await act(async () => {
    root.unmount();
  });

  const component = readFileSync('src/components/AccountReference.ts', 'utf8');
  assert.equal(component.includes('<input'), false);
  assert.equal(component.includes("createElement('input'"), false);
  assert.match(readFileSync('src/components/InstructorSheet.tsx', 'utf8'), /AccountReference/);
  assert.match(readFileSync('src/pages/BuyWhite.tsx', 'utf8'), /AccountReference/);
  assert.match(readFileSync('src/pages/BuyTier.tsx', 'utf8'), /AccountReference/);
  assert.match(readFileSync('src/pages/RestoreAccess.tsx', 'utf8'), /AccountReference/);
  const restore = readFileSync('src/pages/RestoreAccess.tsx', 'utf8');
  assert.equal(restore.includes('name="accountId"'), false);
  assert.equal(restore.includes('name="account"'), false);
});
