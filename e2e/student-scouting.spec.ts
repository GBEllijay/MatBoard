import { expect, test } from '@playwright/test';

test('scouting cards import a roster csv and link a recorded match', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/results?student=1');
  await page.getByLabel('Result tournament name').fill('Spring Open');
  await page.getByLabel('Result division').fill('Adult Blue Middle');
  await page.getByRole('button', { name: 'Add result', exact: true }).click();
  await page.getByLabel('Opponent for Spring Open').fill('Sam');
  await page.getByRole('group', { name: 'Result for Spring Open' }).getByRole('button', { name: 'Win', exact: true }).click();
  await page.getByRole('group', { name: 'Method for Spring Open' }).getByRole('button', { name: 'Sub', exact: true }).click();
  await page.getByRole('button', { name: 'Add match for Spring Open' }).click();
  await expect(page.getByText('Win · Sam · Sub')).toBeVisible();

  await page.goto('/student?student=1');
  const scouting = page.getByRole('link', { name: 'Scouting', exact: true });
  const calendar = page.getByRole('link', { name: 'Calendar', exact: true });
  const belt = page.getByRole('link', { name: 'Belt progress', exact: true });
  const scoutingBox = await scouting.boundingBox();
  const calendarBox = await calendar.boundingBox();
  const beltBox = await belt.boundingBox();
  expect(scoutingBox && calendarBox && beltBox).toBeTruthy();
  expect(scoutingBox!.y).toBeGreaterThan(calendarBox!.y);
  expect(scoutingBox!.y).toBeLessThan(beltBox!.y);
  await scouting.click();

  await expect(page.getByRole('heading', { name: 'Scouting' })).toBeVisible();
  await page.getByRole('group', { name: 'Opponent class' }).getByRole('button', { name: 'Weight class', exact: true }).click();
  await page.getByLabel('Opponent name').fill('Sam');
  await page.getByLabel('Opponent gym').fill('Atos');
  await page.getByLabel('Opponent belt').selectOption('Blue');
  await page.getByLabel('Opponent weight class').fill('Middle');
  await page.getByLabel('Opponent style').fill('pressure passer');
  await page.getByLabel('Opponent notes').fill('long arms');
  await page.getByRole('button', { name: 'Add opponent', exact: true }).click();

  const weight = page.getByRole('region', { name: 'Weight class' });
  await expect(weight.getByText('Sam', { exact: true })).toBeVisible();
  await expect(weight.getByText('pressure passer')).toBeVisible();
  await expect(weight.getByRole('link', { name: 'Spring Open · Win · sub' })).toHaveAttribute('href', /\/student\/results/);
  await page.getByRole('textbox', { name: 'Search opponents' }).fill('pressure');
  await expect(weight.getByText('Sam', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Open class' }).getByText('No opponents in this class yet.')).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/scouting-page-390.png', fullPage: true });

  await page.getByRole('textbox', { name: 'Search opponents' }).fill('');
  await page.getByLabel('Import opponent CSV').setInputFiles({
    name: 'advantage-roster.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Belt,Division,Gym name / nickname,Notes,Style,Class\nRiley,Purple,Light,Checkmat,lefty,guard puller,Open class\n'),
  });
  await expect(page.getByRole('status')).toContainText('1');
  const open = page.getByRole('region', { name: 'Open class' });
  await expect(open.getByText('Riley', { exact: true })).toBeVisible();
  await expect(open.getByText('guard puller')).toBeVisible();
  await expect(open.getByText('No recorded matches yet.')).toBeVisible();
});
