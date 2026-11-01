import assert from 'node:assert/strict';
import test from 'node:test';
import {
  POLISHED_SKINS,
  POLISHED_SKIN_BUY_PATH,
  POLISHED_SKIN_UNLOCK_NOTE,
  polishedSkinAccessFromDoors,
  polishedSkinsUnlocked,
} from './polishedSkins.ts';
import { MEDIA_HOME_PATH, mediaConsoleDoorOpen } from './productNames.ts';
import {
  DEFAULT_SCOREBOARD_SKIN,
  SCOREBOARD_SKIN,
  SELECTABLE_SCOREBOARD_SKINS,
  parseScoreboardSkin,
  pickerBaseScoreboardSkins,
  visibleScoreboardSkin,
} from './scoreboardSkin.ts';
import { DEFAULT_TRAINING_SKIN, TRAINING_SKIN_KEY, getTrainingSkin, setTrainingSkin, visibleTrainingSkin } from './trainingSkin.ts';
import { expandGrants, grantsForProduct } from '../server/grantMatrix.ts';
import { grantsForKind } from '../server/codeCatalog.ts';
import { API_PRODUCT_COACH, API_PRODUCT_ID, API_PRODUCT_MEDIA, API_PRODUCT_PRO, API_PRODUCT_STUDENT } from '../server/routes.ts';
import { issueToken } from '../server/tokenIssue.ts';
import {
  acceptServerToken,
  clearEntitlementToken,
  setEntitlementClockForTests,
  setEntitlementConfigForTests,
} from './entitlement.ts';
import type { PrivateJwk, PublicJwk } from './entitlementToken.ts';
import { CLIENT_APP_VERSION } from './appCapability.ts';
import { isMediaUnlocked } from './mediaUnlock.ts';
import { isProUnlocked } from './proUnlock.ts';
import { impliedDoors } from './tierImplications.ts';
import { metalTimerTitle, psychedelicTimerTitle, reggaeTimerTitle, romanRound, timerNextLine, timerProgress } from '../skins/polished/timerText.ts';
import { brasilRing, keynoteRing, lerpHex } from '../skins/polished/ring.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    key: () => null,
    length: 0,
    clear: () => store.clear(),
  };
}
const local = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });

/** Instructor opens the skins exactly when the tier table gives it the Media door (PR #339). */
const COACH_HAS_MEDIA = impliedDoors(['coach']).includes('media');

const PRODUCTS = [
  ['White', API_PRODUCT_ID, false],
  ['Student', API_PRODUCT_STUDENT, false],
  ['Media', API_PRODUCT_MEDIA, true],
  ['Instructor (coach)', API_PRODUCT_COACH, COACH_HAS_MEDIA],
  ['Pro', API_PRODUCT_PRO, true],
] as const;

test('the eight polished skins, in picker order', () => {
  assert.deepEqual(
    POLISHED_SKINS.map((s) => s.label),
    ['Kids Arcade', 'Kids Sticker', 'Keynote', 'Heavy Metal', 'Brasil', 'Woodblock', 'Reggae', 'Psychedelic'],
  );
  assert.equal(POLISHED_SKIN_UNLOCK_NOTE, 'Unlock with Media Edition');
  assert.equal(POLISHED_SKIN_BUY_PATH, MEDIA_HOME_PATH);
});

test('tier rule from the real grant table: White and Student locked; Media, Pro, owner open; Instructor follows Media', () => {
  for (const [name, product, open] of PRODUCTS) {
    const doors = grantsForProduct(product);
    const access = polishedSkinAccessFromDoors(doors);
    assert.equal(polishedSkinsUnlocked(access), open, `${name} (${doors.join(',')})`);
    // No tier list in the skin gate: it is exactly the /media hub check.
    assert.equal(polishedSkinsUnlocked(access), mediaConsoleDoorOpen(access), `${name} matches the media check`);
  }
  assert.equal(polishedSkinsUnlocked(polishedSkinAccessFromDoors(expandGrants(grantsForKind('owner')))), true, 'owner unlock');
  assert.equal(polishedSkinsUnlocked(polishedSkinAccessFromDoors(expandGrants(grantsForKind('alpha-media')))), true, 'Media code');
  assert.equal(polishedSkinsUnlocked(polishedSkinAccessFromDoors(expandGrants(grantsForKind('free-white')))), false, 'free White code');
  assert.equal(polishedSkinsUnlocked(polishedSkinAccessFromDoors(expandGrants(grantsForKind('alpha-student')))), false, 'Student code');
  assert.equal(polishedSkinsUnlocked(polishedSkinAccessFromDoors([])), false, 'nothing');
});

test('seats follow the media check too: a seat opens the skins only when its invite opens the Media Console', () => {
  const seat = { seated: true, programDirectorSeat: false, coachMenus: true, proUnlocked: false, mediaUnlocked: true };
  assert.equal(polishedSkinsUnlocked({ ...seat, seatGrantsMedia: false }), false);
  assert.equal(polishedSkinsUnlocked({ ...seat, seatGrantsMedia: true }), true);
});

test(
  'Instructor unlocked once the tier table gives Coach the Media door (PR #339)',
  { skip: COACH_HAS_MEDIA ? false : 'waiting on PR #339: Coach does not open Media yet' },
  () => {
    assert.equal(polishedSkinsUnlocked(polishedSkinAccessFromDoors(grantsForProduct(API_PRODUCT_COACH))), true);
  },
);

const NOW = new Date('2026-10-30T12:00:00.000Z');

async function signIn(grants: string[]) {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  setEntitlementClockForTests(() => NOW.getTime());
  setEntitlementConfigForTests({ signing: true, keys: [{ kid: 'k1', jwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y } }] });
  const token = (await issueToken(JSON.stringify(privateJwk), {
    licenseId: 'lic-skin',
    grants: expandGrants(grants),
    tier: 'alpha',
    src: 'code',
    deviceId: 'dev',
    now: NOW,
    kind: 'code',
    appVersion: CLIENT_APP_VERSION,
  })) as string;
  assert.equal(await acceptServerToken(token), true);
}

/** Same inputs usePolishedSkinsUnlocked reads (useSeatDoor) on a browser with no seat. */
function browserGate(): boolean {
  return polishedSkinsUnlocked({
    seated: false,
    seatGrantsMedia: false,
    programDirectorSeat: false,
    coachMenus: false,
    proUnlocked: isProUnlocked(),
    mediaUnlocked: isMediaUnlocked(),
  });
}

test('signed passes on this browser: White and Student locked, Media and Pro unlocked, Instructor follows Media', async () => {
  const cases = [
    ['White', ['white'], false],
    ['Student', ['student'], false],
    ['Media', ['media'], true],
    ['Instructor', ['coach'], COACH_HAS_MEDIA],
    ['Pro', ['pro'], true],
  ] as const;
  for (const [name, grants, open] of cases) {
    local.clear();
    clearEntitlementToken();
    await signIn([...grants]);
    assert.equal(browserGate(), open, name);
    // Fallback: a saved polished pick paints the default skin while locked.
    assert.equal(
      visibleScoreboardSkin(SCOREBOARD_SKIN.KEYNOTE, true, false, false, browserGate()),
      open ? SCOREBOARD_SKIN.KEYNOTE : DEFAULT_SCOREBOARD_SKIN,
      `${name} scoreboard`,
    );
    assert.equal(visibleTrainingSkin('reggae', browserGate()), open ? 'reggae' : 'classic', `${name} timer`);
  }
  local.clear();
  clearEntitlementToken();
  assert.equal(browserGate(), false, 'no pass');
  setEntitlementClockForTests(null);
  setEntitlementConfigForTests(null);
});

test('existing skins are unchanged by the polished gate', () => {
  assert.deepEqual(
    SELECTABLE_SCOREBOARD_SKINS.map((s) => s.id),
    [SCOREBOARD_SKIN.MOCK_TOURNAMENT, SCOREBOARD_SKIN.OLD_SCHOOL, SCOREBOARD_SKIN.QUICK_RESULT],
  );
  for (const open of [false, true]) {
    for (const skin of [SCOREBOARD_SKIN.MOCK_TOURNAMENT, SCOREBOARD_SKIN.OLD_SCHOOL, SCOREBOARD_SKIN.QUICK_RESULT]) {
      assert.equal(visibleScoreboardSkin(skin, true, false, false, open), skin, `suite ${skin}`);
      assert.equal(visibleScoreboardSkin(skin, false, false, false, open), DEFAULT_SCOREBOARD_SKIN, `plain White ${skin}`);
    }
    assert.equal(visibleTrainingSkin('classic', open), 'classic');
    assert.equal(visibleTrainingSkin('themed', open), 'themed');
  }
  assert.deepEqual(pickerBaseScoreboardSkins(true).map((s) => s.id), [SCOREBOARD_SKIN.MOCK_TOURNAMENT]);
  assert.deepEqual(pickerBaseScoreboardSkins(false).map((s) => s.id), SELECTABLE_SCOREBOARD_SKINS.map((s) => s.id));
});

test('saved picks survive a reload; a locked one paints the default and is kept for later', () => {
  for (const skin of POLISHED_SKINS) {
    assert.equal(parseScoreboardSkin(skin.id), skin.id);
    assert.equal(visibleScoreboardSkin(skin.id, false, false, false, true), skin.id, 'unlocked plain White board');
    assert.equal(visibleScoreboardSkin(skin.id, true, true, false, false), DEFAULT_SCOREBOARD_SKIN, 'locked');
  }
  assert.equal(parseScoreboardSkin('NOPE'), DEFAULT_SCOREBOARD_SKIN);
  local.removeItem(TRAINING_SKIN_KEY);
  setTrainingSkin('woodblock');
  assert.equal(local.getItem(TRAINING_SKIN_KEY), 'woodblock');
  assert.equal(getTrainingSkin(), 'woodblock');
  assert.equal(visibleTrainingSkin(getTrainingSkin(), false), DEFAULT_TRAINING_SKIN);
  local.setItem(TRAINING_SKIN_KEY, 'bogus');
  assert.equal(getTrainingSkin(), DEFAULT_TRAINING_SKIN);
});

test('timer text: Reggae rest reads "Rest Easy", Psychedelic "Far Out"; Metal counts in Roman numerals', () => {
  assert.equal(reggaeTimerTitle(true, 3), 'Rest Easy');
  assert.equal(reggaeTimerTitle(false, 3), 'Round 3');
  assert.equal(psychedelicTimerTitle(true, 2), 'Far Out');
  assert.equal(psychedelicTimerTitle(false, 2), 'Round 2');
  assert.equal(metalTimerTitle(false, 3), 'Round III');
  assert.equal(metalTimerTitle(true, 3), 'Rest');
  assert.equal(romanRound(11), 'XI');
  assert.equal(romanRound(40), '40');
  assert.equal(timerNextLine(false, 300_000, 30_000, 2), 'NEXT · REST 00:30');
  assert.equal(timerNextLine(true, 300_000, 30_000, 2), 'NEXT · WORK 05:00 · ROUND 3');
});

test('timer progress --p is the remaining share, clamped 0..1', () => {
  assert.equal(timerProgress(150_000, 300_000), 0.5);
  assert.equal(timerProgress(400_000, 300_000), 1);
  assert.equal(timerProgress(-5, 300_000), 0);
  assert.equal(timerProgress(10, 0), 0);
});

test('Keynote and Brasil rings follow the live screen size', () => {
  const box = (svg: string) => (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);
  // Keynote: 84% x 76% of the screen; Brasil: 68% + 22 x 58% + 22.
  assert.deepEqual(box(keynoteRing(1280, 600, 0.5, false)), [0, 0, 1075.2, 456]);
  assert.deepEqual(box(keynoteRing(390, 844, 0.5, true)).map((n) => Math.round(n)), [0, 0, 328, 641]);
  assert.deepEqual(box(brasilRing(1280, 600, 0.25)).map((n) => Math.round(n)), [0, 0, 892, 370]);
  assert.equal(lerpHex([[0, '#000000'], [1, '#ffffff']], 0.5).toLowerCase(), '#808080');
});

test('Psychedelic motion runs only when the device allows motion', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../skins/polished/psychedelic.css', import.meta.url), 'utf8');
  const block = /@media \(prefers-reduced-motion:no-preference\)\{([^}]*\}[^}]*\})\s*\}/.exec(css);
  assert.ok(block, 'motion sits inside prefers-reduced-motion: no-preference');
  assert.match(block[1], /\.bg\{animation:psy-hue 60s/);
  assert.match(block[1], /\.spiral\{animation:psy-spin 90s/);
  // No animation anywhere else, so reduce (or no preference support) means a still screen.
  assert.equal(css.split('animation:').length - 1, 2);
});
