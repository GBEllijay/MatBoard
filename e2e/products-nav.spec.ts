import { expect, test, type Page } from '@playwright/test';

const backMark = (page: Page) => page.locator('main.home a.play-exit--history');
const homeLogo = (page: Page) => page.locator('main.home .home__mark a.home__brand');

for (const size of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`/products logo goes Home and back falls back to Home at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/products');
    await expect(homeLogo(page)).toHaveAttribute('href', '/');
    await expect(homeLogo(page)).toHaveAttribute('aria-label', 'Home');
    await expect(backMark(page)).toHaveAttribute('aria-label', 'Back');
    await expect(backMark(page)).toHaveAttribute('href', '/');
    await expect(backMark(page)).toBeVisible();

    // Direct visit: no earlier in-app page, so Back lands on the homepage.
    await backMark(page).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('main.home--ladder')).toHaveCount(0);

    // Logo click from /products opens the homepage.
    await page.goto('/products');
    await homeLogo(page).click();
    await expect(page).toHaveURL(/\/$/);
  });
}

test('/products back returns to the previous in-app page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/buy');
  await page.evaluate(() => {
    window.history.pushState({ usr: null, key: 'x', idx: 1 }, '', '/products');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await expect(page.locator('main.home--ladder')).toBeVisible();
  await backMark(page).click();
  await expect(page).toHaveURL(/\/buy$/);
});

test('/products belt accents and order match the homepage ladder', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/products');
  await expect(page.locator('.home__modes .mode-card strong')).toHaveText([
    'Advantage White',
    'Advantage – Student Edition',
    'Advantage Media Edition',
    'Advantage Instructor Edition',
    'Advantage Pro',
  ]);
  const fill = (sel: string) =>
    page.locator(`${sel} > .belt-rail`).evaluate((el) => getComputedStyle(el).getPropertyValue('--belt-fill').trim());
  expect(await fill('.mode-card--student')).toBe('#2a5cf0');
  expect(await fill('.mode-card--media')).toBe('#6b2d91');
  expect(await fill('.mode-card--coach')).toBe('#6b3a1f');
  await expect(page.locator('.mode-card--student .leather-spine')).toHaveCount(0);

  const media = page.locator('.mode-card--media');
  await expect(media).toHaveClass(/mode-card--locked/);
  await expect(media).toContainText('Scoreboard, round timer, and media console.');
  await expect(media).toContainText('$29.99 one-time');
  await expect(media.getByRole('link', { name: 'Learn more' })).toHaveAttribute('href', '/media');
  await expect(media.getByRole('link', { name: 'Advantage Media Edition' })).toHaveAttribute('href', '/media');
  await expect(media.locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(media.getByRole('button')).toHaveCount(0);

  // Coach ids and routes are unchanged under the new name.
  await expect(page.getByRole('button', { name: 'Advantage Instructor Edition, coming soon' })).toBeVisible();
  await expect(page.locator('.mode-card--coach')).toContainText('$29.99 one-time');
});
