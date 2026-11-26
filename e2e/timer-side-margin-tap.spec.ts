import { expect, test, type Page } from '@playwright/test';

/**
 * Owner report (Nov 26 2026): on a TV the Heavy Metal round-timer clock stretched across the screen,
 * so a tap on the side margins never opened Training options.
 *
 * For every round-timer skin, on a 1920x1080 TV and a 1024x768 (4:3) screen:
 * - the clock button leaves at least 10% of the width free on each side;
 * - a tap in the left margin and a tap in the right margin each open Training options.
 *
 * Unlocked with the same on-device flags the skin sweep uses; no codes or secrets.
 */

const SCREENS = [
  ['tv-1920x1080', { width: 1920, height: 1080 }],
  ['four-by-three-1024x768', { width: 1024, height: 768 }],
] as const;

const TIMER_SKINS = [
  'kids-arcade',
  'kids-sticker',
  'stage',
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
  'dungeon-quest',
  'mech-battle',
  'arcade-fighter',
] as const;

async function openTimer(page: Page, skin: string) {
  await page.addInitScript((skin) => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.mediaUnlocked', '1');
    localStorage.setItem('advantage.legacyNoticeDismissed', '1');
    localStorage.setItem('matboard.trainingSkin.v1', skin);
  }, skin);
  await page.goto('/training?from=suite');
  await expect(page.locator('.tm-clock')).toBeVisible();
  await page.waitForTimeout(350);
}

for (const [screenName, size] of SCREENS) {
  for (const skin of TIMER_SKINS) {
    test(`${skin} timer at ${screenName}: side-margin taps open Training options`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: size });
      const page = await context.newPage();
      await openTimer(page, skin);

      const box = await page.locator('.tm-clock').boundingBox();
      expect(box).not.toBeNull();
      const clock = box!;
      expect(clock.x, 'left margin free').toBeGreaterThanOrEqual(size.width * 0.1);
      expect(size.width - (clock.x + clock.width), 'right margin free').toBeGreaterThanOrEqual(size.width * 0.1);

      const options = page.getByRole('dialog', { name: /Training options/i }).or(page.getByText('Training options', { exact: true }));
      for (const fraction of [0.04, 0.96]) {
        await page.mouse.click(Math.round(size.width * fraction), Math.round(size.height * 0.5));
        await expect(options.first(), `tap at ${fraction * 100}% opens options`).toBeVisible();
        await page.reload();
        await expect(page.locator('.tm-clock')).toBeVisible();
        await page.waitForTimeout(250);
      }
      await context.close();
    });
  }
}

test('Heavy Metal timer on a TV: the clock box is narrower than 62% of the screen and the margin tap is shown', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await openTimer(page, 'heavy-metal');
  const box = (await page.locator('.tm-clock').boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(1920 * 0.62);
  await page.mouse.click(120, 540);
  await expect(page.getByText('Training options', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('heavy-metal-tv-margin-tap-opens-options.png') });
  await context.close();
});
