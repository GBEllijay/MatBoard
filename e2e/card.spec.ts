import { expect, test } from '@playwright/test';
import { CARD_DESCRIPTION, CARD_MAKER_LINE } from '../src/lib/card.ts';

test('card loads directly and the home route still works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto('/card');
  expect(response?.ok()).toBeTruthy();
  expect(response?.headers()['content-type']).toContain('text/html');

  await expect(page).toHaveTitle(`${CARD_MAKER_LINE} — Advantage`);
  await expect(page.getByRole('heading', { level: 1, name: CARD_MAKER_LINE })).toBeVisible();
  await expect(page.getByText('Professor Justin Guise,', { exact: true })).toBeVisible();
  await expect(page.getByText('Gracie Barra Ellijay', { exact: true })).toBeVisible();
  await expect(page.getByText('Georgia', { exact: true })).toBeVisible();
  await expect(page.getByText('Advantage App, LLC', { exact: true })).toBeVisible();
  await expect(page.getByText(CARD_DESCRIPTION)).toBeVisible();
  await expect(page.getByText('Justin Geis')).toHaveCount(0);

  const logo = page.getByRole('img', { name: 'Advantage' });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', '/card-logo.png');
  const loaded = await logo.evaluate((img) => img instanceof HTMLImageElement && img.naturalWidth > 40);
  expect(loaded).toBe(true);

  const signup = page.getByRole('link', { name: 'Get Advantage' });
  await expect(signup).toBeVisible();
  await expect(signup).toHaveAttribute('href', '/buy');
  await expect(page.getByRole('link', { name: 'Student Edition' })).toHaveAttribute('href', '/?student=1');
  const site = page.getByRole('link', { name: 'advantagebjjtimer.com', exact: true });
  await expect(site).toBeVisible();
  await expect(site).toHaveAttribute('href', 'https://advantagebjjtimer.com/');
  await expect(page.getByRole('link', { name: 'advantageappllc@gmail.com' })).toHaveAttribute(
    'href',
    'mailto:advantageappllc@gmail.com',
  );
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await expect(page.locator('script')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    `${CARD_MAKER_LINE} — Advantage`,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://advantagebjjtimer.com/card-logo.png',
  );

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: CARD_MAKER_LINE })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get Advantage' })).toBeVisible();

  await page.screenshot({
    path: '/opt/cursor/artifacts/card_phone_390.png',
    fullPage: true,
  });

  await signup.click();
  await expect(page).toHaveURL(/\/buy$/);
  await expect(page.getByRole('heading', { name: 'Advantage White', exact: true })).toBeVisible();

  await page.goto('/card/');
  await expect(page.getByRole('heading', { level: 1, name: CARD_MAKER_LINE })).toBeVisible();
  await page.getByRole('link', { name: 'Student Edition' }).click();
  await expect(page).toHaveURL(/student=1/);
  await expect(page.getByText('Advantage – Student Edition')).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Win by Advantage.', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buy Advantage White — $9.99' })).toHaveAttribute('href', '/buy');
});
