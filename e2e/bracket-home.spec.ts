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
  const headline = page.getByLabel('Tournament title');
  await expect(headline).toBeVisible();
  await expect(headline).toHaveValue('Tournament');
  await expect(page.locator('.tournament__bar .tournament__roundline')).toHaveCount(0);
  await expect(page.locator('.tournament__bar').getByLabel('Division or class name')).toHaveCount(0);
  await expect(page.locator('.bracket-headline')).not.toContainText(/Kids' Scoreboards|Dinos|Space|Ocean|Stars & unicorns/);

  const backBox = await back.boundingBox();
  const headBox = await headline.boundingBox();
  const bracketBox = await page.locator('.bracket').boundingBox();
  expect(backBox).toBeTruthy();
  expect(headBox).toBeTruthy();
  expect(bracketBox).toBeTruthy();
  expect(backBox!.x).toBeLessThan(20);
  expect(backBox!.y).toBeLessThan(20);
  expect(headBox!.y).toBeLessThan(96);
  expect(headBox!.y + headBox!.height).toBeLessThanOrEqual(bracketBox!.y + 8);
  const hits = (a: NonNullable<typeof backBox>, b: NonNullable<typeof backBox>) =>
    a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
  expect(hits(backBox!, headBox!)).toBe(false);
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
    const line = page.locator('.tournament__tools .tournament__roundline');
    const division = page.locator('.tournament__tools').getByLabel('Division or class name');
    await line.scrollIntoViewIfNeeded();
    await expect(line).toBeVisible();
    await expect(division).toBeVisible();
    const placed = await page.evaluate(() => {
      const round = document.querySelector('.tournament__tools .tournament__roundline');
      const skin = [...document.querySelectorAll('.tournament__tools button')].find(
        (button) => button.textContent?.trim() === 'Skin',
      );
      const bracket = document.querySelector('.bracket');
      if (!round || !bracket) return null;
      const roundBox = round.getBoundingClientRect();
      const bracketBox = bracket.getBoundingClientRect();
      const skinBox = skin?.getBoundingClientRect();
      return {
        belowBracket: roundBox.top >= bracketBox.bottom - 8,
        aboveSkin: skinBox ? roundBox.bottom <= skinBox.top + 2 : true,
      };
    });
    expect(placed?.belowBracket, 'seed line is under the bracket').toBe(true);
    expect(placed?.aboveSkin, 'seed line is above Skin').toBe(true);
    await page.screenshot({
      path: entry.shot.replace(/\.png$/, '-controls.png'),
    });
    if (entry.kids) {
      const title = page.getByLabel('Tournament title');
      await title.scrollIntoViewIfNeeded();
      await title.fill('Spring Open');
      await expect(title).toHaveValue('Spring Open');
      await page.getByRole('button', { name: /^Skin/ }).click();
      await page.getByRole('radio', { name: 'Dinos' }).click();
      await expect(page.locator('main')).toHaveClass(/tournament--kids-dinos/);
      await expect(title).toHaveValue('Spring Open');
      await expect(page.locator('.bracket-headline')).not.toContainText('Dinos');
      await title.scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/opt/cursor/artifacts/bracket-title-spring-open.png' });
      await page.reload();
      await expect(page.getByLabel('Tournament title')).toHaveValue('Spring Open');
      await page.getByLabel('Tournament title').fill('');
      await expect(page.getByLabel('Tournament title')).toHaveValue('');
      await page.reload();
      await expect(page.getByLabel('Tournament title')).toHaveValue('');
      await page.screenshot({ path: '/opt/cursor/artifacts/bracket-title-blank.png' });
    }
    await page.getByRole('link', { name: BACK, exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(entry.back);
  }
});
