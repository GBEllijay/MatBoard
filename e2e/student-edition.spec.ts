import { expect, test } from '@playwright/test';

test('student journal saves, searches, amends, and marks a fundamental', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/student?student=1');
  await page.getByRole('button', { name: 'Open journal' }).click();
  await page.getByRole('link', { name: 'Journal', exact: true }).click();

  await page.getByRole('button', { name: 'Gi', exact: true }).click();
  await page.getByRole('button', { name: 'A game' }).click();
  await page.getByRole('textbox', { name: 'Technique 1' }).fill('Scissor sweep');
  await page.getByRole('textbox', { name: 'Training Partners' }).fill('Alex');
  await page.getByRole('textbox', { name: 'Notes' }).fill('grip the collar deeper');
  await page.getByRole('button', { name: 'Save entry' }).click();

  await expect(page.getByText('grip the collar deeper')).toBeVisible();
  await expect(page.getByText('Technique 1: Scissor sweep')).toBeVisible();

  await page.getByRole('link', { name: 'Cover' }).click();
  await page.getByRole('button', { name: 'Open journal' }).click();
  await page.getByRole('link', { name: 'Journal', exact: true }).click();
  await page.getByRole('link', { name: 'Add note to an earlier card' }).click();
  await page.getByRole('textbox', { name: 'Search journal' }).fill('scissor');
  await expect(page.getByRole('link', { name: /Scissor sweep/ })).toBeVisible();
  await page.getByRole('link', { name: /Scissor sweep/ }).click();

  await page.getByRole('textbox', { name: 'Amendment' }).fill('kick the far leg');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByText('kick the far leg')).toBeVisible();
  await expect(page.getByText('grip the collar deeper')).toBeVisible();

  await page.getByRole('link', { name: 'Cover' }).click();
  await page.getByRole('button', { name: 'Open journal' }).click();
  await page.getByRole('link', { name: 'Fundamentals' }).click();
  await expect(page.getByRole('heading', { name: 'Sweeps 0 learned' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Scissor sweep learned' }).click();
  await expect(page.getByRole('heading', { name: 'Sweeps 1 learned' })).toBeVisible();
  await context.close();
});
