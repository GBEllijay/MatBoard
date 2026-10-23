import { expect, test, type Page } from '@playwright/test';

/**
 * Sub-menus keep a small corner back logo and a larger center Home logo.
 * The center mark used to copy the back mark's 44px size, and short landscape
 * clamps pulled .home__logo down beside it. Both widths are measured here.
 */
const ROUTES = [
  '/coaching-tools',
  '/coach-unlimited',
  '/instructors',
  '/suite',
  '/competitors',
  '/white/roster',
  '/roster?from=students',
  '/game-plan',
  '/student/journal?student=1',
  '/student/rank?student=1',
] as const;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
] as const;

const MIN_RATIO = 1.6;

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
  });
}

test('center Home logo stays larger than the corner back logo', async ({ page }) => {
  await unlock(page);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const route of ROUTES) {
      await page.goto(route);
      const back = page.locator('.play-exit img');
      const home = page.locator('.tier-home img, .home__logo');
      await expect(back, route).toBeVisible();
      await expect(home, route).toBeVisible();
      const ratio = await page.evaluate(() => {
        const backImg = document.querySelector('.play-exit img');
        const homeImg = document.querySelector('.tier-home img') ?? document.querySelector('.home__logo');
        if (!(backImg instanceof HTMLElement) || !(homeImg instanceof HTMLElement)) return 0;
        const backWidth = backImg.getBoundingClientRect().width;
        const homeWidth = homeImg.getBoundingClientRect().width;
        if (backWidth < 1) return 0;
        return homeWidth / backWidth;
      });
      expect(ratio, `${route} at ${viewport.width}px`).toBeGreaterThanOrEqual(MIN_RATIO);
    }
  }
});
