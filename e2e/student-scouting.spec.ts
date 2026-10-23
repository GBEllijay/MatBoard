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
  await page.getByRole('link', { name: 'Competitor', exact: true }).click();
  const scouting = page.getByRole('link', { name: 'Opponent scouting', exact: true });
  const weightLink = page.getByRole('link', { name: 'Weight management', exact: true });
  const scoutingBox = await scouting.boundingBox();
  const weightBox = await weightLink.boundingBox();
  expect(scoutingBox && weightBox).toBeTruthy();
  expect(scoutingBox!.y).toBeGreaterThan(weightBox!.y);
  await scouting.click();

  await expect(page.getByRole('heading', { name: 'Opponent scouting' }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Opponent scouting', exact: true })).toBeVisible();
  await page.getByRole('group', { name: 'Opponent class' }).getByRole('button', { name: 'Weight class', exact: true }).click();
  await page.getByLabel('Opponent name').fill('Sam');
  await page.getByLabel('Opponent gym').fill('Atos');
  await page.getByLabel('Opponent belt').selectOption('Blue');
  await page.getByLabel('Opponent weight class').fill('Middle');
  await page.getByLabel('Opponent style').fill('pressure passer');
  await page.getByLabel('Opponent notes').fill('long arms');
  await page.getByRole('button', { name: 'Add opponent', exact: true }).click();

  const weight = page.getByRole('region', { name: 'Weight class' });
  await expect(weight.locator('strong').filter({ hasText: /^Sam$/ })).toBeVisible();
  await expect(weight.getByText('pressure passer')).toBeVisible();
  await expect(weight.getByRole('link', { name: 'Spring Open · Win · sub' })).toHaveAttribute('href', /\/student\/results/);
  await expect(page.getByRole('region', { name: 'Opponent scouting for Sam' }).getByRole('link', { name: 'Do your self-assessment' })).toHaveAttribute(
    'href',
    '/student/competitor?student=1#self-assessment',
  );
  await page.getByRole('textbox', { name: 'Search opponents' }).fill('pressure');
  await expect(weight.locator('strong').filter({ hasText: /^Sam$/ })).toBeVisible();
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
  await expect(open.locator('strong').filter({ hasText: /^Riley$/ })).toBeVisible();
  await expect(open.getByText('guard puller')).toBeVisible();
  await expect(open.getByText('No recorded matches yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Riley Guard 1', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await page.getByLabel('Import opponent CSV').setInputFiles({
    name: 'ratings.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Name,Belt,Division,Gym name / nickname,Notes,Style,Class,Guard,Passing,Takedowns,Escapes,Submissions,Conditioning,Mindset,Strengths,Weaknesses\nAlex,Blue,Medium,Alliance,patient,pressure,Weight class,5,4,3,2,4,5,1,"frames, long",open guard\n',
    ),
  });
  await expect(page.getByRole('button', { name: 'Alex Guard 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Strengths for Alex')).toHaveValue('frames, long');
  await expect(page.getByLabel('Weaknesses for Alex')).toHaveValue('open guard');
});

test('scouting opponent tracker compares the latest self-assessment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/competitor?student=1');
  const mine: Record<string, string> = {
    Guard: '5',
    Passing: '4',
    Takedowns: '3',
    Escapes: '2',
    Submissions: '4',
    Conditioning: '5',
    Mindset: '3',
  };
  for (const [area, score] of Object.entries(mine)) {
    await page.getByRole('button', { name: `${area} ${score}`, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Save self-assessment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Update self-assessment', exact: true })).toBeVisible();

  await page.goto('/student/scouting?student=1');
  await page.getByLabel('Opponent name').fill('Sam');
  await page.getByLabel('Opponent gym').fill('Atos');
  await page.getByLabel('Opponent belt').selectOption('Blue');
  await page.getByLabel('Opponent weight class').fill('Middle');
  await page.getByRole('button', { name: 'Add opponent', exact: true }).click();

  const theirs: Record<string, string> = {
    Guard: '2',
    Passing: '5',
    Takedowns: '3',
    Escapes: '4',
    Submissions: '1',
    Conditioning: '4',
    Mindset: '5',
  };
  const tracker = page.getByRole('region', { name: 'Opponent scouting for Sam' });
  for (const [area, score] of Object.entries(theirs)) {
    await tracker.getByRole('button', { name: `Sam ${area} ${score}`, exact: true }).click();
  }
  await tracker.getByLabel('Strengths for Sam').fill('pressure passing');
  await tracker.getByLabel('Weaknesses for Sam').fill('takes the back');
  await tracker.getByRole('button', { name: 'Save notes for Sam', exact: true }).click();

  const overlay = page.getByRole('region', { name: 'Me versus Sam' });
  await expect(overlay.getByRole('img', { name: /Me versus Sam/ })).toBeVisible();
  await expect(overlay.getByRole('list', { name: 'Radar legend' })).toContainText('Me');
  await expect(overlay.getByRole('list', { name: 'Radar legend' })).toContainText('Sam');
  await expect(overlay.getByRole('list', { name: 'Comparison with Sam' })).toContainText('Favored: Guard, Submissions, Conditioning');
  await expect(overlay.getByRole('list', { name: 'Comparison with Sam' })).toContainText('Even: Takedowns');
  await expect(overlay.getByRole('list', { name: 'Comparison with Sam' })).toContainText('At a disadvantage: Passing, Escapes, Mindset');
  await expect(tracker.getByRole('link', { name: 'Do your self-assessment' })).toHaveCount(0);

  const ratings = page.getByRole('group', { name: 'Ratings for Sam' });
  await ratings.screenshot({ path: '/opt/cursor/artifacts/screenshots/tracker-ratings-phone.png' });
  await overlay.screenshot({ path: '/opt/cursor/artifacts/screenshots/tracker-overlay-phone.png' });

  await page.setViewportSize({ width: 1280, height: 800 });
  await ratings.screenshot({ path: '/opt/cursor/artifacts/screenshots/tracker-ratings-desktop.png' });
  await overlay.screenshot({ path: '/opt/cursor/artifacts/screenshots/tracker-overlay-desktop.png' });
});
