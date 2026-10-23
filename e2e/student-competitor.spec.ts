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
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/products');

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
  await expect(page.getByLabel('Weigh-in weight')).toHaveCount(0);
  await shot(page, 'competitor-section-390');

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: 'Weight', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible();
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/student');
  await expect(page.getByText('Today', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Date', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Weight', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Pounds to Target', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Note', exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader')).toHaveCount(3);
  await expect(page.getByLabel('Goal weight')).toBeVisible();
  await expect(page.getByLabel('Competition weigh-in date')).toBeVisible();
  await page.getByLabel('Weigh-in weight').fill('170');
  await page.getByLabel('Weigh-in note').fill('morning');
  await page.getByRole('button', { name: 'Add weigh-in', exact: true }).click();
  await expect(page.getByRole('cell', { name: '170 lb', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '0 lb', exact: true })).toBeVisible();
  await expect(page.getByLabel('Weigh-in notes')).toContainText('morning');
  await page.getByRole('group', { name: 'Weight unit', exact: true }).getByRole('button', { name: 'Kilograms' }).click();
  await expect(page.getByRole('columnheader', { name: 'Kilograms to Target', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader')).toHaveCount(3);
  await expect(page.getByRole('cell', { name: /77\.1 kg/ })).toBeVisible();
  await expect(page.getByLabel('Target weight for Spring Open')).toHaveValue('170');
  await page.getByLabel('Goal weight').fill('75');
  await page.getByRole('button', { name: 'Save goal weight', exact: true }).click();
  const later = await page.evaluate(() => {
    const now = new Date();
    now.setDate(now.getDate() + 12);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  });
  await page.getByLabel('Competition weigh-in date').fill(later);
  await page.getByRole('button', { name: 'Save weigh-in date', exact: true }).click();
  await expect(page.getByText('12 days', { exact: true })).toBeVisible();
  await shot(page, 'weight-page-390');

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: 'Results', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  await page.getByLabel('Tracked tournament').selectOption({ label: 'Spring Open' });
  await expect(page.getByLabel('Result tournament name')).toHaveValue('Spring Open');
  await page.getByRole('button', { name: 'Add result', exact: true }).click();
  await page.getByLabel('Opponent for Spring Open').fill('Sam');
  await page.getByRole('group', { name: 'Result for Spring Open' }).getByRole('button', { name: 'Win', exact: true }).click();
  await page.getByRole('group', { name: 'Method for Spring Open' }).getByRole('button', { name: 'Sub', exact: true }).click();
  await page.getByLabel('Match notes for Spring Open').fill('closed the guard');
  await page.getByRole('button', { name: 'Add match for Spring Open' }).click();
  await expect(page.getByText('Win · Sam · Sub')).toBeVisible();
  await page.getByLabel('Bracket round for Spring Open').fill('Final');
  await page.getByLabel('Bracket name for Spring Open').fill('Sam');
  await page.getByRole('button', { name: 'Add bracket line for Spring Open' }).click();
  await expect(page.getByText('Final — Sam')).toBeVisible();
  await expect(page.getByText('closed the guard')).toBeVisible();
  await shot(page, 'results-page-390');

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: 'Journal cards', exact: true }).click();
  const journalSearch = page.getByRole('textbox', { name: 'Search journal' });
  await expect(journalSearch).toHaveAttribute('placeholder', 'Technique, note, opponent, or tournament');
  await journalSearch.fill('Sam');
  const found = page.getByRole('region', { name: 'Competition results' });
  await expect(found).toContainText('Spring Open');
  await expect(found).toContainText('Win · Sam · Sub — closed the guard');
  await journalSearch.fill('Middle');
  await expect(found).toContainText('Adult Blue Middle');
  await journalSearch.fill('Final');
  await expect(page.getByRole('region', { name: 'Competition results' })).toHaveCount(0);
  await journalSearch.fill('Sam');
  await shot(page, 'journal-results-search-390');
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
  await expect(page.getByRole('button', { name: 'A game' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Class', exact: true })).toBeVisible();
  await page.goto('/student/competitor');
  await expect(page.getByLabel('A game techniques')).toHaveValue('Armbar from mount');
  await expect(page.getByLabel('A game plan')).toHaveValue('Finish the grip');

  const progress = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.v1') ?? '');
  expect(progress).toContain('"schemaVersion":2');
  expect(progress).toContain('Spring Open');
  expect(progress).toContain('Sam');
  expect(progress).not.toContain('data:image');

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
  await expect(card.getByRole('region', { name: 'Student competition plan' })).toContainText('win Sam');
  const find = page.getByLabel('Find competitor');
  await expect(find).toHaveAttribute('placeholder', 'Name, belt, division, opponent, or tournament');
  await find.fill('Sam');
  await expect(card).toBeVisible();
  await expect(page.locator('.roster-card')).toHaveCount(1);
  await find.fill('sub');
  await expect(card).toBeVisible();
  await find.fill('Middle');
  await expect(page.getByText('No match', { exact: true })).toBeVisible();
  await find.fill('Sam');
  await shot(page, 'roster-result-search-390');
  await shot(page, 'competitor-roster-plan-390');
  await context.close();
});
