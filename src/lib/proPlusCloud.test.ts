import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Door, EntitlementClaims } from './entitlementToken.ts';
import { applyOwnerTestGrant, clearOwnerTestGrant } from './ownerTestGrant.ts';
import { proPlusCloudDoorOpen, proPlusCloudStripePro, proPlusCloudUnlocked, type ProPlusCloudPass } from './proPlusCloud.ts';

if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    configurable: true,
  });
}

const page = readFileSync(new URL('../pages/ProPlusCloud.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8');
const pro = readFileSync(new URL('../pages/Pro.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const gate = readFileSync(new URL('./proPlusCloud.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const storefrontCss = readFileSync(new URL('../pages/storefront.css', import.meta.url), 'utf8');

function pass(partial: Partial<EntitlementClaims> & Pick<EntitlementClaims, 'src' | 'tier' | 'grants'>): ProPlusCloudPass {
  return partial;
}

const proGrants: Door[] = ['white', 'student', 'coach', 'pro', 'media'];

test('Pro Plus Cloud opens for the owner test pass and an alpha-pro code only', () => {
  clearOwnerTestGrant();
  assert.equal(proPlusCloudUnlocked(), false);
  assert.equal(proPlusCloudDoorOpen(null), false);

  applyOwnerTestGrant({
    grants: ['pro', 'coach', 'media', 'student', 'white'],
    expiresAt: '2099-01-01T00:00:00.000Z',
    tier: 'all',
  });
  assert.equal(proPlusCloudUnlocked(), true);
  assert.equal(proPlusCloudDoorOpen(null), true);
  clearOwnerTestGrant();

  applyOwnerTestGrant({
    grants: ['pro', 'student'],
    expiresAt: '2099-01-01T00:00:00.000Z',
    tier: 'pro',
  });
  assert.equal(proPlusCloudDoorOpen(null), true);
  clearOwnerTestGrant();

  applyOwnerTestGrant({
    grants: ['white'],
    expiresAt: '2099-01-01T00:00:00.000Z',
    tier: 'white',
  });
  assert.equal(proPlusCloudUnlocked(), false);
  clearOwnerTestGrant();

  assert.equal(proPlusCloudDoorOpen(pass({ src: 'owner', tier: 'owner', grants: proGrants })), true);
  assert.equal(proPlusCloudDoorOpen(pass({ src: 'code', tier: 'owner', grants: ['white'] })), true);
  assert.equal(
    proPlusCloudDoorOpen(pass({ src: 'code', tier: 'alpha', grants: proGrants })),
    true,
    'alpha-pro',
  );

  assert.equal(
    proPlusCloudDoorOpen(pass({ src: 'stripe', tier: 'pro', grants: proGrants, subs: { state: 'active' } })),
    false,
    'stripe pro',
  );
  assert.equal(
    proPlusCloudDoorOpen(pass({ src: 'stripe', tier: 'pro', grants: proGrants, subs: { state: 'locked' } })),
    false,
    'locked pro',
  );
  assert.equal(proPlusCloudDoorOpen(pass({ src: 'seat', tier: 'seat', grants: [] })), false);
  assert.equal(proPlusCloudDoorOpen(pass({ src: 'code', tier: 'seat', grants: proGrants })), false);
  assert.equal(
    proPlusCloudDoorOpen(pass({ src: 'code', tier: 'alpha', grants: ['white', 'student', 'coach', 'media'] })),
    false,
    'alpha-coach',
  );
  assert.equal(proPlusCloudDoorOpen(pass({ src: 'code', tier: 'alpha', grants: ['white', 'student'] })), false);
  assert.equal(proPlusCloudDoorOpen(pass({ src: 'code', tier: 'alpha', grants: ['white', 'student', 'media'] })), false);
  assert.equal(proPlusCloudDoorOpen(pass({ src: 'free', tier: 'white', grants: ['white'] })), false);
  assert.equal(proPlusCloudDoorOpen(null), false);
  clearOwnerTestGrant();
});

test('a Stripe Pro pass is sent to /pro, and a locked Pro pass is not', () => {
  clearOwnerTestGrant();
  const active = pass({ src: 'stripe', tier: 'pro', grants: proGrants, subs: { state: 'active' } });
  const locked = pass({ src: 'stripe', tier: 'pro', grants: proGrants, subs: { state: 'locked' } });
  assert.equal(proPlusCloudStripePro(active), true);
  assert.equal(proPlusCloudDoorOpen(active), false);
  assert.equal(proPlusCloudStripePro(locked), false);
  assert.equal(proPlusCloudStripePro(pass({ src: 'code', tier: 'alpha', grants: ['white', 'student', 'coach', 'media'] })), false);
  assert.equal(proPlusCloudStripePro(null), false);
});

test('the cloud gate does not read a Pro unlock as the whole check', () => {
  assert.doesNotMatch(gate, /isProUnlocked|proUnlocked/);
  assert.doesNotMatch(gate, /alpha-pro-plus-cloud|advantage-pro-plus-cloud|CODE_KINDS|CHECKOUT_PRODUCTS/);
});

test('Pro Plus Cloud page is the owner menu, and the cloud block is plain text', () => {
  assert.match(page, /<main className="home home--pro"/);
  assert.match(page, /<PlayExitMark to=\{PRODUCTS_PATH\} \/>/);
  assert.match(page, /<HomeMark to=\{PRODUCTS_PATH\} \/>/);
  assert.match(page, /<BeltHeader kind="black" worn title=\{PRO_PLUS_CLOUD_NAME\} blurb=\{PRO_PLUS_CLOUD_BELT_BLURB\} \/>/);
  assert.match(page, /consoleHubs\(door/);
  assert.match(page, /<ProToolboxCard hubs=\{hubs\}/);
  assert.doesNotMatch(page, /AcademyPathwayPanel|DriveConnectCard/);
  assert.doesNotMatch(page, /fetch\(|stripe\.com|oauth|WHITE_CHECKOUT|Continue to checkout|lockPro|lockMedia/i);
  assert.match(page, /ADVANTAGE_CLOUD_UPLOAD_STEPS/);
  assert.match(page, /ADVANTAGE_CLOUD_DRIVE_NOTE/);
  const blockStart = page.indexOf('data-cloud-block="advantage-cloud"');
  const blockEnd = page.indexOf('</section>', blockStart);
  assert.ok(blockStart > 0 && blockEnd > blockStart);
  const block = page.slice(blockStart, blockEnd);
  assert.match(block, /plan-card__kicker/);
  assert.doesNotMatch(block, /<button|<a |disabled|Link /);
  assert.match(pro, /AcademyPathwayPanel/);
  assert.match(pro, /kind=\{mediaSeat \? 'purple' : 'black'\}/);
  assert.match(pro, /worn=\{!mediaSeat\}/);
  assert.doesNotMatch(pro, /plain|red-bar|pro-cloud/);
});

test('the products card still uses this gate, and the open card is a plain link', () => {
  assert.match(home, /useProPlusCloudUnlocked/);
  assert.match(home, /\{PRO_PLUS_CLOUD_OPEN_LABEL\}/);
  assert.match(home, /to=\{PRO_PLUS_CLOUD_PATH\}/);
  assert.match(home, /aria-label=\{\`\$\{PRO_PLUS_CLOUD_NAME\}, coming soon\`\}/);
  assert.match(home, /PRO_PLUS_CLOUD_PRICE_LINE/);
  assert.doesNotMatch(home, /Continue to checkout/);
  const card = home.slice(home.indexOf('function ProPlusCloudCard'), home.length);
  const openCard = card.slice(card.indexOf('if (open)'), card.indexOf('mode-card--locked'));
  assert.match(openCard, /mode-card mode-card--pro mode-card--cloud"/);
  assert.doesNotMatch(openCard, /mode-card--locked/);
  assert.match(openCard, /to=\{PRO_PLUS_CLOUD_PATH\}/);
  assert.doesNotMatch(card, /disabled/);
});

test('the cloud route is its own guard, and /pro keeps the worn black belt', () => {
  const route = app.slice(app.indexOf('function ProPlusCloudRoute'), app.indexOf('function ProConsoleRoute'));
  assert.match(route, /useProPlusCloudUnlocked/);
  assert.match(route, /proPlusCloudStripePro/);
  assert.match(route, /<Navigate to="\/pro" replace \/>/);
  assert.match(route, /closedOrPaused\(door\.seated\)/);
  assert.match(route, /if \(open\) return <ProPlusCloudPage \/>/);
  assert.doesNotMatch(route, /ProConsoleRoute/);
  assert.match(app, /path="\/pro-plus-cloud" element=\{<ProPlusCloudRoute \/>\}/);
  assert.match(css, /\.belt-header--worn\.belt-header--black \.belt-header__stripe \{\s*flex: 0 0 var\(--bar-white\);\s*background: #f7f7f5;/);
  assert.match(storefrontCss, /\.sf-belt--striped[\s\S]*#f4f1ea 80% 82%/);
});
