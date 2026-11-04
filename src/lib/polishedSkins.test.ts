import assert from 'node:assert/strict';
import test from 'node:test';
import {
  POLISHED_SKINS,
  POLISHED_TIMER_SKINS,
  polishedSkinAccessFromDoors,
  polishedSkinsUnlocked,
} from './polishedSkins.ts';
import { mediaConsoleDoorOpen } from './productNames.ts';
import {
  DEFAULT_SCOREBOARD_SKIN,
  SCOREBOARD_SKIN,
  SELECTABLE_SCOREBOARD_SKINS,
  parseScoreboardSkin,
  pickerBaseScoreboardSkins,
  scoreboardPickerSkins,
  visibleScoreboardSkin,
} from './scoreboardSkin.ts';
import {
  DEFAULT_TRAINING_SKIN,
  TRAINING_SKIN_KEY,
  getTrainingSkin,
  setTrainingSkin,
  timerPickerSkins,
  visibleTrainingSkin,
} from './trainingSkin.ts';
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
import {
  metalTimerTitle,
  psychedelicTimerTitle,
  reggaeTimerTitle,
  romanRound,
  timerNextLine,
  timerProgress,
  visionaryTimerTitle,
} from '../skins/polished/timerText.ts';
import { brasilRing, keynoteRing, lerpHex } from '../skins/polished/ring.ts';
import { fitNameBox } from '../skins/polished/fitNames.ts';
import { posterBoardState, posterTimerTitle } from '../skins/polished/posterSkins.ts';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

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

test('the nine polished families in picker order; Calçadão is a timer-only option after Brasil', () => {
  assert.deepEqual(
    POLISHED_SKINS.map((s) => s.label),
    ['Kids Arcade', 'Kids Sticker', 'Keynote', 'Heavy Metal', 'Brasil', 'Woodblock', 'Reggae', 'Psychedelic', 'Visionary', 'Creature Anime', 'Idol Hunters', 'Shinobi Anime'],
  );
  assert.deepEqual(
    POLISHED_TIMER_SKINS.map((s) => s.label),
    ['Kids Arcade', 'Kids Sticker', 'Keynote', 'Heavy Metal', 'Brasil', 'Calçadão', 'Woodblock', 'Reggae', 'Psychedelic', 'Visionary', 'Creature Anime', 'Idol Hunters', 'Shinobi Anime'],
  );
  assert.equal(parseScoreboardSkin('calcadao'), DEFAULT_SCOREBOARD_SKIN, 'no Calçadão scoreboard');
  assert.equal(parseScoreboardSkin('CALCADAO'), DEFAULT_SCOREBOARD_SKIN, 'no Calçadão scoreboard');
});

test('pickers: without Media the new skins are absent (not locked); with Media they follow the existing ones', () => {
  for (const [name, product, open] of PRODUCTS) {
    const access = polishedSkinAccessFromDoors(grantsForProduct(product));
    const gate = polishedSkinsUnlocked(access);
    assert.equal(gate, open, name);
    const board = scoreboardPickerSkins(false, gate).map((s) => s.id);
    const timer = timerPickerSkins(gate).map((s) => s.id);
    if (open) {
      assert.deepEqual(board, [...SELECTABLE_SCOREBOARD_SKINS.map((s) => s.id), ...POLISHED_SKINS.map((s) => s.id)], `${name} board`);
      assert.deepEqual(timer, ['classic', 'themed', ...POLISHED_TIMER_SKINS.map((s) => s.slug)], `${name} timer`);
    } else {
      assert.deepEqual(board, SELECTABLE_SCOREBOARD_SKINS.map((s) => s.id), `${name} board: existing three only`);
      assert.deepEqual(timer, ['classic', 'themed'], `${name} timer: Classic and Advantage only`);
      // Plain White board: Mock-Tournament alone, so the popup renders nothing (as today).
      assert.deepEqual(scoreboardPickerSkins(true, gate).map((s) => s.id), [SCOREBOARD_SKIN.MOCK_TOURNAMENT], `${name} plain White`);
    }
  }
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

test('timer text: Reggae rest reads "Rest Easy", Psychedelic "Far Out", Visionary "Breathe"; Metal counts in Roman numerals', () => {
  assert.equal(visionaryTimerTitle(true, 4), 'Breathe');
  assert.equal(visionaryTimerTitle(false, 4), 'Round 4');
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

test('Visionary motion runs only when the device allows motion', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../skins/polished/visionary.css', import.meta.url), 'utf8');
  const at = css.indexOf('@media (prefers-reduced-motion:no-preference){');
  assert.ok(at >= 0, 'motion sits inside prefers-reduced-motion: no-preference');
  const block = css.slice(at);
  assert.match(block, /animation:vis-pulse 6s/);
  assert.match(block, /animation:vis-breathe 6s/);
  assert.match(block, /animation:vis-hue 40s/);
  // No animation before the block, so reduce (or no preference support) means a still screen.
  assert.equal(css.slice(0, at).split('animation:').length - 1, 0);
  assert.equal(css.split('animation:').length - 1, 3);
});

const POSTER = [
  ['creature-anime', 'CREATURE_ANIME', 'Creature Anime'],
  ['idol-hunters', 'IDOL_HUNTERS', 'Idol Hunters'],
  ['shinobi-anime', 'SHINOBI_ANIME', 'Shinobi Anime'],
] as const;

test('poster skins are registered once, on both boards, and the gate still hides them below Media', () => {
  const ids = POLISHED_SKINS.map((skin) => skin.id);
  const slugs = POLISHED_SKINS.map((skin) => skin.slug);
  assert.equal(new Set(ids).size, ids.length, 'scoreboard ids are unique');
  assert.equal(new Set(slugs).size, slugs.length, 'slugs are unique');
  assert.equal(new Set(POLISHED_TIMER_SKINS.map((skin) => skin.slug)).size, POLISHED_TIMER_SKINS.length);
  for (const [slug, id, label] of POSTER) {
    assert.ok(POLISHED_SKINS.some((skin) => skin.slug === slug && skin.id === id && skin.label === label), label);
    assert.equal(parseScoreboardSkin(id), id);
    assert.equal(visibleScoreboardSkin(id, false, false, false, true), id, 'Media paints it');
    assert.equal(visibleScoreboardSkin(id, false, false, false, false), DEFAULT_SCOREBOARD_SKIN, 'locked falls back');
    assert.equal(visibleTrainingSkin(slug, true), slug);
    assert.equal(visibleTrainingSkin(slug, false), 'classic');
    const open = scoreboardPickerSkins(false, true).map((skin) => skin.id);
    const shut = scoreboardPickerSkins(false, false).map((skin) => skin.id);
    assert.ok(open.includes(id));
    assert.equal(shut.includes(id), false, 'absent, not locked');
    assert.equal(timerPickerSkins(false).some((skin) => skin.id === slug), false);
  }
  assert.equal(posterBoardState('heavy-metal', true), null);
  assert.equal(posterBoardState('creature-anime', false), 'OPEN');
  assert.equal(posterBoardState('idol-hunters', true), 'FINAL');
  assert.equal(posterTimerTitle('creature-anime', true, 2), 'Rest Up!');
  assert.equal(posterTimerTitle('idol-hunters', true, 2), 'Encore Break');
  assert.equal(posterTimerTitle('shinobi-anime', false, 3), 'Round 3');
  assert.equal(posterTimerTitle('shinobi-anime', true, 3), 'Rest');
});

test('long names shrink on one line, then wrap, and stop at the floor', () => {
  const always = () => true;
  const never = () => false;
  assert.deepEqual(fitNameBox(40, never), { size: 40, wrap: false });
  const shrunk = fitNameBox(40, (size) => size > 30);
  assert.equal(shrunk.wrap, false);
  assert.ok(shrunk.size <= 30 && shrunk.size > 40 * 0.72);
  const wrapped = fitNameBox(40, always, 0.72, 0.86, 0.5);
  assert.equal(wrapped.wrap, true);
  assert.ok(wrapped.size <= 40 * 0.5 + 1);
  const shinobi = fitNameBox(100, always, 0.56, 0.86, 0.5);
  assert.equal(shinobi.wrap, true);
  assert.ok(shinobi.size <= 51);
});

test('Idol Hunters ships the heart-mic crest and not the rejected crescent', async () => {
  const root = new URL('../skins/polished/', import.meta.url);
  const names: string[] = [];
  const walk = async (dir: URL) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const next = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) await walk(next);
      else names.push(entry.name);
    }
  };
  await walk(root);
  for (const name of names) assert.equal(/crescent/i.test(name), false, name);
  const idolFiles = ['idol-hunters.css', 'idol-hunters.ts', 'idol-hunters.deco.ts'];
  for (const file of idolFiles) {
    const text = await readFile(new URL(file, root), 'utf8');
    assert.equal(/crescent/i.test(text), false, file);
  }
  const crest = await readFile(new URL('assets/idol-hunters/crest.webp', root));
  assert.equal(createHash('sha256').update(crest).digest('hex'), '6a355217c0100eea2088cec7c407c9f72e9b435c4ae8a1c54de46f9f95d492fd');
  const shinobi = await readFile(new URL('shinobi-anime.deco.ts', root), 'utf8');
  assert.match(shinobi, /<span class="seal" lang="ja"[^>]*>忍<\/span>/);
  const css = await readFile(new URL('shinobi-anime.css', root), 'utf8');
  assert.equal(css.includes('忍'), false, 'the kanji is live text, not part of the art');
  assert.match(css, /\.hdr \.seal\s*\{[^}]*width:\s*9vh/);
});

test('poster header keeps the round at full size and only ellipsizes the division', async () => {
  const { readFile } = await import('node:fs/promises');
  const board = await readFile(new URL('../components/PolishedScoreboard.tsx', import.meta.url), 'utf8');
  const lead = board.slice(board.indexOf('className="lead"'), board.indexOf('className="trail"'));
  assert.equal(lead.includes('className="mat"'), false, 'the round is not in the wordmark group');
  assert.match(board, /className="trail"[\s\S]*className="mat"[\s\S]*className="div"/);
  const css = await readFile(new URL('../skins/polished/poster.css', import.meta.url), 'utf8');
  assert.match(css, /\.hdr \.mat\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(css, /\.hdr \.mat\s*\{[^}]*min-width:\s*max-content/);
  const fit = await readFile(new URL('../skins/polished/poster-fit.css', import.meta.url), 'utf8');
  assert.match(fit, /max-width:\s*820px[\s\S]*\.phase-endless\s*\{\s*display:\s*none/);
  const keynote = await readFile(new URL('../skins/polished/keynote.css', import.meta.url), 'utf8');
  const brasil = await readFile(new URL('../skins/polished/brasil.css', import.meta.url), 'utf8');
  assert.equal(keynote.includes('phase-endless'), false);
  assert.equal(brasil.includes('trail'), false);
  assert.match(fit, /max-width:\s*1100px\) and \(min-width:\s*901px\)[\s\S]*\.wm\s*\{[^}]*display:\s*none/);
  assert.match(fit, /max-width:\s*900px[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/);
  assert.match(fit, /max-width:\s*900px[\s\S]*\.hdr \.mat\s*\{[^}]*flex-shrink:\s*0/);
  assert.match(fit, /max-width:\s*900px[\s\S]*\.hdr \.div[\s\S]*min-width:\s*0[\s\S]*text-overflow:\s*ellipsis/);
  const shinobiCss = await readFile(new URL('../skins/polished/shinobi-anime.css', import.meta.url), 'utf8');
  assert.match(shinobiCss, /max-width:\s*900px[\s\S]*\.hdr \.kunai\s*\{[^}]*display:\s*none/);
  assert.match(shinobiCss, /max-width:\s*900px[\s\S]*min\(9vh,\s*20vw\)/);
});
