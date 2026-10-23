import { expect, test, type Page } from '@playwright/test';
import { ALPHA_REQUEST_SUBJECT, SITE_FEEDBACK_EMAIL } from '../src/lib/siteFooter.ts';
import { FULL_OWNER_UNLOCK_CODE } from '../src/lib/proUnlock.ts';

const LANDSCAPES = [
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
] as const;

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: true });
}

test('public homepage sells Advantage White and links coming soon to the edition picker', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Win by Advantage.', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Your gym's scoreboard and timer/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Run it from your phone/ })).toBeVisible();
  await expect(page.getByText('05:00', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buy Advantage White — $9.99' })).toHaveAttribute('href', '/buy');
  await expect(page.getByRole('heading', { name: 'Round timer', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Points', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Advantages', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Penalties', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Belt progression/i })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Scoreboard' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Round timer' })).toBeVisible();

  const shots = page.locator('.sf-print img');
  await expect(shots).toHaveCount(2);
  await expect(shots.nth(0)).toHaveAttribute(
    'alt',
    'Woodblock-style illustration of kids rolling at the gym while the Advantage scoreboard runs on the wall TV',
  );
  await expect(shots.nth(1)).toHaveAttribute(
    'alt',
    'Woodblock-style illustration of kids rolling at the gym while the Advantage round timer runs on the wall TV',
  );
  const sources = page.locator('.sf-print source');
  await expect(sources.nth(0)).toHaveAttribute('type', 'image/webp');
  await expect(sources.nth(0)).toHaveAttribute('srcset', '/homepage/woodblock-scoreboard.webp');
  await expect(sources.nth(1)).toHaveAttribute('srcset', '/homepage/woodblock-timer.webp');
  for (const image of await shots.all()) {
    await expect(image).toBeVisible();
    const loaded = await image.evaluate((img) => img instanceof HTMLImageElement && img.naturalWidth > 40);
    expect(loaded).toBe(true);
    await expect(image).toHaveAttribute('width', '1280');
    await expect(image).toHaveAttribute('height', '720');
  }
  await expect(page.locator('img[src*="hero-still"], img[src*="hero-poster"]')).toHaveCount(0);

  const progress = page.getByRole('region', { name: 'Start with White. Grow into Pro.' });
  await expect(progress.getByText('Progression', { exact: true })).toBeVisible();
  await expect(progress.getByRole('heading', { name: 'Advantage White', exact: true })).toBeVisible();
  const student = progress.locator('a.sf-step--student');
  const coach = progress.locator('a.sf-step--coach');
  const pro = progress.locator('a.sf-step--pro');
  await expect(student).toContainText('Advantage – Student Edition');
  await expect(student).toContainText('personal BJJ training journal');
  await expect(student).toContainText('Coming soon');
  await expect(coach).toContainText('Advantage Coach');
  await expect(coach).toContainText('Coming soon');
  await expect(pro).toContainText('Advantage Pro');
  await expect(pro).toContainText('$99.99 + $5.99/mo');
  await expect(pro).toContainText('Coming soon');
  await expect(progress).toContainText('are in alpha testing');

  const mail = page.getByRole('link', { name: 'Request to join alpha' });
  await expect(mail).toHaveAttribute(
    'href',
    `mailto:${SITE_FEEDBACK_EMAIL}?subject=${encodeURIComponent(ALPHA_REQUEST_SUBJECT)}`,
  );
  await progress.scrollIntoViewIfNeeded();
  await progress.screenshot({ path: '/opt/cursor/artifacts/coming-soon.png' });
  await shot(page, 'storefront-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('navigation', { name: 'On this page' })).toBeHidden();
  await shot(page, 'storefront-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await coach.click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('button', { name: 'Advantage Coach, coming soon' })).toBeVisible();
});

test('White card opens checkout; Student, Coach, Pro, and the heading open the picker', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const buy = page.getByRole('link', { name: 'Buy Advantage White — $9.99' });
  const heading = page.getByRole('link', { name: 'Start with White. Grow into Pro.', exact: true });
  const white = page.locator('a.sf-step--white');
  const student = page.locator('a.sf-step--student');
  const coach = page.locator('a.sf-step--coach');
  const pro = page.locator('a.sf-step--pro');
  await expect(buy).toHaveAttribute('href', '/buy');
  await expect(white).toHaveAttribute('href', '/buy');
  await expect(heading).toHaveAttribute('href', '/products');
  await expect(student).toHaveAttribute('href', '/products');
  await expect(coach).toHaveAttribute('href', '/products');
  await expect(pro).toHaveAttribute('href', '/products');
  for (const link of [heading, student, coach, pro]) {
    const href = await link.getAttribute('href');
    expect(href).not.toBe('/buy');
    expect(href).not.toBe('/student');
    expect(href).not.toBe('/coming-soon');
    expect(href ?? '').not.toMatch(/^#/);
  }

  await white.click();
  await expect(page).toHaveURL(/\/buy$/);
  await page.goto('/');
  await heading.click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('heading', { name: 'Advantage', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Advantage White' })).toHaveAttribute('href', '/buy');
});

test('legacy student and owner-code home links still open the edition picker', async ({ page }) => {
  await page.goto('/?student=1');
  await expect(page).toHaveURL(/\/products\?student=1$/);
  await expect(page.getByRole('link', { name: 'Open Student Edition', exact: true })).toBeVisible();

  await page.goto(`/editions?pro=${FULL_OWNER_UNLOCK_CODE}`);
  await expect(page).toHaveURL(/\/products/);
  await expect(page).not.toHaveURL(new RegExp(FULL_OWNER_UNLOCK_CODE, 'i'));
  await expect(page.getByRole('link', { name: 'Open Student Edition', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
});

test('buy page shows an unlock or promo code field without printing launch codes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/buy');
  const field = page.getByRole('textbox', { name: 'Unlock or promo code' });
  await expect(field).toBeVisible();
  const box = await field.boundingBox();
  expect(box && box.y).toBeLessThan(900);
  await expect(page.getByRole('button', { name: 'Continue to checkout — $9.99' })).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/WHITE499|WHITE099|WHITEFREE|WINBYADV/i);
  await shot(page, 'buy-code-field');
});

test('Coach Unlimited landscape keeps the corner back off the center Home logo', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
  });
  for (const size of LANDSCAPES) {
    await page.setViewportSize(size);
    await page.goto('/coach-unlimited');
    const back = page.getByRole('link', { name: 'Back. Hold for Home.', exact: true });
    const home = page.getByRole('link', { name: 'Home', exact: true });
    await expect(back).toHaveAttribute('href', '/pro');
    await expect(home).toHaveAttribute('href', '/products');
    const overlap = await page.evaluate(() => {
      const backImg = document.querySelector('.play-exit img');
      const homeImg = document.querySelector('.home__logo');
      if (!(backImg instanceof HTMLElement) || !(homeImg instanceof HTMLElement)) return true;
      const a = backImg.getBoundingClientRect();
      const b = homeImg.getBoundingClientRect();
      return a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    });
    expect(overlap, `${size.width}x${size.height}`).toBe(false);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await shot(page, 'coach-unlimited-landscape');
});

test('a focused field is not pulled back after the person scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/buy');
  const field = page.getByRole('textbox', { name: 'Unlock or promo code' });
  await field.focus();
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(250);
  const afterWheel = await page.evaluate(() => window.scrollY);
  expect(afterWheel).toBeGreaterThan(before + 40);
  await page.waitForTimeout(800);
  const settled = await page.evaluate(() => window.scrollY);
  expect(Math.abs(settled - afterWheel)).toBeLessThan(30);
});
