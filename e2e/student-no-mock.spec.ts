import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { exportProgressPacket } from '../src/lib/progress/format.ts';
import { addTournament } from '../src/lib/studentCompetition.ts';
import { blankStudentReport, STUDENT_EDITION_STORAGE_KEY } from '../src/lib/studentEdition.ts';
import { setRankBelt } from '../src/lib/studentRank.ts';

const handoff = readFileSync(new URL('../src/lib/fixtures/send-to-coach-handoff.json', import.meta.url), 'utf8');

function realJournal(): string {
  const report = setRankBelt(
    addTournament(
      blankStudentReport(1),
      {
        name: 'Spring Open',
        date: '2026-11-02',
        location: 'Atlanta',
        division: 'Adult Blue',
        weightClass: 'Feather',
        deadline: '',
        link: '',
        status: 'entered',
        targetWeight: '',
        targetUnit: 'lb',
      },
      2,
    ),
    'blue',
    3,
  );
  return exportProgressPacket(report);
}

async function shot(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: true });
}

async function expectNoMock(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text.toLowerCase()).not.toContain('mock');
  expect(text).not.toContain('Pan Pacific');
  expect(text).not.toContain('4.6 lb');
  expect(text).not.toContain('Black · 3 stripes');
}

async function plantMock(page: Page) {
  return page.evaluate(
    ([key, payload]) => {
      localStorage.setItem(key, payload);
      return localStorage.getItem(key);
    },
    [STUDENT_EDITION_STORAGE_KEY, handoff] as const,
  );
}

test('a fresh Student Edition stays White with an empty journal past the old flicker', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?student=1');
  await page.getByRole('link', { name: 'Open Student Edition', exact: true }).click();
  await expect(page).toHaveURL(/\/student\?student=1$/);
  await expect(page.getByText('White · 0 stripes')).toBeVisible();
  await expect(page.getByText('No event yet')).toBeVisible();
  await expect(page.getByText('No matches yet')).toBeVisible();

  await page.waitForTimeout(8_000);
  await expect(page.getByText('White · 0 stripes')).toBeVisible();
  await expect(page.getByText('No event yet')).toBeVisible();
  await expect(page.getByText('No matches yet')).toBeVisible();
  await expectNoMock(page);

  expect(await plantMock(page)).toBeNull();
  await page.waitForTimeout(1_000);
  await expect(page.getByText('White · 0 stripes')).toBeVisible();
  await expectNoMock(page);
  await page.reload();
  await expect(page.getByText('White · 0 stripes')).toBeVisible();
  await expect(page.getByText('No event yet')).toBeVisible();
  await expectNoMock(page);
  await shot(page, 'student_hub_fresh_390');

  await page.goto('/student/progress?student=1');
  await expect(page.getByRole('heading', { name: 'Rank & Progress', exact: true })).toBeVisible();
  await expect(page.getByText('White belt · 0 stripes')).toBeVisible();
  await expectNoMock(page);
  await shot(page, 'student_rank_progress_fresh_390');

  await page.goto('/student/rank?student=1');
  await expect(page.getByRole('heading', { name: 'My rank', exact: true })).toBeVisible();
  await expect(page.getByText('No stripes', { exact: false })).toBeVisible();
  await expect(page.getByText('No earlier belts yet.')).toBeVisible();
  await expect(page.getByText('No instructors yet.')).toBeVisible();
  await expectNoMock(page);
  await shot(page, 'student_rank_fresh_390');

  await page.goto('/student/competitor?student=1');
  await expect(page.getByRole('heading', { name: 'Competitor', exact: true })).toBeVisible();
  await expect(page.getByText('No tournaments yet.')).toBeVisible();
  await expectNoMock(page);
  await shot(page, 'student_competitor_fresh_390');

  await page.goto('/student/calendar?student=1');
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  await expectNoMock(page);
  await shot(page, 'student_calendar_fresh_390');
  await page.goto('/student/calendar/2026-10-24?student=1');
  await expect(page.getByText('No journal card on this day.')).toBeVisible();
  await expectNoMock(page);

  await page.goto('/student/results?student=1');
  await expect(page.getByRole('heading', { name: 'Results', exact: true })).toBeVisible();
  await expect(page.getByText('No results yet.')).toBeVisible();
  await expectNoMock(page);
  await shot(page, 'student_results_fresh_390');

  await page.goto('/student/scouting?student=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Opponent scouting', exact: true })).toBeVisible();
  await expect(page.getByText('No opponents in this class yet.').first()).toBeVisible();
  await expectNoMock(page);
  await shot(page, 'student_scouting_fresh_390');

  await page.goto('/student/weight?student=1');
  await expect(page.getByRole('heading', { name: 'Weight', exact: true })).toBeVisible();
  await expect(page.getByText('No weigh-ins yet.')).toBeVisible();
  await expectNoMock(page);
  await shot(page, 'student_weight_fresh_390');

  await page.goto('/student/print/progress?student=1');
  await expect(page.getByRole('heading', { name: 'Progress report' }).first()).toBeVisible();
  await expect(page.getByText('Stripes: 0')).toBeVisible();
  await expect(page.getByText('No tournaments recorded.')).toBeVisible();
  await expect(page.getByText('No journal cards.')).toBeVisible();
  await expectNoMock(page);
  await shot(page, 'student_print_progress_fresh_390');

  await page.goto('/student/print/assessment?student=1');
  await expect(page.getByRole('heading', { name: 'Self-assessment' }).first()).toBeVisible();
  await expect(page.getByText('No self-assessment saved on this phone.')).toBeVisible();
  await expectNoMock(page);
  await shot(page, 'student_print_assessment_fresh_390');
});

test('a journal already on the phone still loads, and the stress-test file does not replace it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const packet = realJournal();
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [STUDENT_EDITION_STORAGE_KEY, packet] as const,
  );
  await page.goto('/student?student=1');
  await expect(page.getByText('Blue · 0 stripes')).toBeVisible();
  await expect(page.getByText(/Spring Open/)).toBeVisible();
  await expectNoMock(page);
  expect(await plantMock(page)).toContain('Spring Open');
  await page.reload();
  await expect(page.getByText('Blue · 0 stripes')).toBeVisible();
  await expect(page.getByText(/Spring Open/)).toBeVisible();
  await expectNoMock(page);
  await shot(page, 'student_hub_saved_390');
});

test('an explicit demo flag can keep the stress-test file, and it does not replace a real journal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student?student=1&demo=paige');
  await expect(page.getByText('White · 0 stripes')).toBeVisible();
  await expectNoMock(page);
  const planted = await plantMock(page);
  expect(planted).toContain('Pan Pacific Championship (mock)');
  await page.reload();
  await expect(page.getByText('Black · 3 stripes')).toBeVisible();
  await expect(page.getByText(/Pan Pacific Championship \(mock\)/)).toBeVisible();

  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [STUDENT_EDITION_STORAGE_KEY, realJournal()] as const,
  );
  await page.goto('/student?student=1&demo=1');
  await expect(page.getByText('Blue · 0 stripes')).toBeVisible();
  await expect(page.getByText(/Spring Open/)).toBeVisible();
  await expect(page.getByText(/Pan Pacific/)).toHaveCount(0);
});
