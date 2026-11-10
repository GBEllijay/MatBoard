import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Door, EntitlementClaims } from './entitlementToken.ts';
import { applyOwnerTestGrant, clearOwnerTestGrant } from './ownerTestGrant.ts';
import { inviteBlockedAsSeat, ownerPassOutranksSeat } from './ownerPassRank.ts';
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
  const owner = pass({ src: 'code', tier: 'alpha', grants: proGrants }) as EntitlementClaims;
  const seatPass = pass({ src: 'seat', tier: 'seat', grants: [] }) as EntitlementClaims;
  assert.equal(ownerPassOutranksSeat(owner), true);
  assert.equal(inviteBlockedAsSeat({ id: 'seat-1' }, owner), false);
  assert.equal(inviteBlockedAsSeat({ id: 'seat-1' }, seatPass), true);
  assert.equal(inviteBlockedAsSeat(null, owner), false);
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

test('Pro Plus Cloud page is the head instructor home', () => {
  assert.match(page, /<main className="home home--pro home--pro-menu"/);
  assert.match(page, /<PlayExitMark to=\{PRODUCTS_PATH\} \/>/);
  assert.match(page, /<HomeMark to=\{PRODUCTS_PATH\} \/>/);
  assert.match(page, /<PlusCloudConduct \/>/);
  assert.match(page, /<BeltHeader kind="black" worn title=\{PRO_PLUS_CLOUD_NAME\} blurb=\{PRO_PLUS_CLOUD_BELT_BLURB\} \/>/);
  assert.match(page, /consoleHubs\(door/);
  assert.match(page, /<ProToolboxCard hubs=\{hubs\}/);
  assert.doesNotMatch(page, /AdvantageCloudHome/);
  assert.match(page, /<InstructorInvitePanel \/>/);
  assert.doesNotMatch(page, /Coming soon|How uploading will work|ADVANTAGE_CLOUD_UPLOAD_STEPS/);
  assert.doesNotMatch(page, /AcademyPathwayPanel|DriveConnectCard/);
  assert.doesNotMatch(page, /fetch\(|stripe\.com|oauth|WHITE_CHECKOUT|Continue to checkout|lockPro|lockMedia/i);
  const home = readFileSync(new URL('../components/AdvantageCloudHome.tsx', import.meta.url), 'utf8');
  assert.match(home, /data-cloud-block="advantage-cloud"/);
  assert.match(home, /cloudHomeStatusLine/);
  assert.match(home, /Check again/);
  assert.match(home, /refreshEntitlement/);
  assert.doesNotMatch(home, /Connect Google|OneDrive/);
  assert.match(home, /CLOUD_ROLE_HOME/);
  assert.match(home, /ADVANTAGE_CLOUD_DRIVE_NOTE/);
  assert.match(home, /CLOUD_DAILY_MEDIA_LABEL/);
  assert.match(home, /MEDIA_LIBRARY_ACCEPT/);
  assert.match(home, /Upload lesson-plan media/);
  assert.doesNotMatch(home, /UNLIMITED_VIDEOS_PATH/);
  assert.match(home, /UNLIMITED_LESSON_PATH/);
  const daily = readFileSync(new URL('./dailyOwnerUpload.ts', import.meta.url), 'utf8');
  assert.match(daily, /Upload daily videos and photos/);
  assert.match(daily, /publishGymFile/);
  assert.match(daily, /did not store this photo/);
  assert.match(home, /export function CloudUsageMetric/);
  assert.match(home, /<Sheet /);
  assert.doesNotMatch(home, /Coming soon/);
  const saver = readFileSync(new URL('../pages/Screensaver.tsx', import.meta.url), 'utf8');
  assert.match(saver, /cloudCustomer \? <AdvantageCloudHome \/> : null/);
  const academy = readFileSync(new URL('../components/GymCharacterSheet.tsx', import.meta.url), 'utf8');
  assert.match(academy, /useProPlusCloudUnlocked/);
  assert.match(academy, /academyCloudTileVisible/);
  assert.match(academy, /data-zone="cloud"/);
  assert.match(academy, /data-zone="tenure"/);
  assert.doesNotMatch(academy, /DriveConnectCard/);
  const invite = readFileSync(new URL('../components/InstructorInvitePanel.tsx', import.meta.url), 'utf8');
  assert.match(invite, /qrDataUrl/);
  assert.match(invite, /Copy invite link/);
  assert.match(invite, /InviteQr/);
  assert.match(pro, /AcademyPathwayPanel/);
  assert.match(pro, /kind=\{mediaSeat \? 'purple' : 'black'\}/);
  assert.match(pro, /worn=\{!mediaSeat\}/);
  assert.doesNotMatch(pro, /plain|red-bar|pro-cloud/);
});

test('the products page keeps Pro and Pro + Cloud as separate open links', () => {
  assert.match(home, /useProPlusCloudUnlocked/);
  assert.match(home, /PRO_PLUS_CLOUD_OPEN_LABEL/);
  assert.match(home, /ownerEditionTarget/);
  assert.match(home, /to="\/pro"/);
  assert.match(home, /to=\{PRO_PLUS_CLOUD_PATH\}/);
  assert.doesNotMatch(home, /to=\{cloudOpen \? PRO_PLUS_CLOUD_PATH : '\/pro'\}/);
  assert.doesNotMatch(home, /function ProPlusCloudCard/);
  assert.doesNotMatch(home, /mode-card--cloud/);
  assert.doesNotMatch(home, /Continue to checkout/);
});

test('Pro and Pro + Cloud show the academy profile under the belt', () => {
  const sheetAt = page.indexOf('<GymCharacterSheet />');
  const beltAt = page.indexOf('<BeltHeader');
  assert.ok(beltAt > -1 && sheetAt > beltAt);
  assert.match(page, /home--pro-menu/);
  assert.match(page, /<HomeMark to=\{PRODUCTS_PATH\} \/>/);
  assert.match(page, /<PlayExitMark to=\{PRODUCTS_PATH\} \/>/);
  assert.doesNotMatch(page, /Academy profile/);
  assert.match(pro, /<GymCharacterSheet \/>/);
  const proSheet = pro.indexOf('<GymCharacterSheet />');
  const proBelt = pro.indexOf('<BeltHeader');
  const proWhite = pro.indexOf('data-pro-entry="white"');
  const proStudent = pro.indexOf('data-pro-entry="student"');
  const proHubs = pro.indexOf('<ProToolboxCard');
  assert.ok(proBelt > -1 && proSheet > proBelt);
  assert.ok(proWhite > proSheet && proStudent > proWhite && proHubs > proStudent);
  assert.match(pro, /to="\/white"/);
  assert.match(pro, /to="\/student"/);
  assert.match(pro, /home--pro-menu/);
  assert.doesNotMatch(pro, /preview\/white-hub|preview\/pro-home/);
  assert.match(pro, /cloudConsole \? <PlayExitMark to=\{PRO_PLUS_CLOUD_PATH\} \/> : null/);
  assert.match(pro, /<HomeMark to=\{PRODUCTS_PATH\} \/>/);
  assert.doesNotMatch(pro, /AdvantageCloudHome/);
  assert.doesNotMatch(pro, /Navigate to=\{PRO_PLUS_CLOUD_PATH\}/);
  const css = readFileSync(new URL('../components/gymSheet.css', import.meta.url), 'utf8');
  assert.match(css, /\.home--pro \.home__inner \{\s*padding-top: calc\(var\(--mark-home\) \+ 1rem \+ var\(--safe-t\)\);/);
});

test('the public Pro + Cloud belt is the alpha page, not the console', () => {
  const info = readFileSync(new URL('../pages/ProPlusCloudInfo.tsx', import.meta.url), 'utf8');
  const belts = readFileSync(new URL('./storefrontBelts.ts', import.meta.url), 'utf8');
  assert.match(app, /path="\/editions\/pro-cloud" element=\{<ProPlusCloudInfoPage \/>\}/);
  assert.match(app, /path="\/pro-plus-cloud" element=\{<ProPlusCloudRoute \/>\}/);
  assert.match(info, /Not for sale on this page/);
  assert.match(info, /AlphaCodeEntry tier="pro-cloud"/);
  assert.doesNotMatch(info, /useProPlusCloudUnlocked|redeemAccessCode|localStorage/);
  assert.match(belts, /to: PRO_PLUS_CLOUD_INFO_PATH/);
  assert.doesNotMatch(belts, /proPlusCloudUnlocked|cloudOpen/);
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
