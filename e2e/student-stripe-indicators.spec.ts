import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

const ARTIFACTS = '/opt/cursor/artifacts';

function rankFile(stripes: number) {
  return {
    schemaVersion: 2,
    kind: 'student-progress-report',
    id: 'student-local',
    studentId: 'student-local',
    updatedAt: 4,
    profile: {
      id: 'student-local',
      displayName: 'Ada',
      gymName: 'GB Ellijay',
      belt: 'blue',
      startedOn: '2008-01-01',
      licenseSource: '',
    },
    rubric: { id: 'rubric-local', levels: [] },
    checklist: [],
    journal: [],
    calendar: [],
    goals: [],
    rank: {
      tapeCount: stripes,
      awardedOn: stripes === 0 ? '' : '2011-04-02',
      tapeDates: ['', '', '', ''],
      history: [],
      lineage: [],
    },
  };
}

async function paintOf(locator: Locator, pseudo = '') {
  return locator.evaluate((el, which) => {
    const style = which ? getComputedStyle(el, which) : getComputedStyle(el);
    return {
      background: style.backgroundColor,
      shadow: style.boxShadow,
      border: style.borderTopWidth === '0px' ? '' : style.borderTopStyle,
    };
  }, pseudo);
}

function expectEmpty(paint: { background: string; shadow: string; border: string }) {
  expect(paint.background).toBe('rgba(0, 0, 0, 0)');
  expect(paint.shadow.includes('inset') || paint.border === 'solid').toBe(true);
}

async function expectBlackBar(locator: Locator, pseudo = '') {
  const background = await locator.evaluate((el, which) => {
    return (which ? getComputedStyle(el, which) : getComputedStyle(el)).backgroundColor;
  }, pseudo);
  expect(background).toBe('rgb(18, 18, 20)');
}

async function storeStripes(page: Page, count: number) {
  await page.evaluate((stored) => {
    localStorage.setItem('matboard.studentEdition.v1', JSON.stringify(stored));
  }, rankFile(count));
}

test('adult stripe rectangles stay empty on the black bar for 0, 2, and 4 stripes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student?student=1');

  for (const count of [0, 2, 4] as const) {
    await storeStripes(page, count);
    await page.goto('/student?student=1');
    const card = page.getByRole('link', { name: 'Rank & Progress', exact: true });
    await expect(card).toContainText(`Blue · ${count} stripe${count === 1 ? '' : 's'}`);
    await expect(card).toHaveCSS('font-family', /Inter/);
    const belt = card.locator('.s-belt');
    await expect(belt).toHaveAttribute('data-stripes', String(count));
    const weave = await belt.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(weave).toContain('belt-weave.png');
    await expectBlackBar(card.locator('.s-belt__bar'));
    const tapes = card.locator('.s-tape');
    await expect(tapes).toHaveCount(4);
    await expect(card.locator('.s-tape--on')).toHaveCount(count);
    for (let index = 0; index < 4; index += 1) expectEmpty(await paintOf(tapes.nth(index)));
    await page.screenshot({ path: `${ARTIFACTS}/stripe-skin-${count}-390.png` });
  }

  await page.goto('/student/progress?student=1');
  await expect(page.getByRole('heading', { name: 'Rank & Progress', exact: true })).toBeVisible();
  const summary = page.getByRole('region', { name: 'Belt summary' });
  await expect(summary).toContainText('Blue belt · 4 stripes');
  await expect(summary.locator('.s-belt')).toHaveAttribute('data-stripes', '4');
  await expectBlackBar(summary.locator('.s-belt__bar'));
  const summaryTapes = summary.locator('.s-tape');
  await expect(summaryTapes).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) expectEmpty(await paintOf(summaryTapes.nth(index)));

  const rows = page.locator('a.s-row--belt');
  await expect(rows).toHaveCount(4);
  for (const row of await rows.all()) {
    const slots = row.locator('.belt-slot');
    await expect(slots).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) expectEmpty(await paintOf(slots.nth(index)));
    const skin = await row.locator('.belt-rail').evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        tape: style.getPropertyValue('--degree-tape').trim(),
        ink: style.getPropertyValue('--degree-bar-ink').trim(),
        weave: style.backgroundImage,
        rowWeave: getComputedStyle(el.parentElement ?? el).backgroundImage,
      };
    });
    expect(skin.tape).toBe('#121214');
    expect(skin.ink).toBe('#121214');
    expect(skin.weave).toContain('belt-weave.png');
    expect(skin.rowWeave).toContain('belt-weave.png');
  }
  await page.screenshot({ path: `${ARTIFACTS}/stripe-skin-rail-390.png`, fullPage: true });

  await page.goto('/student/competitor?student=1');
  const hero = page.getByRole('region', { name: 'Belt rank' });
  await expect(hero).toContainText('4 stripes');
  await expectBlackBar(hero.locator('.arena-stripes'));
  const marks = hero.locator('.arena-stripes span');
  await expect(marks).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) expectEmpty(await paintOf(marks.nth(index)));

  await page.goto('/student/rank?student=1');
  const stripe = page.getByRole('button', { name: 'Stripe 4', exact: true });
  await expect(stripe).toHaveAttribute('aria-pressed', 'true');
  const buttonPaint = await stripe.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(buttonPaint).toBe('rgba(0, 0, 0, 0)');
  expectEmpty(await paintOf(stripe, '::before'));
  await expectBlackBar(page.locator('.rank-rung--blue .rank-slots'), '::before');
  const box = await stripe.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test('an undated stripe counts, can gain and lose a date, and survives backup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/rank?student=1');
  await page.getByRole('button', { name: 'Stripe 1', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stripe 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Stripe 2', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.rank-stripe-date')).toHaveCount(0);
  await expect(page.getByText('1 stripe of 4')).toBeVisible();
  await expect(page.getByText('Invalid Date')).toHaveCount(0);

  await page.getByRole('button', { name: 'Stripe 1', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Stripe 1 details' });
  await expect(editor).toBeVisible();
  const date = editor.getByLabel('Stripe 1 date');
  await expect(date).toHaveJSProperty('required', false);
  await expect(date).toHaveValue('');
  await expect(editor.getByText('No date')).toHaveCount(0);
  await expect(editor.getByText('Invalid Date')).toHaveCount(0);
  await date.fill('2019-03-14');
  await expect(editor.getByText('Date 2019-03-14.')).toBeVisible();
  await expect(page.locator('.rank-stripe-date')).toHaveText('2019-03-14');
  await editor.getByRole('button', { name: 'Remove date', exact: true }).click();
  await expect(date).toHaveValue('');
  await expect(page.locator('.rank-stripe-date')).toHaveCount(0);
  await expect(editor.getByText('No date')).toHaveCount(0);
  await expect(editor.getByText('Invalid Date')).toHaveCount(0);
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stripe 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${ARTIFACTS}/stripe-undated-rank-390.png` });

  await page.goto('/student?student=1');
  await expect(page.getByRole('link', { name: 'Rank & Progress', exact: true })).toContainText('White · 1 stripe');

  await page.goto('/student/print/progress?student=1');
  const report = page.getByRole('article', { name: 'Progress report' });
  await expect(report.getByText('Stripe 1', { exact: true })).toBeVisible();
  await expect(report.getByText(/^Stripe 1:/)).toHaveCount(0);
  await expect(report.getByText('Invalid Date')).toHaveCount(0);
  await expect(report.getByText('Stripes: 1')).toBeVisible();

  const downloads: Download[] = [];
  page.on('download', (download) => {
    downloads.push(download);
  });
  await page.goto('/student/connections?student=1');
  await page.getByRole('button', { name: 'Back up my journal (.json)', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved on this phone');
  await expect.poll(() => downloads.length).toBe(1);
  await page.getByRole('button', { name: 'Download spreadsheet (.csv)', exact: true }).click();
  await expect.poll(() => downloads.length).toBe(2);
  const json = downloads.find((download) => download.suggestedFilename().endsWith('.json'));
  const csv = downloads.find((download) => download.suggestedFilename().endsWith('.csv'));
  expect(json && csv).toBeTruthy();
  const csvBody = readFileSync(await csv!.path(), 'utf8');
  expect(csvBody).not.toContain('Invalid Date');
  expect(csvBody).not.toContain('No date');
  expect(csvBody).toContain('white');
  const backup = JSON.parse(readFileSync(await json!.path(), 'utf8')) as {
    report: { rank?: { tapeCount?: number; tapeDates?: string[] } };
  };
  expect(backup.report.rank?.tapeCount).toBe(1);
  expect(backup.report.rank?.tapeDates?.[0]).toBe('');

  await page.goto('/student/rank?student=1');
  await page.getByRole('button', { name: 'Stripe 1', exact: true }).click();
  await page.getByRole('button', { name: 'Take off Stripe 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stripe 1', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await page.goto('/student/connections?student=1');
  await page.getByLabel('Restore from backup').setInputFiles(await json!.path());
  await page.getByRole('button', { name: 'Replace this phone', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('replaced');
  await page.goto('/student/rank?student=1');
  await expect(page.getByRole('button', { name: 'Stripe 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.rank-stripe-date')).toHaveCount(0);
  await expect(page.getByText('1 stripe of 4')).toBeVisible();
  await expect(page.getByText('Invalid Date')).toHaveCount(0);

  delete backup.report.rank?.tapeDates;
  const olderPath = '/tmp/older-undated-stripe-backup.json';
  writeFileSync(olderPath, JSON.stringify(backup));
  await page.goto('/student/connections?student=1');
  await page.getByLabel('Restore from backup').setInputFiles(olderPath);
  await page.getByRole('button', { name: 'Replace this phone', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('replaced');
  await page.goto('/student?student=1');
  await expect(page.getByRole('link', { name: 'Rank & Progress', exact: true })).toContainText('White · 1 stripe');
  const after = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.v1') ?? '');
  expect(after).toContain('"tapeCount":1');
  expect(after).not.toContain('Invalid Date');
});
