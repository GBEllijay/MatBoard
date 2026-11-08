import { expect, test } from '@playwright/test';

test('fundamentals levels show on the self-assessment chart without retyping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/fundamentals?student=1');
  await expect(page.getByRole('heading', { name: 'Fundamentals' })).toBeVisible();

  const picks: [string, string][] = [
    ['Sweeps', 'Scissor sweep 4 Hitting in rolls'],
    ['Passes', 'Knee slice pass 2 Drilling'],
    ['Takedowns', 'Double leg 5 Can teach it'],
    ['Escapes', 'Mount escape 3 Live with resistance'],
    ['Submissions', 'Armbar from guard 1 Introduced'],
    ['Movement', 'Shrimp 4 Hitting in rolls'],
  ];
  for (const [region, name] of picks) {
    await page.getByRole('region', { name: region }).getByRole('radio', { name }).click();
  }

  await page.getByRole('link', { name: 'Self-assessment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Self-assessment' })).toBeVisible();
  await expect(page.locator('svg.assess-chart').first()).toHaveAttribute(
    'aria-label',
    'Self-assessment shape, Guard 4, Passing 2, Takedowns 5, Escapes 3, Submissions 1, Conditioning 4, Mindset not rated',
  );
  await expect(page.getByRole('button', { name: 'Guard/Control 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Passing 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Sweeps 4', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Sweeps 2', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Takedowns 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Escapes/Defense 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Submissions 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Conditioning 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Mindset 4', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('Mindset is not on the Fundamentals list. Rate it here, then save this day.')).toBeVisible();

  const beforeSave = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.assessment.v1'));
  expect(beforeSave).toBeNull();
  const progress = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.v1') ?? '');
  expect(progress).toContain('sweep.scissor');

  await page.locator('.assess-visuals').screenshot({ path: '/opt/cursor/artifacts/screenshots/after-self-assessment-chart.png' });
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/after-self-assessment.png', fullPage: true });

  await page.getByRole('button', { name: 'Mindset 2', exact: true }).click();
  await page.getByLabel('Self-assessment note').fill('carried over');
  await page.getByRole('button', { name: 'Save self-assessment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Update self-assessment', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guard/Control 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Sweeps 4', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const saved = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.assessment.v1') ?? '');
  expect(saved).toContain('carried over');
  expect(saved).toContain('"guard":4');
  expect(saved).toContain('"mindset":2');
  expect(saved).not.toContain('"sweeps"');
  const progressAfter = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.v1') ?? '');
  expect(progressAfter).toContain('sweep.scissor');
});
