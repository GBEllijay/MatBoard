import { expect, test, type Page } from '@playwright/test';

const BACK = 'Back. Hold for Home.';

const BELTS = ['White', 'Blue', 'Purple', 'Brown', 'Black'] as const;

const CHECKPOINTS = [
  {
    name: 'Guard',
    note: 'Guard note',
    criteria: ['Hold closed guard.', 'Finish a scissor sweep.'],
  },
  {
    name: 'Escapes',
    note: 'Escapes note',
    criteria: ['Escape mount.', 'Escape side control.'],
  },
  {
    name: 'Passes',
    note: 'Passes note',
    criteria: ['Finish a knee slice pass.', 'Finish a torreando pass.'],
  },
] as const;

async function openStudent(page: Page, path: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
}

test('my rank and belt progress keep every control and match the arena skin', async ({ page }) => {
  await openStudent(page, '/student/progress?student=1');
  await expect(page.getByRole('heading', { name: 'Rank & Progress', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'My rank', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/rank\?student=1$/);
  await expect(page.getByRole('heading', { name: 'My rank', exact: true })).toBeVisible();

  const rank = page.locator('main.student--rank');
  await expect(rank).toHaveClass(/student--arena/);
  await expect(rank).toHaveCSS('font-family', /Inter/);
  await expect(rank).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(rank.locator('.student-leather')).toHaveCount(0);
  await expect(rank.locator('.student-paper')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'My rank', exact: true })).toHaveCSS('font-family', /Inter/);

  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/student/progress?student=1');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/products?student=1');
  await expect(page.getByRole('region', { name: 'Profile' })).toBeVisible();
  await expect(page.getByLabel('Student name')).toBeVisible();
  await expect(page.getByLabel('Gym name')).toBeVisible();
  await expect(page.getByLabel('Start date')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Belt ladder' })).toBeVisible();

  for (const belt of BELTS) {
    const bar = page.getByRole('button', { name: belt, exact: true });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveCSS('min-height', '56px');
    const dateName = belt === 'White' ? 'Date of this belt' : `Date of ${belt} belt`;
    await expect(page.getByLabel(dateName)).toBeVisible();
    await expect(page.getByLabel(`Add ${belt} photo`)).toBeAttached();
    const stripeGroup = belt === 'White' ? 'Stripes' : `${belt} stripes`;
    const group = page.getByRole('group', { name: stripeGroup, exact: true });
    await expect(group).toBeVisible();
    for (const slot of [1, 2, 3, 4]) {
      const stripeName = belt === 'White' ? `Stripe ${slot}` : `${belt} stripe ${slot}`;
      await expect(group.getByRole('button', { name: stripeName, exact: true })).toBeVisible();
    }
  }

  const stripe = page.getByRole('button', { name: 'Stripe 1', exact: true });
  const stripeBox = await stripe.boundingBox();
  expect(stripeBox).toBeTruthy();
  expect(stripeBox!.height).toBeLessThan(48);
  expect(stripeBox!.width).toBeLessThan(24);
  await expect(stripe).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(stripe).toHaveCSS('border-top-width', '2px');
  await expect(stripe).toHaveCSS('border-top-color', 'rgb(28, 20, 14)');
  await expect(stripe).toHaveClass(/rank-tape/);

  await expect(page.getByRole('heading', { name: 'Lineage', exact: true })).toBeVisible();
  const addInstructor = page.getByRole('button', { name: 'Add instructor', exact: true });
  await expect(addInstructor).toBeVisible();
  await expect(addInstructor).toHaveCSS('min-height', '56px');
  await expect(page.getByRole('heading', { name: 'Promotion history', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Belt progress', exact: true })).toHaveAttribute(
    'href',
    '/student/rubric?student=1',
  );

  await page.getByLabel('Student name').fill('Ada Silva');
  await page.getByLabel('Student name').blur();
  await expect(page.getByText('Saved on this phone.')).toBeVisible();
  await page.getByRole('button', { name: 'Stripe 1', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stripe 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Stripe 1', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Stripe 1 details' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Stripe 1 date')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await addInstructor.click();
  await page.getByRole('textbox', { name: 'Instructor 1', exact: true }).fill('Coach Ana');
  await page.getByRole('textbox', { name: 'Instructor 1', exact: true }).blur();
  await expect(page.getByRole('textbox', { name: 'Instructor 1', exact: true })).toHaveValue('Coach Ana');
  await expect(page.getByRole('button', { name: 'Remove instructor 1', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Belt progress', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/rubric\?student=1$/);
  await expect(page.getByRole('heading', { name: 'Belt progress', exact: true })).toBeVisible();

  const belt = page.locator('main.student--belt');
  await expect(belt).toHaveClass(/student--arena/);
  await expect(belt).toHaveCSS('font-family', /Inter/);
  await expect(belt).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(belt.locator('.student-leather')).toHaveCount(0);
  await expect(belt.locator('.student-paper')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Belt progress', exact: true })).toHaveCSS('font-family', /Inter/);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/student/progress?student=1');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/products?student=1');
  await expect(page.getByRole('link', { name: 'My rank', exact: true })).toHaveAttribute('href', '/student/rank?student=1');
  await expect(page.getByRole('list', { name: 'Checkpoints between White and Blue' })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: /^White$/ })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: /^Blue$/ })).toBeVisible();

  for (const checkpoint of CHECKPOINTS) {
    await expect(page.getByRole('listitem', { name: `${checkpoint.name}, open` })).toBeVisible();
    await expect(page.getByRole('region', { name: `${checkpoint.name} checkpoint` })).toBeVisible();
    const mark = page.getByRole('button', { name: `Mark ${checkpoint.name} checkpoint met` });
    await expect(mark).toBeVisible();
    await expect(mark).toHaveCSS('min-height', '56px');
    await expect(page.getByLabel(checkpoint.note)).toBeVisible();
    for (const requirement of checkpoint.criteria) {
      const met = page.getByRole('button', { name: `Mark ${requirement} met` });
      await expect(met).toBeVisible();
      await expect(met).toHaveCSS('min-height', '56px');
      await expect(page.getByLabel(`${requirement} date`)).toBeVisible();
      await expect(page.getByLabel(`${requirement} note`)).toBeVisible();
    }
  }

  await expect(page.getByRole('link', { name: 'Make a file for my coach', exact: true })).toHaveAttribute(
    'href',
    '/student/share?from=rubric&student=1',
  );
  await expect(page.getByRole('link', { name: 'Import from coach', exact: true })).toHaveAttribute(
    'href',
    '/student/share?from=rubric&student=1#import',
  );
  await expect(page.getByRole('region', { name: 'Goals' })).toBeVisible();
  await expect(page.getByLabel('Goal name')).toBeVisible();
  await expect(page.getByLabel('Goal note')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add goal', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'From my coach' })).toBeVisible();
  await expect(page.getByText('Nothing from your coach on this phone yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Mark Hold closed guard. met' }).click();
  await expect(page.getByRole('button', { name: 'Hold closed guard. met' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Goal name').fill('Compete in May');
  await page.getByLabel('Goal note').fill('local');
  await page.getByRole('button', { name: 'Add goal', exact: true }).click();
  await expect(page.getByLabel('Edit Compete in May')).toBeVisible();
  await expect(page.getByLabel('Note for Compete in May')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Compete in May' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark Compete in May met' })).toBeVisible();

  await page.getByRole('link', { name: 'My rank', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/rank\?student=1$/);
  await expect(page.getByRole('heading', { name: 'My rank', exact: true })).toBeVisible();
  await expect(page.getByLabel('Student name')).toHaveValue('Ada Silva');
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect(page).toHaveURL(/\/student\/progress\?student=1$/);
  await expect(page.getByRole('heading', { name: 'Rank & Progress', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fundamentals', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Self-assessment', exact: true })).toBeVisible();

  await page.goto('/student/fundamentals?student=1');
  const fundamentals = page.locator('main.student--fundamentals');
  await expect(fundamentals).toBeVisible();
  await expect(fundamentals).toHaveClass(/student--arena/);
  await expect(fundamentals).not.toHaveClass(/student--rank|student--belt/);
  await expect(page.getByRole('heading', { name: 'Fundamentals', exact: true })).toBeVisible();

  await page.goto('/student/competitor?from=progress&student=1#self-assessment');
  const assessment = page.locator('#self-assessment');
  await expect(assessment).toBeVisible();
  await expect(page.locator('main.student--arena')).toBeVisible();
  await expect(page.locator('main.student--rank, main.student--belt')).toHaveCount(0);
  await expect(assessment.getByRole('heading', { name: 'Self-assessment', exact: true })).toBeVisible();
  await expect(assessment.getByLabel('Self-assessment date')).toBeVisible();
  await expect(assessment.getByRole('button', { name: 'Save self-assessment' })).toBeVisible();
});
