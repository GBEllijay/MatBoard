import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };
const BACK = 'Back. Hold for Home.';

async function unlock(page: Page, kids: boolean) {
  await page.addInitScript((kidsOn) => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('matboard.bracketTheme.v1', 'bright');
    localStorage.setItem(
      'matboard.kidsScoreboard.v1',
      JSON.stringify({ enabled: kidsOn, skin: 'unicorns', mascot: true }),
    );
  }, kids);
}

async function expectCornerBackOnly(page: Page, backHref: string) {
  await expect(page.locator('.tier-home')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  const back = page.getByRole('link', { name: BACK, exact: true });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', backHref);
  const line = page.locator('.tournament__roundline');
  const division = page.getByLabel('Division or class name');
  await expect(line).toBeVisible();
  await expect(division).toBeVisible();

  const backBox = await back.boundingBox();
  const lineBox = await line.boundingBox();
  const divisionBox = await division.boundingBox();
  expect(backBox).toBeTruthy();
  expect(lineBox).toBeTruthy();
  expect(divisionBox).toBeTruthy();
  expect(backBox!.x).toBeLessThan(20);
  expect(backBox!.y).toBeLessThan(20);
  expect(lineBox!.y).toBeLessThan(64);
  const hits = (a: NonNullable<typeof backBox>, b: NonNullable<typeof backBox>) =>
    a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
  expect(hits(backBox!, lineBox!)).toBe(false);
  expect(hits(backBox!, divisionBox!)).toBe(false);
}

test('kids and adult brackets keep the corner back and drop the center Home mark', async ({ page }) => {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  const cases = [
    {
      path: '/tournament?from=coach',
      kids: false,
      back: '/coach',
      shot: '/opt/cursor/artifacts/bracket-adult-no-center-home.png',
      kidsClass: false,
    },
    {
      path: '/tournament?from=suite',
      kids: true,
      back: '/suite',
      shot: '/opt/cursor/artifacts/bracket-kids-no-center-home.png',
      kidsClass: true,
    },
  ] as const;

  for (const entry of cases) {
    await unlock(page, entry.kids);
    await page.setViewportSize(PHONE);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(entry.path);
    if (entry.kidsClass) await expect(page.locator('main')).toHaveClass(/tournament--kids/);
    else await expect(page.locator('main')).not.toHaveClass(/tournament--kids/);
    await expectCornerBackOnly(page, entry.back);
    await page.screenshot({ path: entry.shot });
    await page.getByRole('link', { name: BACK, exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(entry.back);
  }
});
