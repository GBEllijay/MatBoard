import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { requestUpgradeQuote, upgradeButtonPrice, upgradeQuoteNote, UPGRADE_QUOTE_API } from './upgradeQuoteClient.ts';

function reply(status: number, body: unknown): typeof fetch {
  return async (input, init) => {
    assert.equal(String(input), UPGRADE_QUOTE_API);
    assert.equal(init?.method, 'POST');
    return new Response(JSON.stringify(body), { status });
  };
}

test('a credit quote becomes "Upgrade for $X"', async () => {
  const quote = await requestUpgradeQuote(
    { tier: 'pro', email: ' a@b.co ', halfOff: false },
    reply(200, { ok: true, tier: 'pro', listPriceCents: 9999, upgradePriceCents: 9000, creditApplied: 999 }),
  );
  assert.equal(upgradeButtonPrice(quote), '$90.00');
  assert.match(upgradeQuoteNote(quote) ?? '', /Upgrade for \$90\.00: \$9\.99 credit/);
});

test('no credit keeps the normal label; owned and errors show a message', async () => {
  const none = await requestUpgradeQuote(
    { tier: 'student', email: 'a@b.co', halfOff: false },
    reply(200, { ok: true, tier: 'student', listPriceCents: 1999, upgradePriceCents: 1999, creditApplied: 0 }),
  );
  assert.equal(upgradeButtonPrice(none), null);
  assert.match(upgradeQuoteNote(none) ?? '', /Full price/);
  const owned = await requestUpgradeQuote(
    { tier: 'coach', email: 'a@b.co', halfOff: false },
    reply(200, { ok: true, tier: 'coach', owned: true, message: 'This email already owns Instructor Edition.' }),
  );
  assert.equal(owned.kind, 'owned');
  assert.equal(upgradeButtonPrice(owned), null);
  const failed = await requestUpgradeQuote({ tier: 'pro', email: 'a@b.co', halfOff: false }, async () => {
    throw new Error('offline');
  });
  assert.equal(failed.kind, 'error');
  assert.equal(upgradeButtonPrice(null), null);
});

test('tier buy pages keep their gates and send the optional email only when typed', () => {
  const page = readFileSync(new URL('../pages/BuyTier.tsx', import.meta.url), 'utf8');
  assert.match(page, /tier\.product === 'pro'\s*\? proUnlocked/);
  assert.match(page, /tier\.product === 'student'\s*\? studentDoor/);
  assert.match(page, /mediaDoor \|\| proUnlocked/);
  assert.match(page, /upgradeEmail\.trim\(\) \? \{ email: upgradeEmail\.trim\(\) \} : \{\}/);
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /path="\/buy\/media"[\s\S]*?<BuyMediaRoute>/);
  assert.match(app, /path="\/buy\/coach"[\s\S]*?<CoachRoute>/);
  assert.match(app, /path="\/buy\/pro"[\s\S]*?<BuyProRoute>/);
  assert.match(app, /path="\/buy\/student"[\s\S]*?<BuyStudentRoute>/);
});
