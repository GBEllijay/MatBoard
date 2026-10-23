import { expect, test } from '@playwright/test';

test('my rank sets the belt and stripes, and belt progress reads that belt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student?student=1');
  const training = page.getByRole('link', { name: 'Training & Journal', exact: true });
  const rankGroup = page.getByRole('link', { name: 'Rank & Progress', exact: true });
  const compete = page.getByRole('link', { name: 'Competitor', exact: true });
  const trainingBox = await training.boundingBox();
  const rankBox = await rankGroup.boundingBox();
  const competeBox = await compete.boundingBox();
  expect(trainingBox && rankBox && competeBox).toBeTruthy();
  expect(rankBox!.y).toBeGreaterThan(trainingBox!.y);
  expect(rankBox!.y).toBeLessThan(competeBox!.y);

  await page.goto('/student/calendar?student=1');
  await page.getByLabel('Event date').fill('2020-06-01');
  await page.getByLabel('Event title').fill('Blue belt test');
  await page.getByRole('button', { name: 'Promotion test', exact: true }).click();
  await page.getByRole('button', { name: 'Add event', exact: true }).click();

  await page.goto('/student/rank?student=1');
  await expect(page.getByRole('heading', { name: 'My rank' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Belt ladder' })).toBeVisible();
  const whiteBox = await page.getByRole('button', { name: 'White', exact: true }).boundingBox();
  const blueBox = await page.getByRole('button', { name: 'Blue', exact: true }).boundingBox();
  const blackBox = await page.getByRole('button', { name: 'Black', exact: true }).boundingBox();
  expect(whiteBox && blueBox && blackBox).toBeTruthy();
  expect(whiteBox!.y).toBeLessThan(blueBox!.y);
  expect(blueBox!.y).toBeLessThan(blackBox!.y);
  await expect(page.getByLabel('Date of this belt')).toHaveValue('');
  await page.getByRole('button', { name: 'Blue', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const today = await page.evaluate(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  });
  await page.getByLabel('Date of this belt').fill(today);
  await page.getByRole('button', { name: 'Stripe 2', exact: true }).click();
  const stripe = page.getByRole('dialog', { name: 'Stripe 2 details' });
  await expect(stripe).toBeVisible();
  await expect(stripe.getByText('No date')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stripe 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Stripe 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Stripe 3', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await stripe.getByLabel('Stripe 2 date').fill(today);
  await expect(stripe.getByText(`Date ${today}`)).toBeVisible();
  await stripe.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Date of this belt')).toHaveValue(today);
  await page.getByLabel('Lineage').fill('Coach Ana\nProfessor Luis');
  await page.getByLabel('Lineage').blur();
  await expect(page.getByRole('textbox', { name: 'Instructor 1', exact: true })).toHaveValue('Coach Ana');
  await expect(page.getByRole('textbox', { name: 'Instructor 2', exact: true })).toHaveValue('Professor Luis');
  await page.getByLabel('Add Blue photo').setInputFiles({
    name: 'belt.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(page.getByRole('img', { name: 'Blue photo 1' })).toBeVisible();
  await page.locator('.rank-ladder').screenshot({ path: '/opt/cursor/artifacts/my-rank-ladder-390.png' });

  await page.getByRole('button', { name: 'Purple', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Purple', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Date of this belt')).toHaveValue('');
  const history = page.getByRole('region', { name: 'Promotion history' });
  await expect(history).toContainText('Blue');
  await expect(history).toContainText(today);
  await expect(history).toContainText('2 stripes');
  await page.getByRole('button', { name: 'Stripe 1', exact: true }).click();
  await page.getByRole('dialog', { name: 'Stripe 1 details' }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.student-sheet').screenshot({ path: '/opt/cursor/artifacts/my-rank-390.png' });

  const stored = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.v1') ?? '');
  const photos = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.rankPhotos.v1') ?? '');
  expect(stored).toContain('"tapeCount"');
  expect(stored).toContain('Coach Ana');
  expect(stored).not.toContain('"stripes"');
  expect(stored).not.toContain('data:image');
  expect(photos).toContain('data:image');
  expect(stored).toContain('"belt":"purple"');
  expect(stored).toContain('Blue belt test');
  expect(stored).toContain('"kind":"promotion"');
  expect(stored).not.toContain('"awardedOn":"2020-06-01"');

  await page.goto('/student/rubric?student=1');
  await expect(page.getByRole('heading', { name: 'Belt progress' })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: /^Purple$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Blue', exact: true })).toHaveCount(0);
  await expect(page.getByText(/stripe/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'My rank', exact: true })).toBeVisible();

  await page.goto('/student/calendar?student=1');
  const marked = page.getByRole('button', { name: /belt/ });
  await expect(marked).toHaveAttribute('data-rank', 'true');
  await marked.click();
  await expect(page.getByRole('region', { name: 'My rank' })).toContainText('Blue belt');
  await expect(page.getByRole('region', { name: 'My rank' })).toContainText('Blue stripe 2');
  await expect(page.getByText('Promotion test · Blue belt test')).toHaveCount(0);
});
