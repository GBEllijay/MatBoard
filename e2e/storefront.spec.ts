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
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Advantage', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Advantage White', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buy Now — $9.99' })).toHaveAttribute('href', '/buy');
  await expect(page.getByRole('heading', { name: 'BJJ scoreboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Round timer' })).toBeVisible();
  const shots = page.locator('.store-feature__shot img');
  await expect(shots).toHaveCount(2);
  for (const shot of await shots.all()) {
    await expect(shot).toBeVisible();
    const loaded = await shot.evaluate((img) => img instanceof HTMLImageElement && img.naturalWidth > 40);
    expect(loaded).toBe(true);
  }

  const soon = page.getByRole('region', { name: 'Coming soon' });
  const cards = soon.locator('.store-soon__card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('Advantage – Student Edition');
  await expect(cards.nth(0)).toContainText('personal BJJ training journal');
  await expect(cards.nth(1)).toContainText('Advantage Coach');
  await expect(cards.nth(1)).toContainText('Not for sale yet');
  await expect(cards.nth(2)).toContainText('Advantage Pro');
  await expect(cards.nth(2)).toContainText('$99.99');
  await expect(cards.nth(2)).toContainText('Not for sale yet');
  for (const card of await cards.all()) {
    await expect(card).toHaveAttribute('href', '/products');
  }
  const mail = page.getByRole('link', { name: 'Request to join alpha' });
  await expect(mail).toHaveAttribute(
    'href',
    `mailto:${SITE_FEEDBACK_EMAIL}?subject=${encodeURIComponent(ALPHA_REQUEST_SUBJECT)}`,
  );
  await expect(soon).toContainText('are in alpha testing');
  await soon.scrollIntoViewIfNeeded();
  await soon.screenshot({ path: '/opt/cursor/artifacts/coming-soon.png' });
  await shot(page, 'storefront-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'storefront-mobile');
  await cards.nth(1).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('button', { name: 'Advantage Coach, coming soon' })).toBeVisible();
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
