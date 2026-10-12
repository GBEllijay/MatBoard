import { expect, test } from '@playwright/test';

const BACK = 'Back. Hold for Home.';

test('student journal saves, searches, amends, and marks a fundamental', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/student?student=1');
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/?student=1');
  await page.getByRole('link', { name: 'Journal', exact: true }).click();
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/student?student=1');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/?student=1');

  await page.getByRole('button', { name: 'Gi', exact: true }).click();
  await page.getByRole('button', { name: 'A game' }).click();
  await expect(page.getByRole('button', { name: 'Gi', exact: true })).toHaveCSS('background-color', 'rgb(0, 78, 186)');
  await expect(page.getByRole('button', { name: 'A game' })).toHaveCSS('background-color', 'rgb(0, 78, 186)');
  await expect(page.getByRole('button', { name: 'Save entry' })).toHaveCSS('background-color', 'rgb(252, 192, 0)');
  await page.getByRole('textbox', { name: 'Technique 1' }).fill('Scissor sweep');
  await page.getByRole('textbox', { name: 'Training Partners' }).fill('Alex');
  await page.getByRole('textbox', { name: 'Notes' }).fill('grip the collar deeper');
  await page.getByRole('button', { name: 'Save entry' }).click();

  await expect(page.getByText('grip the collar deeper')).toBeVisible();
  await expect(page.getByText('Technique 1: Scissor sweep')).toBeVisible();

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect(page).toHaveURL(/\/student\/cards\?student=1$/);
  await page.getByRole('textbox', { name: 'Search journal' }).fill('scissor');
  await expect(page.getByRole('link', { name: /Scissor sweep/ })).toBeVisible();
  await page.getByRole('link', { name: /Scissor sweep/ }).click();

  await page.getByRole('textbox', { name: 'Amendment' }).fill('kick the far leg');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByText('kick the far leg')).toBeVisible();
  await expect(page.getByText('grip the collar deeper')).toBeVisible();

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: 'Fundamentals', exact: true }).click();
  const sweeps = page.getByRole('region', { name: 'Sweeps' });
  await expect(page.getByRole('heading', { name: 'Sweeps 0 learned' })).toBeVisible();
  await sweeps.getByRole('button', { name: 'Mark Scissor sweep learned' }).click();
  await expect(page.getByRole('heading', { name: 'Sweeps 1 learned' })).toBeVisible();

  await sweeps.getByRole('button', { name: 'Rename Scissor sweep' }).click();
  await sweeps.getByRole('textbox', { name: 'New name for Scissor sweep' }).fill('Hip scissor');
  await sweeps.getByRole('button', { name: 'Save name' }).click();
  await expect(sweeps.getByText('Hip scissor', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sweeps 1 learned' })).toBeVisible();

  await sweeps.getByRole('button', { name: 'Remove Hip scissor' }).click();
  await sweeps.getByRole('button', { name: 'Confirm remove Hip scissor' }).click();
  await expect(page.getByRole('heading', { name: 'Sweeps 0 learned' })).toBeVisible();
  await expect(sweeps.getByText('Hip scissor', { exact: true })).toHaveCount(0);

  await sweeps.getByRole('textbox', { name: 'Add your own to Sweeps' }).fill('Lasso sweep');
  await sweeps.getByRole('button', { name: 'Add' }).click();
  await sweeps.getByRole('button', { name: 'Rename Lasso sweep' }).click();
  await sweeps.getByRole('textbox', { name: 'New name for Lasso sweep' }).fill('Lasso from guard');
  await sweeps.getByRole('button', { name: 'Save name' }).click();
  await expect(sweeps.getByText('Lasso from guard', { exact: true })).toBeVisible();
  await sweeps.getByRole('button', { name: 'Remove Lasso from guard' }).click();
  await sweeps.getByRole('button', { name: 'Confirm remove Lasso from guard' }).click();
  await expect(sweeps.getByText('Lasso from guard', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Restore starter list' }).click();
  await page.getByRole('button', { name: 'Confirm restore starter list' }).click();
  await expect(sweeps.getByText('Scissor sweep', { exact: true })).toBeVisible();
  await expect(sweeps.getByText('Lasso from guard')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sweeps 1 learned' })).toBeVisible();

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect(page.getByRole('link', { name: 'Journal', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Journal', exact: true }).click();
  await page.getByRole('link', { name: 'Add note to an earlier card' }).click();
  await page.getByRole('textbox', { name: 'Search journal' }).fill('scissor');
  await expect(page.getByRole('link', { name: /Scissor sweep/ })).toBeVisible();
  await context.close();
});
