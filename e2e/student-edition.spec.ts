import { expect, test } from '@playwright/test';

const BACK = 'Back. Hold for Home.';

test('student journal saves, searches, amends, and marks a fundamental', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/student?student=1');
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/products?student=1');
  await page.getByRole('link', { name: 'Training & Journal', exact: true }).click();
  await page.getByRole('link', { name: "Today's page", exact: true }).click();
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/student/training?student=1');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/products?student=1');

  await expect(page.getByRole('button', { name: 'A game' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gi', exact: true })).toHaveCount(0);
  const classField = page.getByRole('textbox', { name: 'Class', exact: true });
  await expect(classField).toHaveAttribute('placeholder', 'Fundamentals, week 7, class B');
  await classField.fill('Fundamentals, week 7, class B');
  await expect(page.getByRole('button', { name: 'Save entry' })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByRole('button', { name: 'Save entry' })).toHaveCSS('color', 'rgb(14, 23, 38)');
  await expect(page.getByRole('button', { name: 'Save entry' })).toHaveCSS('border-top-color', 'rgb(14, 23, 38)');
  await expect(page.getByRole('textbox', { name: 'Technique drilled #1' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Technique drilled #2' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Technique drilled #3' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Technique drilled #4' })).toHaveCount(0);
  await expect(page.locator('.student-belt')).toHaveCount(0);
  await page.screenshot({ path: '/opt/cursor/artifacts/journal-technique-rows-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Add another technique', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Technique drilled #4' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Technique drilled #1' }).fill('Scissor sweep');
  await page.getByRole('button', { name: 'Pick Technique drilled #2 from fundamentals' }).click();
  const picker = page.getByRole('dialog', { name: 'Pick Technique drilled #2' });
  for (const category of ['Positions', 'Sweeps', 'Escapes', 'Passes', 'Submissions']) {
    const heading = picker.getByRole('heading', { name: category, exact: true });
    await expect(heading).toHaveCSS('font-weight', '700');
    await expect(heading).toHaveCSS('text-decoration-line', 'underline');
  }
  await page.screenshot({ path: '/opt/cursor/artifacts/journal-picker-categories-clear-390.png' });
  await picker.getByRole('button', { name: 'Hip bump sweep', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Technique drilled #2' })).toHaveValue('Hip bump sweep');
  await page.getByRole('textbox', { name: 'Training Partners' }).fill('Alex');
  await page.getByRole('textbox', { name: 'Drill notes' }).fill('grip the collar deeper');
  await page.getByRole('button', { name: 'Save entry' }).click();

  await expect(page.getByText('grip the collar deeper')).toBeVisible();
  await expect(page.getByText(/· Fundamentals, week 7, class B/)).toBeVisible();
  await expect(page.getByText('Technique drilled #1: Scissor sweep')).toBeVisible();
  await expect(page.getByText('Technique drilled #2: Hip bump sweep')).toBeVisible();
  await expect(page.getByText('Technique drilled #3:')).toHaveCount(0);

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
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: 'Rank & Progress', exact: true }).click();
  await page.getByRole('link', { name: 'Fundamentals', exact: true }).click();
  const sweeps = page.getByRole('region', { name: 'Sweeps' });
  await expect(sweeps.getByRole('heading', { name: 'Sweeps', exact: true })).toBeVisible();
  await expect(sweeps.getByText('0 of 5 ready when a partner resists')).toBeVisible();
  await sweeps.getByRole('radio', { name: 'Scissor sweep 3 Live with resistance' }).click();
  await expect(sweeps.getByText('1 of 5 ready when a partner resists')).toBeVisible();

  await sweeps.getByRole('button', { name: 'Rename Scissor sweep' }).click();
  await sweeps.getByRole('textbox', { name: 'New name for Scissor sweep' }).fill('Hip scissor');
  await sweeps.getByRole('button', { name: 'Save name' }).click();
  await expect(sweeps.getByText('Hip scissor', { exact: true })).toBeVisible();
  await expect(sweeps.getByText('1 of 5 ready when a partner resists')).toBeVisible();

  await sweeps.getByRole('button', { name: 'Remove Hip scissor' }).click();
  await sweeps.getByRole('button', { name: 'Confirm remove Hip scissor' }).click();
  await expect(sweeps.getByText('0 of 4 ready when a partner resists')).toBeVisible();
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
  await expect(sweeps.getByText('1 of 5 ready when a partner resists')).toBeVisible();

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: 'Training & Journal', exact: true }).click();
  await page.getByRole('link', { name: "Today's page", exact: true }).click();
  await page.getByRole('link', { name: 'Add note to an earlier card' }).click();
  await page.getByRole('textbox', { name: 'Search journal' }).fill('scissor');
  await expect(page.getByRole('link', { name: /Scissor sweep/ })).toBeVisible();
  await context.close();
});
