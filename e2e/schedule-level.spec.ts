import { expect, test, type Page } from '@playwright/test';

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
  });
}

test('class level survives editor reopen, reload, and CSV export', async ({ page }) => {
  await unlock(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { name: 'Class Schedule' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit class schedule' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Class name').fill('Noon Gi');
  await dialog.getByRole('radio', { name: /Intermediate/ }).click();
  await dialog.getByRole('button', { name: 'Add class' }).click();

  const level = dialog.getByLabel('Level for Noon Gi');
  await expect(level).toHaveValue('intermediate');

  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(dialog.getByLabel('Level for Noon Gi')).toHaveValue('intermediate');

  await dialog.getByLabel('Level for Noon Gi').selectOption('kids-advanced');
  await expect(dialog.getByLabel('Level for Noon Gi')).toHaveValue('kids-advanced');
  await expect(dialog.getByLabel('Level for Noon Gi').locator('option:checked')).toHaveText('Kids Advanced');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Class Schedule' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('.week-cast__class', { hasText: 'Noon Gi' })).toHaveAttribute('data-level', 'kids-advanced');
  await expect(dialog.getByLabel('Level for Noon Gi')).toHaveValue('kids-advanced');
  await expect(dialog.getByLabel('Level for Noon Gi').locator('option:checked')).toHaveText('Kids Advanced');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  const csv = await download.createReadStream().then(async (stream) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
  });
  const header = csv.replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.startsWith('Record,')) ?? '';
  expect(header.split(',')).toContain('Level');
  expect(csv).toMatch(/Noon Gi/);
  expect(csv).toMatch(/Kids Advanced/);

  const stored = await page.evaluate(() => localStorage.getItem('matboard.schedule.v1'));
  expect(stored).toContain('"level":"kids-advanced"');
});
