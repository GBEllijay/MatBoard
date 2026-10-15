import { expect, test, type Page } from '@playwright/test';
import { FULL_OWNER_UNLOCK_CODE } from '../src/lib/proUnlock.ts';

const BACK = 'Back. Hold for Home.';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: true });
}

test('competitor tracker, game, weight, calendar, and coach import', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`/?student=${FULL_OWNER_UNLOCK_CODE}`);
  await expect(page).not.toHaveURL(new RegExp(FULL_OWNER_UNLOCK_CODE, 'i'));
  await page.getByRole('link', { name: 'Open Student Edition', exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);

  const competitor = page.getByRole('link', { name: 'Competitor', exact: true });
  await expect(competitor).toBeVisible();
  await expect(competitor).toHaveCSS('background-color', 'rgb(244, 240, 228)');
  await expect(competitor).toHaveCSS('font-family', /Patrick Hand/);
  const rules = await competitor.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(rules).toContain('repeating-linear-gradient');
  const spine = competitor.locator('.leather-spine');
  const grain = await spine.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(grain).toContain('black-leather-grain.png');

  await competitor.click();
  await expect(page.getByRole('heading', { name: 'Competitor' })).toBeVisible();
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/student');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/');

  const today = await page.evaluate(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  });

  await page.getByLabel('Tournament name').fill('Spring Open');
  await page.getByLabel('Tournament date').fill(today);
  await page.getByLabel('Tournament location').fill('Atlanta');
  await page.getByLabel('Division and weight class').fill('Adult Blue Middle');
  await page.getByLabel('Registration deadline').fill(today);
  await page.getByLabel('Tournament link').fill('https://example.com/spring');
  await page.getByRole('button', { name: 'Entered', exact: true }).click();
  await page.getByLabel('Target division weight').fill('170');
  await page.getByRole('button', { name: 'Add tournament', exact: true }).click();
  await expect(page.getByText('Entered · Spring Open')).toBeVisible();

  await page.getByLabel('Goal for Spring Open').fill('Pass half guard');
  await page.getByRole('button', { name: 'Add goal for Spring Open' }).click();
  await expect(page.getByRole('button', { name: 'Mark Pass half guard met' })).toBeVisible();

  await page.getByLabel('A game techniques').fill('Armbar from mount');
  await page.getByLabel('A game plan').fill('Finish the grip');
  await page.getByRole('button', { name: 'Save game A', exact: true }).click();

  await page.getByLabel('Weigh-in weight').fill('170');
  await page.getByRole('button', { name: 'Add weigh-in', exact: true }).click();
  await expect(page.getByText(`${today} · 170 lb`)).toBeVisible();
  await page.getByRole('group', { name: 'Weight unit', exact: true }).getByRole('button', { name: 'Kilograms' }).click();
  await expect(page.getByText(new RegExp(`${today} · 77\\.1 kg`))).toBeVisible();
  await shot(page, 'competitor-section-390');

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  const day = page.locator(`[data-tournament="true"]`);
  await expect(day).toBeVisible();
  await expect(day).toHaveAttribute('aria-label', /tournament/);
  await expect(page.getByRole('region', { name: 'Tournaments' })).toContainText('Spring Open');
  await shot(page, 'competitor-calendar-390');
  await day.click();
  await expect(page.getByText('Entered · Spring Open')).toBeVisible();
  await expect(page.getByRole('link', { name: 'https://example.com/spring' })).toBeVisible();

  await page.goto('/student/cards');
  await page.getByRole('textbox', { name: 'Search journal' }).fill('armbar');
  await expect(page.getByRole('region', { name: 'Competition game' })).toContainText('Armbar from mount');
  await expect(page.getByRole('region', { name: 'Competition game' })).toContainText('Finish the grip');

  await page.goto('/student/journal');
  await page.getByRole('button', { name: 'A game' }).click();
  await expect(page.getByLabel('A game techniques')).toHaveValue('Armbar from mount');
  await expect(page.getByLabel('A game plan')).toHaveValue('Finish the grip');
  await shot(page, 'competitor-journal-game-390');

  const progress = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.v1') ?? '');
  expect(progress).toContain('"schemaVersion":2');
  expect(progress).toContain('Spring Open');

  await page.goto('/roster?from=competitors');
  await page.getByRole('button', { name: 'Add competitor', exact: true }).first().click();
  await page.getByLabel('Competitor name').fill('Alex Student');
  await page.getByRole('radio', { name: 'Blue', exact: true }).click();
  await page.getByRole('button', { name: 'Save competitor' }).click();
  const card = page.locator('.roster-card', { hasText: 'Alex Student' });
  await card.getByLabel('Import student progress for Alex Student').setInputFiles({
    name: 'advantage-handoff-student-progress-report.json',
    mimeType: 'application/json',
    buffer: Buffer.from(progress),
  });
  await expect(card.getByText('Competition plan is on this phone.')).toBeVisible();
  await expect(card.getByRole('region', { name: 'Student competition plan' })).toContainText('Armbar from mount');
  await expect(card.getByRole('region', { name: 'Student competition plan' })).toContainText('Spring Open');
  await shot(page, 'competitor-roster-plan-390');
  await context.close();
});
