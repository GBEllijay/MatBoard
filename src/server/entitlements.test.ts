import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileEntitlementStore } from './fileEntitlements.ts';
import {
  applyEntitlement,
  applyProEntitlement,
  emptyEntitlementIndex,
  entitlementByEmail,
  kvEntitlementStore,
  memoryEntitlementStore,
  parseEntitlementIndex,
  proEntitlementByEmail,
  proEntitlementStatus,
  type KvBinding,
  type ProEntitlement,
  type WhiteEntitlement,
} from './entitlements.ts';

function purchase(overrides: Partial<WhiteEntitlement> = {}): WhiteEntitlement {
  return {
    email: 'gym@example.com',
    sessionId: 'cs_test_123',
    product: 'advantage-white',
    amountTotal: 999,
    currency: 'usd',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

test('memory store records email and session once', async () => {
  const store = memoryEntitlementStore();
  const saved = await store.save(purchase({ email: ' Gym@Example.com ' }));
  assert.equal(saved.email, 'gym@example.com');
  assert.equal((await store.findByEmail('GYM@example.com'))?.sessionId, 'cs_test_123');
  assert.equal((await store.findBySessionId('cs_test_123'))?.email, 'gym@example.com');
  const again = await store.save(purchase({ createdAt: '2026-10-02T00:00:00.000Z' }));
  assert.equal(again.createdAt, '2026-10-01T00:00:00.000Z');
});

test('a later session for the same email becomes the email lookup', () => {
  const index = emptyEntitlementIndex();
  applyEntitlement(index, purchase());
  applyEntitlement(
    index,
    purchase({ sessionId: 'cs_test_456', amountTotal: 499, createdAt: '2026-10-02T00:00:00.000Z' }),
  );
  assert.equal(entitlementByEmail(index, 'gym@example.com')?.sessionId, 'cs_test_456');
  assert.equal(index.sessions.cs_test_123.amountTotal, 999);
});

test('KV store round-trips the entitlement index', async () => {
  const keys = new Map<string, string>();
  const kv: KvBinding = {
    async get(key) {
      return keys.get(key) ?? null;
    },
    async put(key, value) {
      keys.set(key, value);
    },
  };
  const store = kvEntitlementStore(kv);
  await store.save(purchase());
  assert.equal((await store.findBySessionId('cs_test_123'))?.email, 'gym@example.com');
  assert.equal(keys.size, 1);
});

function pro(overrides: Partial<ProEntitlement> = {}): ProEntitlement {
  return {
    email: 'owner@gym.test',
    sessionId: 'cs_test_pro',
    subscriptionId: 'sub_test_pro',
    product: 'advantage-pro',
    status: 'active',
    amountTotal: 10298,
    currency: 'usd',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

test('Pro subscription lookup stays off the White email index', async () => {
  const store = memoryEntitlementStore();
  await store.save(purchase({ email: 'owner@gym.test', sessionId: 'cs_test_white' }));
  await store.savePro(pro());
  assert.equal((await store.findByEmail('owner@gym.test'))?.sessionId, 'cs_test_white');
  assert.equal((await store.findByEmail('owner@gym.test'))?.product, 'advantage-white');
  assert.equal((await store.findProByEmail('Owner@Gym.test'))?.sessionId, 'cs_test_pro');
  assert.equal((await store.findProBySubscriptionId('sub_test_pro'))?.status, 'active');
  assert.equal(proEntitlementStatus(await store.findProBySessionId('cs_test_pro')).entitled, true);
});

test('a renewal keeps the Checkout session and a cancel removes entitlement', () => {
  const index = emptyEntitlementIndex();
  applyProEntitlement(index, pro({ sessionId: 'sub_test_pro' }));
  const renewed = applyProEntitlement(
    index,
    pro({
      sessionId: 'cs_test_pro',
      amountTotal: 299,
      updatedAt: '2026-11-01T00:00:00.000Z',
    }),
  );
  assert.equal(renewed.sessionId, 'cs_test_pro');
  assert.equal(renewed.amountTotal, 299);
  assert.equal(index.proSessions.sub_test_pro, undefined);
  assert.equal(index.proSubscriptions.sub_test_pro, 'cs_test_pro');
  const canceled = applyProEntitlement(
    index,
    pro({ status: 'inactive', amountTotal: null, updatedAt: '2026-12-01T00:00:00.000Z' }),
  );
  assert.equal(canceled.sessionId, 'cs_test_pro');
  assert.equal(canceled.amountTotal, 299);
  assert.equal(proEntitlementStatus(proEntitlementByEmail(index, 'owner@gym.test')).entitled, false);
});

test('an older White index still parses and can store Pro beside it', () => {
  const index = parseEntitlementIndex(
    JSON.stringify({
      sessions: {
        cs_test_white: {
          email: 'gym@example.com',
          sessionId: 'cs_test_white',
          product: 'advantage-white',
          amountTotal: 999,
          currency: 'usd',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      },
      emails: { 'gym@example.com': 'cs_test_white' },
    }),
  );
  assert.equal(entitlementByEmail(index, 'gym@example.com')?.sessionId, 'cs_test_white');
  applyProEntitlement(index, pro());
  assert.equal(index.sessions.cs_test_white.product, 'advantage-white');
  assert.equal(index.proSessions.cs_test_pro.subscriptionId, 'sub_test_pro');
});

test('file store writes email and session id', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'white-entitlements-'));
  const file = join(dir, 'white-entitlements.json');
  const store = fileEntitlementStore(file);
  await store.save(purchase());
  const saved = JSON.parse(readFileSync(file, 'utf8')) as {
    sessions: Record<string, { email: string }>;
    emails: Record<string, string>;
  };
  assert.equal(saved.sessions.cs_test_123.email, 'gym@example.com');
  assert.equal(saved.emails['gym@example.com'], 'cs_test_123');
  assert.equal((await store.findByEmail('gym@example.com'))?.sessionId, 'cs_test_123');
  await store.savePro(pro());
  assert.equal((await store.findProBySubscriptionId('sub_test_pro'))?.sessionId, 'cs_test_pro');
  assert.equal((await store.findBySessionId('cs_test_123'))?.email, 'gym@example.com');
});
