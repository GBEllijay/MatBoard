/**
 * Instructor Edition (/coach-unlimited): Share code then Connect to my academy,
 * Cloud gyms collapse the Drive card and use short Sunday review copy,
 * hyphenated class names stay in full, and non-Cloud gyms stay as they were.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { resetAdvantageCloudOnCacheForTests } from '../components/useAdvantageCloudOn.ts';
import { CONNECT_GOOGLE_UNVERIFIED_NOTE, CONNECT_WITH_TITLE } from '../lib/cloudStorage.ts';
import { ENTITLEMENT_TOKEN_KEY, clearEntitlementToken, setEntitlementConfigForTests } from '../lib/entitlement.ts';
import {
  LESSON_DRIVE_QUEUE_KEY,
  OWNER_CLOUD_BODY,
  OWNER_CLOUD_QUEUE,
  OWNER_CLOUD_TITLE,
  OWNER_DRIVE_BODY,
  OWNER_DRIVE_QUEUE,
  OWNER_DRIVE_TITLE,
} from '../lib/lessonDrive.ts';
import { applyOwnerTestGrant, clearOwnerTestGrant } from '../lib/ownerTestGrant.ts';
import { CLOUD_CONNECT_COLLAPSE_LABEL, CLOUD_CONNECT_OPTIONAL } from '../lib/storageCopy.ts';
import { emptyPlan } from '../lib/trainingNotesStore.ts';
import { CoachUnlimitedPage } from './CoachUnlimited.tsx';

const dom = new Window({ url: 'http://localhost/coach-unlimited' });
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
installGlobal('Event', view.Event);
installGlobal('CustomEvent', view.CustomEvent);
installGlobal('StorageEvent', view.StorageEvent);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

if (typeof import.meta.env === 'undefined') {
  Object.defineProperty(import.meta, 'env', {
    configurable: true,
    value: { DEV: false, MODE: 'test', VITE_GOOGLE_CLIENT_ID: 'test-google-client' },
  });
} else {
  const env = import.meta.env as Record<string, unknown>;
  if (!env.VITE_GOOGLE_CLIENT_ID) env.VITE_GOOGLE_CLIENT_ID = 'test-google-client';
}

const CLASS_NAME = 'Professor Justin Geis - Tiny Champions Week 11, Class A';

function seedRevision() {
  const plan = emptyPlan();
  plan.id = 'tiny-week-11-a';
  plan.coachName = 'Professor Justin Geis';
  plan.classDesignation = CLASS_NAME;
  localStorage.setItem(
    LESSON_DRIVE_QUEUE_KEY,
    JSON.stringify({
      version: 1,
      revisions: [
        {
          revisionId: 'draft:2026-11-09:professor justin geis:tiny-week-11-a',
          dateKey: '2026-11-09',
          coachName: 'Professor Justin Geis',
          savedAt: Date.parse('2026-11-09T16:00:00.000Z'),
          kind: 'draft',
          driveFileId: null,
          status: 'waiting-for-drive',
          plan,
          media: [],
        },
      ],
    }),
  );
}

function setCloud(on: boolean) {
  resetAdvantageCloudOnCacheForTests();
  if (on) {
    localStorage.setItem(ENTITLEMENT_TOKEN_KEY, 'test-cloud-token');
    installGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/gym/cloud')) {
        return new Response(JSON.stringify({ cloud: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 503 });
    });
  } else {
    localStorage.removeItem(ENTITLEMENT_TOKEN_KEY);
    installGlobal('fetch', async () => new Response('{}', { status: 503 }));
  }
}

function reset() {
  localStorage.clear();
  sessionStorage.clear();
  clearOwnerTestGrant();
  clearEntitlementToken();
  resetAdvantageCloudOnCacheForTests();
  setEntitlementConfigForTests({ signing: false, keys: [], legacyAmnestyEndsAt: '2099-01-01T00:00:00.000Z' });
  assert.equal(applyOwnerTestGrant({ grants: ['pro'], expiresAt: '2099-01-01T00:00:00.000Z', tier: 'pro' }), true);
  setCloud(false);
}

async function settle() {
  for (let step = 0; step < 8; step += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(cloudOn = false) {
  setCloud(cloudOn);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/coach-unlimited']}>
        <CoachUnlimitedPage />
      </MemoryRouter>,
    );
  });
  await settle();
  return {
    host,
    done() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function slotOrder(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.license-share-entry, .academy-menu-entry, .suite__note, .plan-card, .drive-connect-collapse')].map(
    (node) => {
      if (node.classList.contains('license-share-entry')) return 'share';
      if (node.classList.contains('academy-menu-entry')) return 'academy';
      if (node.classList.contains('suite__note')) return 'preview';
      if (node.classList.contains('drive-connect-collapse')) return 'drive-collapse';
      const text = node.textContent ?? '';
      if (text.includes(OWNER_DRIVE_TITLE) || text.includes(OWNER_CLOUD_TITLE) || text.includes('Sunday review')) return 'sunday';
      return 'drive';
    },
  );
}

test('Share code sits directly above Connect to my academy', async () => {
  reset();
  const m = await mount(false);
  const order = slotOrder(m.host);
  assert.equal(order.indexOf('share') >= 0, true);
  assert.equal(order.indexOf('academy'), order.indexOf('share') + 1);
  const academy = m.host.querySelector('.academy-menu-entry a');
  assert.equal(academy?.getAttribute('href'), '/coach-unlimited/academy');
  assert.equal(academy?.textContent?.trim(), 'Connect to my academy');
  assert.equal(order.includes('preview'), true);
  assert.ok(order.indexOf('preview') > order.indexOf('academy'));
  m.done();
});

test('a gym without Advantage Cloud keeps the Sunday Review Drive copy and the full Connect with card', async () => {
  reset();
  seedRevision();
  const m = await mount(false);
  const text = m.host.textContent ?? '';
  assert.match(text, new RegExp(OWNER_DRIVE_TITLE));
  assert.match(text, new RegExp(OWNER_DRIVE_BODY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, new RegExp(OWNER_DRIVE_QUEUE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(text, new RegExp(OWNER_CLOUD_QUEUE));
  assert.equal(m.host.querySelector('.drive-connect-collapse'), null);
  assert.match(text, new RegExp(CONNECT_WITH_TITLE));
  assert.match(text, new RegExp(CONNECT_GOOGLE_UNVERIFIED_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const order = slotOrder(m.host);
  assert.deepEqual(
    order.slice(order.indexOf('share')),
    ['share', 'academy', 'preview', 'sunday', 'drive'],
  );
  m.done();
});

test('a Cloud gym trims Sunday Review, replaces the Drive-ids note, and collapses Connect with', async () => {
  reset();
  seedRevision();
  const m = await mount(true);
  const text = m.host.textContent ?? '';
  assert.doesNotMatch(text, /Class plans in your Google Drive/);
  assert.doesNotMatch(text, /Drive file ids on this phone/);
  assert.doesNotMatch(text, /Advantage does not store the video files/);
  assert.match(text, new RegExp(OWNER_CLOUD_TITLE));
  assert.match(text, new RegExp(OWNER_CLOUD_BODY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, new RegExp(OWNER_CLOUD_QUEUE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(m.host.querySelector('.drive-connect-collapse__btn')?.textContent?.trim(), CLOUD_CONNECT_COLLAPSE_LABEL);
  assert.doesNotMatch(text, new RegExp(CONNECT_WITH_TITLE));
  assert.doesNotMatch(text, new RegExp(CONNECT_GOOGLE_UNVERIFIED_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const order = slotOrder(m.host);
  assert.deepEqual(
    order.slice(order.indexOf('share')),
    ['share', 'academy', 'preview', 'sunday', 'drive-collapse'],
  );
  m.done();
});

test('tapping the Cloud collapse line expands the Drive card with short copy and the Google notice', async () => {
  reset();
  const m = await mount(true);
  const toggle = m.host.querySelector('.drive-connect-collapse__btn') as HTMLButtonElement | null;
  assert.ok(toggle);
  await act(async () => {
    toggle?.click();
  });
  await settle();
  const text = m.host.textContent ?? '';
  assert.match(text, new RegExp(CLOUD_CONNECT_OPTIONAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, new RegExp(CONNECT_WITH_TITLE));
  assert.match(text, new RegExp(CONNECT_GOOGLE_UNVERIFIED_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(m.host.querySelector('.drive-connect__providers'));
  m.done();
});

test('a hyphenated class name shows in full on the Sunday Review link and wraps', async () => {
  reset();
  seedRevision();
  const m = await mount(true);
  const link = [...m.host.querySelectorAll('.plan-card__review-link')].find((node) =>
    (node.textContent ?? '').includes('Tiny Champions Week 11, Class A'),
  );
  assert.ok(link, 'the class name after the hyphen must be visible');
  assert.match(link?.textContent ?? '', new RegExp(CLASS_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(link?.getAttribute('href'), '/review?revision=draft%3A2026-11-09%3Aprofessor%20justin%20geis%3Atiny-week-11-a');
  const { readFileSync } = await import('node:fs');
  const css = readFileSync('src/index.css', 'utf8');
  assert.match(css, /\.plan-card__review-link\s*\{[^}]*white-space:\s*normal/);
  assert.match(css, /\.plan-card__review-link\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /\.plan-card__review-link\s*\{[^}]*text-overflow:\s*ellipsis/);
  m.done();
});
