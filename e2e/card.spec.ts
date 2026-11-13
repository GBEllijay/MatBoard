import { expect, test } from '@playwright/test';

async function landsOnHome(page: import('@playwright/test').Page) {
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('heading', { name: 'Win by Advantage.', exact: true })).toBeVisible();
  await expect(page).not.toHaveTitle(/Gracie Barra Ellijay/);
  await expect(page.getByRole('heading', { name: 'Professor Justin Guise, Gracie Barra Ellijay' })).toHaveCount(0);
  await expect(page.getByText('Professor Justin Guise, Gracie Barra Ellijay')).toHaveCount(0);
}

test('legacy /card goes home and does not show the business card page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto('/card');
  expect(response?.ok()).toBeTruthy();
  await landsOnHome(page);

  await page.goto('/card/');
  await landsOnHome(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Win by Advantage.', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buy Advantage White — $9.99' })).toHaveAttribute('href', '/buy');
});
