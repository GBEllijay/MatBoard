/**
 * Review card on /review?revision=…: pending plans keep Approve / Request
 * changes / Reject, and a decided plan shows a status badge plus Change decision.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ReviewInboxPage } from './ReviewInbox.tsx';
import { clearEntitlementToken, setEntitlementConfigForTests } from '../lib/entitlement.ts';
import { decideReview, REVIEW_APPROVE, REVIEW_CHANGE_DECISION, REVIEW_CHANGES, REVIEW_REJECT, submitForReview } from '../lib/reviewInbox.ts';
import { applyOwnerTestGrant, clearOwnerTestGrant } from '../lib/ownerTestGrant.ts';
import { emptyPlan } from '../lib/trainingNotesStore.ts';

const REVISION_ID = 'draft:2026-11-09:professor justin geis:tiny-week-11-a';

const dom = new Window({ url: `http://localhost/review?revision=${encodeURIComponent(REVISION_ID)}` });
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
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);
installGlobal('fetch', async () => new Response('{}', { status: 503 }));

if (typeof import.meta.env === 'undefined') {
  Object.defineProperty(import.meta, 'env', { configurable: true, value: { DEV: false, MODE: 'test' } });
}

function reset() {
  localStorage.clear();
  sessionStorage.clear();
  clearOwnerTestGrant();
  clearEntitlementToken();
  setEntitlementConfigForTests({ signing: false, keys: [], legacyAmnestyEndsAt: '2099-01-01T00:00:00.000Z' });
  applyOwnerTestGrant({ grants: ['pro'], expiresAt: '2099-01-01T00:00:00.000Z', tier: 'pro' });
}

function seedSubmission(status: 'pending' | 'approved' | 'changes' | 'rejected', instructorNote = '') {
  const plan = emptyPlan();
  plan.id = 'tiny-week-11-a';
  plan.coachName = 'Professor Justin Geis';
  plan.classDesignation = 'Tiny Champions';
  plan.classTime = '5:00 PM';
  plan.intro = 'Warm-up and passing.';
  const submitted = submitForReview({
    revisionId: REVISION_ID,
    dateKey: '2026-11-09',
    coachName: 'Professor Justin Geis',
    plan,
    submittedAt: Date.parse('2026-11-09T16:00:00.000Z'),
  });
  if (status !== 'pending') {
    const decided = decideReview(submitted.id, status, instructorNote);
    assert.equal(decided?.status, status);
  }
  return submitted;
}

async function settle() {
  for (let step = 0; step < 8; step += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/review?revision=${encodeURIComponent(REVISION_ID)}`]}>
        <ReviewInboxPage />
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

function card(host: HTMLElement) {
  return host.querySelector('article[aria-label="This submission"]');
}

test('a pending plan keeps the note box and Approve, Request changes, and Reject', async () => {
  reset();
  seedSubmission('pending');
  const m = await mount();
  const root = card(m.host);
  assert.ok(root);
  assert.match(root?.textContent ?? '', /Waiting for review/);
  assert.ok(root?.querySelector('#review-note'));
  const labels = [...(root?.querySelectorAll('.review-inbox__actions button') ?? [])].map((node) => node.textContent?.trim());
  assert.deepEqual(labels, [REVIEW_APPROVE, REVIEW_CHANGES, REVIEW_REJECT]);
  assert.equal(root?.querySelector('.review-status-badge'), null);
  assert.equal(root?.querySelector('.review-change-decision'), null);
  m.done();
});

test('an approved plan hides the controls and shows a green Approved badge plus Change decision', async () => {
  reset();
  seedSubmission('approved');
  const m = await mount();
  const root = card(m.host);
  assert.ok(root);
  const badge = root?.querySelector('.review-status-badge--approved');
  assert.equal(badge?.textContent?.trim(), 'Approved');
  assert.equal(root?.querySelector('#review-note'), null);
  assert.equal(root?.querySelector('.review-inbox__actions'), null);
  assert.equal(root?.querySelector('.review-change-decision')?.textContent?.trim(), REVIEW_CHANGE_DECISION);
  m.done();
});

test('a plan with changes requested keeps the saved note and an amber badge', async () => {
  reset();
  seedSubmission('changes', 'Add a kneecut finish.');
  const m = await mount();
  const root = card(m.host);
  assert.ok(root);
  assert.equal(root?.querySelector('.review-status-badge--changes')?.textContent?.trim(), 'Changes requested');
  assert.match(root?.textContent ?? '', /Add a kneecut finish\./);
  assert.equal(root?.querySelector('#review-note'), null);
  assert.equal(root?.querySelector('.review-inbox__actions'), null);
  m.done();
});

test('a rejected plan shows a red Rejected badge and Change decision restores the controls', async () => {
  reset();
  seedSubmission('rejected', 'Too long for this class.');
  const m = await mount();
  const root = card(m.host);
  assert.ok(root);
  assert.equal(root?.querySelector('.review-status-badge--rejected')?.textContent?.trim(), 'Rejected');
  assert.match(root?.textContent ?? '', /Too long for this class\./);
  const change = root?.querySelector('.review-change-decision') as HTMLButtonElement | null;
  assert.ok(change);
  await act(async () => {
    change?.click();
  });
  await settle();
  const open = card(m.host);
  assert.ok(open?.querySelector('#review-note'));
  const labels = [...(open?.querySelectorAll('.review-inbox__actions button') ?? [])].map((node) => node.textContent?.trim());
  assert.deepEqual(labels, [REVIEW_APPROVE, REVIEW_CHANGES, REVIEW_REJECT]);
  assert.equal(open?.querySelector('.review-status-badge--rejected')?.textContent?.trim(), 'Rejected');
  m.done();
});

test('an owner-authored plan opens already approved and skips Waiting for review', async () => {
  reset();
  const plan = emptyPlan();
  plan.id = 'tiny-week-11-a';
  plan.coachName = 'Professor Justin Geis';
  plan.classDesignation = 'Tiny Champions';
  plan.classTime = '5:00 PM';
  const submitted = submitForReview({
    revisionId: REVISION_ID,
    dateKey: '2026-11-09',
    coachName: 'Professor Justin Geis',
    plan,
    submittedAt: Date.parse('2026-11-09T16:00:00.000Z'),
    actor: 'owner',
  });
  assert.equal(submitted.status, 'approved');
  const m = await mount();
  const root = card(m.host);
  assert.ok(root);
  assert.equal(root?.querySelector('.review-status-badge--approved')?.textContent?.trim(), 'Approved');
  assert.equal(root?.textContent?.includes('Waiting for review'), false);
  assert.equal(root?.querySelector('#review-note'), null);
  assert.equal(root?.querySelector('.review-inbox__actions'), null);
  assert.equal(root?.querySelector('.review-change-decision')?.textContent?.trim(), REVIEW_CHANGE_DECISION);
  m.done();
});
