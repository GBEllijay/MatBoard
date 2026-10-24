import { expect, test, type Page } from '@playwright/test';
import { exportProgressPacket } from '../src/lib/progress/format.ts';
import { addTournament } from '../src/lib/studentCompetition.ts';
import { blankStudentReport, STUDENT_EDITION_STORAGE_KEY } from '../src/lib/studentEdition.ts';

const FORM = '/student/competitor?student=1';

function legacyProgress(): string {
  let report = addTournament(
    blankStudentReport(10),
    {
      name: 'Legacy Open',
      date: '2026-12-01',
      location: 'Atlanta',
      division: 'Adult Blue / Feather',
      deadline: '',
      link: '',
      status: 'considering',
      targetWeight: '',
      targetUnit: 'lb',
    },
    11,
  );
  report = addTournament(
    report,
    {
      name: 'Plain Open',
      date: '2026-12-02',
      location: '',
      division: 'Adult Blue Middle',
      deadline: '',
      link: '',
      status: 'entered',
      targetWeight: '',
      targetUnit: 'lb',
    },
    12,
  );
  const raw = JSON.parse(exportProgressPacket(report)) as {
    competition: { tournaments: { name: string; division: string; weightClass?: string }[] };
  };
  for (const tournament of raw.competition.tournaments) {
    if (tournament.name === 'Legacy Open') tournament.division = 'Adult Blue / Feather';
    if (tournament.name === 'Plain Open') tournament.division = 'Adult Blue Middle';
    delete tournament.weightClass;
  }
  return JSON.stringify(raw);
}

async function openForm(page: Page) {
  await page.goto(FORM);
  await expect(page.getByRole('heading', { name: 'Competitor' })).toBeVisible();
  await expect(page.getByLabel('Division and weight class')).toHaveCount(0);
}

test('division and weight class are separate searchable fields', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await openForm(page);

  const location = page.getByLabel('Tournament location');
  const division = page.getByLabel('Division', { exact: true });
  const weight = page.getByLabel('Weight class', { exact: true });
  const deadline = page.getByLabel('Registration deadline');
  await expect(location).toBeVisible();
  await expect(division).toBeVisible();
  await expect(weight).toBeVisible();
  const boxes = await Promise.all([location, division, weight, deadline].map((field) => field.boundingBox()));
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index]!.y).toBeGreaterThan(boxes[index - 1]!.y);
  }

  await division.scrollIntoViewIfNeeded();
  await division.click();
  await expect(page.getByRole('listbox', { name: 'Division suggestions' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Adult', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Master 1', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'No-Gi', exact: true })).toBeVisible();
  await division.fill('mast');
  await expect(page.getByRole('option', { name: 'Master 1', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Adult', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'Master 1', exact: true }).click();
  await expect(division).toHaveValue('Master 1');

  await division.fill('Adult Blue');
  await expect(division).toHaveValue('Adult Blue');

  await weight.click();
  await expect(page.getByRole('option', { name: 'Rooster', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Light Feather', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Open Class', exact: true })).toBeVisible();
  await weight.fill('ultra');
  await expect(page.getByRole('option', { name: 'Ultra Heavy', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Heavy', exact: true })).toHaveCount(0);
  await page.screenshot({ path: '/opt/cursor/artifacts/division-weight-suggestions-390.png' });
  await page.getByRole('option', { name: 'Ultra Heavy', exact: true }).click();
  await expect(weight).toHaveValue('Ultra Heavy');
  await weight.fill('Feather');
  await expect(weight).toHaveValue('Feather');
  await page.getByLabel('Tournament name').click();
  await division.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: '/opt/cursor/artifacts/division-weight-form-390.png' });

  const today = await page.evaluate(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  });
  await page.getByLabel('Tournament name').fill('Spring Open');
  await page.getByLabel('Tournament date').fill(today);
  await page.getByLabel('Tournament location').fill('Atlanta');
  await page.getByRole('button', { name: 'Add tournament', exact: true }).click();
  await expect(page.getByText('Considering · Spring Open')).toBeVisible();
  await expect(page.getByText('Adult Blue · Feather')).toBeVisible();

  const search = page.getByLabel('Search competition');
  await search.fill('Feather');
  await expect(page.getByText('Considering · Spring Open')).toBeVisible();
  await search.fill('Adult Blue');
  await expect(page.getByText('Considering · Spring Open')).toBeVisible();
  await search.fill('Rooster');
  await expect(page.getByText('Considering · Spring Open')).toHaveCount(0);
  await expect(page.getByText('No tournaments yet.')).toBeVisible();
  await search.fill('');

  await division.click();
  await division.fill('blue');
  await expect(page.getByRole('option', { name: 'Adult Blue', exact: true })).toBeVisible();
  await page.getByRole('option', { name: 'Adult Blue', exact: true }).click();
  await weight.click();
  await weight.fill('My class');
  await page.getByLabel('Tournament name').fill('House Open');
  await page.getByLabel('Tournament date').fill(today);
  await page.getByRole('button', { name: 'Add tournament', exact: true }).click();
  await expect(page.getByText('Adult Blue · My class')).toBeVisible();
  await search.fill('My class');
  await expect(page.getByText('Considering · House Open')).toBeVisible();
  await expect(page.getByText('Considering · Spring Open')).toHaveCount(0);
  await search.fill('Feather');
  await expect(page.getByText('Considering · Spring Open')).toBeVisible();
  await expect(page.getByText('Considering · House Open')).toHaveCount(0);

  const saved = await page.evaluate((key) => localStorage.getItem(key) ?? '', STUDENT_EDITION_STORAGE_KEY);
  expect(saved).toContain('"weightClass":"Feather"');
  expect(saved).toContain('"weightClass":"My class"');
  expect(saved).toContain('"division":"Adult Blue"');
  await context.close();
});

test('an older combined division migrates without dropping the words', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: STUDENT_EDITION_STORAGE_KEY, value: legacyProgress() },
  );
  await openForm(page);
  await expect(page.getByText('Considering · Legacy Open')).toBeVisible();
  await expect(page.getByText('Entered · Plain Open')).toBeVisible();
  await expect(page.getByText('Adult Blue · Feather')).toBeVisible();
  await expect(page.getByText('Adult Blue Middle')).toBeVisible();

  const search = page.getByLabel('Search competition');
  await search.fill('Feather');
  await expect(page.getByText('Considering · Legacy Open')).toBeVisible();
  await expect(page.getByText('Entered · Plain Open')).toHaveCount(0);
  await search.fill('Middle');
  await expect(page.getByText('Entered · Plain Open')).toBeVisible();
  await expect(page.getByText('Considering · Legacy Open')).toHaveCount(0);
  await search.fill('Adult');
  await expect(page.getByText('Considering · Legacy Open')).toBeVisible();
  await expect(page.getByText('Entered · Plain Open')).toBeVisible();
  await search.fill('');

  await page.getByRole('button', { name: 'Edit Legacy Open' }).click();
  await expect(page.getByLabel('Division', { exact: true })).toHaveValue('Adult Blue');
  await expect(page.getByLabel('Weight class', { exact: true })).toHaveValue('Feather');
  await page.getByRole('button', { name: 'Save tournament', exact: true }).click();

  await page.getByRole('button', { name: 'Edit Plain Open' }).click();
  await expect(page.getByLabel('Division', { exact: true })).toHaveValue('Adult Blue Middle');
  await expect(page.getByLabel('Weight class', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Cancel tournament edit', exact: true }).click();

  const saved = await page.evaluate((key) => localStorage.getItem(key) ?? '', STUDENT_EDITION_STORAGE_KEY);
  expect(saved).toContain('"division":"Adult Blue"');
  expect(saved).toContain('"weightClass":"Feather"');
  expect(saved).toContain('"division":"Adult Blue Middle"');
  expect(saved).not.toContain('Adult Blue / Feather');
  await context.close();
});
