import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

/**
 * Close works on every skin. Owner report (Nov 18 2026): on the round timer the
 * Training options Close did nothing on most skins (you had to tap above the
 * sheet), the account button covered Close, and sometimes the sheet filled the
 * screen with no way out. The scoreboard sheets get the same checks.
 *
 * For every timer skin and every scoreboard skin, at phone portrait (390x844),
 * a short phone (390x667) and landscape (844x390):
 * - Close is the topmost element at its center (document.elementFromPoint), is
 *   at least 44px, sits inside the viewport, and the account button does not
 *   overlap it;
 * - a finger tap on Close closes the sheet and it STAYS closed (the leftover
 *   click must not reopen Options or open the Controller);
 * - after scrolling to the bottom of the sheet, Close is still on screen;
 * - Escape closes it, and so does a tap on the backdrop above it.
 *
 * Unlocked with the same legacy on-device Pro flag the skin sweep uses; no codes or secrets.
 */

const VIEWPORTS = [
  ['portrait', { width: 390, height: 844 }],
  ['short', { width: 390, height: 667 }],
  ['landscape', { width: 844, height: 390 }],
] as const;
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

const TIMER_SKINS = [
  'classic',
  'themed',
  'kids-arcade',
  'kids-sticker',
  'keynote',
  'heavy-metal',
  'brasil',
  'calcadao',
  'woodblock',
  'reggae',
  'psychedelic',
  'visionary',
  'creature-anime',
  'idol-hunters',
  'shinobi-anime',
] as const;

/** [stored id, suite board]. Old School and Quick Result live on the suite board. */
const BOARD_SKINS = [
  ['MOCK_TOURNAMENT', false],
  ['OLD_SCHOOL', true],
  ['QUICK_RESULT', true],
  ['KIDS_ARCADE', false],
  ['KIDS_STICKER', false],
  ['KEYNOTE', false],
  ['HEAVY_METAL', false],
  ['BRASIL', false],
  ['WOODBLOCK', false],
  ['REGGAE', false],
  ['PSYCHEDELIC', false],
  ['VISIONARY', false],
  ['CREATURE_ANIME', false],
  ['IDOL_HUNTERS', false],
  ['SHINOBI_ANIME', false],
] as const;

const trainingState = {
  workMs: 300000,
  breakMs: 30000,
  rounds: 5,
  endless: false,
  remainingMs: 300000,
  running: false,
  startedAt: null,
  phase: 'work',
  currentRound: 1,
  warned: false,
  startSound: false,
  warningSound: false,
  endSound: false,
};

function matchState(skin: string) {
  return {
    blue: { name: 'Kat B.', gym: 'Alliance', rank: 'Purple', points: 0, advantages: 0, disadvantages: 0 },
    white: { name: 'Sam R.', gym: 'Checkmat', rank: 'Blue', points: 0, advantages: 0, disadvantages: 0 },
    round: 'Final',
    division: 'Adult',
    durationMs: 300000,
    remainingMs: 300000,
    running: false,
    startedAt: null,
    startBeep: false,
    warningBeep: false,
    warned: false,
    endBuzzer: false,
    endCue: 'buzzer',
    bracketMatchId: null,
    autoAnnounce: false,
    skin,
    outcome: null,
    outcomeFlash: null,
    revision: 4,
  };
}

/** A signed-in phone (so the account button is present) with a fake fullscreen API. */
async function phone(browser: Browser, viewport: { width: number; height: number }, extra: Record<string, string>) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, userAgent: ANDROID_UA });
  const page = await context.newPage();
  await page.addInitScript((extra) => {
    const fs = { element: null as Element | null };
    Element.prototype.requestFullscreen = function () {
      fs.element = document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    document.exitFullscreen = async () => {
      fs.element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fs.element });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    if (sessionStorage.getItem('close-sweep-seeded')) return;
    sessionStorage.setItem('close-sweep-seeded', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.legacyNoticeDismissed', '1');
    localStorage.setItem('matboard.tvTip.v1', '1');
    localStorage.setItem('advantage.login.v1', 'c***@example.com');
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
  }, extra);
  return page;
}

/** Close is on top at its center, big enough, on screen, and clear of the account button. */
async function expectCloseReachable(page: Page, dialog: Locator, what: string) {
  const close = dialog.locator('.sheet__close');
  await expect(close, `${what}: Close is visible`).toBeVisible();
  const info = await close.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const hit = !top
      ? 'nothing'
      : el === top || el.contains(top)
        ? 'ok'
        : `${top.tagName.toLowerCase()}.${String(top.getAttribute('class') ?? '').trim().split(/\s+/).join('.')}`;
    let overlap = false;
    for (const acct of document.querySelectorAll('.header-account')) {
      const a = acct.getBoundingClientRect();
      const shown = getComputedStyle(acct).visibility !== 'hidden' && a.width > 0 && a.height > 0;
      if (shown && !(a.right <= r.left || a.left >= r.right || a.bottom <= r.top || a.top >= r.bottom)) overlap = true;
    }
    return { x, y, w: r.width, h: r.height, hit, overlap, top: r.top, bottom: r.bottom, vh: window.innerHeight };
  });
  expect(info.hit, `${what}: a tap on Close lands on ${info.hit}`).toBe('ok');
  expect(info.overlap, `${what}: the account button overlaps Close`).toBe(false);
  expect(Math.min(info.w, info.h), `${what}: Close is at least 44px`).toBeGreaterThanOrEqual(44);
  expect(info.top, `${what}: Close is below the top edge`).toBeGreaterThanOrEqual(0);
  expect(info.bottom, `${what}: Close is above the bottom edge`).toBeLessThanOrEqual(info.vh);
  return info;
}

/** Finger-tap Close, then make sure the sheet stays closed after the leftover click. */
async function tapCloseStaysClosed(page: Page, dialog: Locator, what: string) {
  const { x, y } = await expectCloseReachable(page, dialog, what);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(700);
  await expect(dialog, `${what}: Close closes the sheet and it stays closed`).toHaveCount(0);
}

/** Scroll the sheet to the bottom; Close must still be reachable. */
async function expectCloseAfterScroll(page: Page, dialog: Locator, what: string) {
  await dialog.evaluate((root) => {
    for (const el of root.querySelectorAll<HTMLElement>('.sheet__panel, .sheet__body')) el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(100);
  await expectCloseReachable(page, dialog, `${what} (scrolled to the bottom)`);
}

/** Tap the dimmed backdrop just above the panel. */
async function tapBackdrop(page: Page, dialog: Locator) {
  const panel = await dialog.locator('.sheet__panel').boundingBox();
  if (!panel) throw new Error('no panel');
  await page.touchscreen.tap(Math.round(panel.x + panel.width / 2), Math.max(2, Math.round(panel.y / 2)));
}

for (const [vpName, viewport] of VIEWPORTS) {
  for (const skin of TIMER_SKINS) {
    test(`timer Options Close · ${skin} · ${vpName}`, async ({ browser }) => {
      const page = await phone(browser, viewport, {
        'matboard.training.v1': JSON.stringify(trainingState),
        'matboard.trainingSkin.v1': skin,
      });
      await page.goto('/training');
      if (!['classic', 'themed'].includes(skin)) {
        await expect(page.locator(`.skin-root[data-skin="${skin}"]:not(.skin-root--loading)`)).toBeVisible();
      }
      await page.waitForTimeout(300);
      const dialog = page.getByRole('dialog', { name: 'Training options' });
      const open = async () => {
        await page.touchscreen.tap(Math.round(viewport.width / 2), viewport.height - 12);
        await expect(dialog, 'an empty tap opens Options').toBeVisible();
        await page.waitForTimeout(250);
      };

      await open();
      const panel = await dialog.locator('.sheet__panel').boundingBox();
      expect(panel!.height, 'the sheet never fills the whole screen').toBeLessThan(viewport.height);
      await tapCloseStaysClosed(page, dialog, `${skin} Close`);

      await open();
      await expectCloseAfterScroll(page, dialog, `${skin} Close`);
      await tapCloseStaysClosed(page, dialog, `${skin} Close after scrolling`);

      await open();
      await page.keyboard.press('Escape');
      await expect(dialog, 'Escape closes Options').toHaveCount(0);
      await page.waitForTimeout(500); // every close holds off a reopen for 400ms

      await open();
      await tapBackdrop(page, dialog);
      await page.waitForTimeout(500);
      await expect(dialog, 'a tap above the sheet closes Options').toHaveCount(0);
      await page.context().close();
    });
  }

  for (const [skin, suite] of BOARD_SKINS) {
    const q = suite ? '?from=suite' : '';
    test(`scoreboard Close · ${skin} · ${vpName}`, async ({ browser }) => {
      const page = await phone(browser, viewport, { 'matboard.match.v1': JSON.stringify(matchState(skin)) });
      await page.goto(`/match/control${q}`);
      await page.waitForTimeout(300);

      // Win sheet on the Controller.
      const win = page.getByRole('dialog', { name: 'Blue win' });
      const winBtn = page.getByRole('button', { name: 'Blue Win' });
      await winBtn.scrollIntoViewIfNeeded();
      await winBtn.click();
      await expect(win).toBeVisible();
      await page.waitForTimeout(250);
      await tapCloseStaysClosed(page, win, `${skin} Win sheet Close`);
      await page.waitForTimeout(500);
      await winBtn.click();
      await expect(win).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(win, 'Escape closes the Win sheet').toHaveCount(0);
      await page.waitForTimeout(500);

      // Instructions / Suggestions sheet (long; it scrolls on a short phone and in landscape).
      const help = page.getByRole('dialog', { name: 'How to show the scoreboard on a gym TV' });
      const helpBtn = page.getByRole('button', { name: 'Instructions / Suggestions' });
      await helpBtn.scrollIntoViewIfNeeded();
      await helpBtn.click();
      await expect(help).toBeVisible();
      await page.waitForTimeout(250);
      await expectCloseAfterScroll(page, help, `${skin} help sheet Close`);
      await tapCloseStaysClosed(page, help, `${skin} help sheet Close`);
      await page.waitForTimeout(500);
      await helpBtn.click();
      await expect(help).toBeVisible();
      await tapBackdrop(page, help);
      await page.waitForTimeout(500);
      await expect(help, 'a tap above the help sheet closes it').toHaveCount(0);
      expect(page.url()).toContain('/match/control');

      if (skin === 'QUICK_RESULT') {
        // Quick Result puts Win / DQ on the board itself: Close must not leak a tap to the board.
        await page.goto(`/match${q}`);
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: 'Blue Win' }).click();
        await expect(win).toBeVisible();
        await page.waitForTimeout(250);
        await tapCloseStaysClosed(page, win, 'Quick Result board Win sheet Close');
        await expect(page, 'Close did not open the Controller behind it').not.toHaveURL(/\/match\/control/);
      }
      await page.context().close();
    });
  }
}
