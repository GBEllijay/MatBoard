import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const BACK = 'Back. Hold for Home.';
const NOTES_KEY = 'matboard.coach.trainingNotes.v1';
const COVER_KEY = 'matboard.lessonScreenCover.v1';
const GYM_LOGO_KEY = 'matboard.gymLogo.v1';
const SCHEDULE_KEY = 'matboard.schedule.v1';
const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function dateKey(delta = 0): string {
  const today = new Date();
  today.setDate(today.getDate() + delta);
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function scheduleBoard(template: 'week' | 'monthly') {
  const row = (id: string, day: string, time: string, title: string, location: string, subtitle = '') => ({
    id,
    kind: 'class',
    day,
    time,
    title,
    location,
    subtitle,
  });
  return {
    version: 1,
    title: 'Sample Academy',
    qrUrl: '',
    notes: 'No-gi night is on the far mat.',
    template,
    castEnabled: true,
    classes: [
      row('c1', 'mon', '18:00', 'Fundamentals', 'MAT 1', 'All Levels'),
      row('c2', 'wed', '18:00', 'Advanced', 'MAT 2'),
      row('c3', 'fri', '17:00', 'Kids', 'MAT 1', '5-10 Years Old'),
    ],
    specials: [],
  };
}

async function seed(
  page: Page,
  options: { template?: 'week' | 'monthly'; gymLogo?: string; cover?: string } = {},
) {
  const today = dateKey(0);
  await page.addInitScript(
    ({ todayKey, notesKey, scheduleKey, board, gymKey, gymLogo, coverKey, cover }) => {
      localStorage.setItem('advantage.whiteUnlocked', '1');
      localStorage.setItem('advantage.coachUnlocked', '1');
      localStorage.setItem('advantage.proUnlocked', '1');
      localStorage.setItem(
        notesKey,
        JSON.stringify({
          version: 3,
          days: {
            [todayKey]: {
              plans: [
                {
                  version: 1,
                  id: 'plan-saved',
                  coachName: 'Alex',
                  classDesignation: 'GB1',
                  lessonTitle: 'Passing',
                  classTime: '6:00 PM',
                  intro: 'Closed guard armbar.',
                  introExpected: '',
                  warmupNote: 'Shrimps',
                  warmupExpected: '',
                  techniques: [1, 2, 3].map((n) => ({
                    id: `tech-${n}`,
                    slotId: `slot-${n}`,
                    title: n === 1 ? 'Knee cut' : '',
                    notes: '',
                    expected: '',
                    waterBreak: false,
                  })),
                  specificNote: '',
                  specificExpected: '',
                  cooldownNote: '',
                  cooldownExpected: '',
                  closing: 'Bow.',
                },
              ],
            },
          },
        }),
      );
      localStorage.setItem(scheduleKey, JSON.stringify(board));
      if (gymLogo) localStorage.setItem(gymKey, JSON.stringify({ version: 1, dataUrl: gymLogo }));
      if (cover) localStorage.setItem(coverKey, cover);
    },
    {
      todayKey: today,
      notesKey: NOTES_KEY,
      scheduleKey: SCHEDULE_KEY,
      board: scheduleBoard(options.template ?? 'week'),
      gymKey: GYM_LOGO_KEY,
      gymLogo: options.gymLogo ?? '',
      coverKey: COVER_KEY,
      cover: options.cover ?? '',
    },
  );
}

async function openLesson(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide screen', exact: true })).toBeVisible();
}

async function showPlan(page: Page) {
  await page.getByRole('button', { name: 'Show screen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Screen hidden' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan' })).toBeVisible();
}

test('hide screen covers a saved lesson with Logo, Schedule, and Black', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page);
  await openLesson(page, '/notes?from=coach');

  const saved = await page.evaluate((key) => localStorage.getItem(key), NOTES_KEY);
  expect(saved).toContain('Closed guard armbar.');
  await expect(page.locator('#notes-intro')).toHaveValue('Closed guard armbar.');
  await expect(page.getByRole('radio', { name: 'Logo', exact: true })).toHaveAttribute('aria-checked', 'true');
  const logoOn = await page.getByRole('radio', { name: 'Logo', exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);
  const hideFill = await page.getByRole('button', { name: 'Hide screen', exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(logoOn).toBe('rgb(0, 78, 186)');
  expect(hideFill).toBe('rgb(255, 255, 255)');

  await page.getByRole('radio', { name: 'Logo', exact: true }).click();
  const cover = page.getByRole('dialog', { name: 'Screen hidden' });
  await expect(cover).toBeVisible();
  await expect(cover).toHaveAttribute('data-cover-mode', 'logo');
  await expect(page.getByRole('img', { name: 'Advantage', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan' })).toBeHidden();
  await expect(page.locator('#notes-intro')).toBeHidden();
  await showPlan(page);

  await page.getByRole('radio', { name: 'Schedule', exact: true }).click();
  await expect(cover).toHaveAttribute('data-cover-mode', 'schedule');
  await expect(page.getByRole('region', { name: 'Weekly class schedule' })).toBeVisible();
  await expect(page.getByText('Fundamentals')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan' })).toBeHidden();
  await expect(page.locator('#notes-intro')).toBeHidden();
  await showPlan(page);

  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  await expect(cover).toHaveAttribute('data-cover-mode', 'black');
  await expect(page.locator('.notes-cover--black img')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Weekly class schedule' })).toHaveCount(0);
  const black = await page.locator('.notes-cover--black').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(black).toBe('rgb(0, 0, 0)');
  await expect(page.locator('#notes-intro')).toBeHidden();
  await showPlan(page);

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Black', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('dialog', { name: 'Screen hidden' })).toHaveCount(0);
  await expect(page.locator('#notes-intro')).toHaveValue('Closed guard armbar.');
  await page.getByRole('button', { name: 'Hide screen', exact: true }).click();
  await expect(cover).toHaveAttribute('data-cover-mode', 'black');
  await showPlan(page);

  const after = await page.evaluate((key) => localStorage.getItem(key), NOTES_KEY);
  expect(after).toBe(saved);
  const choice = await page.evaluate((key) => localStorage.getItem(key), COVER_KEY);
  expect(choice).toContain('"mode":"black"');
});

test('Coach Unlimited and Pro lesson plans use the same hide screen', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page);

  await openLesson(page, '/notes?plan=unlimited');
  await page.getByRole('button', { name: 'Hide screen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Screen hidden' })).toHaveAttribute('data-cover-mode', 'logo');
  await showPlan(page);
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect(page).toHaveURL(/\/coach-unlimited$/);

  await page.goto('/pro');
  await page.getByRole('link', { name: 'Advantage Coach Unlimited', exact: true }).click();
  await page.getByRole('link', { name: 'Daily Lesson Plan', exact: true }).click();
  await openLesson(page, page.url());
  await expect(page).toHaveURL(/plan=unlimited/);
  await page.getByRole('radio', { name: 'Schedule', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Weekly class schedule' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan' })).toBeHidden();
  await showPlan(page);
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
});

test('a saved gym logo replaces the Advantage mark, and Month uses the month board', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page, { gymLogo: TINY_PNG, template: 'monthly' });
  await openLesson(page, '/notes?from=coach');
  await page.getByRole('radio', { name: 'Logo', exact: true }).click();
  const logo = page.getByRole('img', { name: 'Gym logo', exact: true });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', TINY_PNG);
  await showPlan(page);
  await page.getByRole('radio', { name: 'Schedule', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Monthly class schedule' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Weekly class schedule' })).toHaveCount(0);
  await expect(page.locator('#notes-intro')).toBeHidden();
  await showPlan(page);
});

test('lesson editor, technique slots, video return, drill timer, and back still work', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seed(page);
  await openLesson(page, '/notes?from=coach');
  const day = new URL(page.url()).searchParams.get('date');

  const intro = page.locator('#notes-intro');
  await intro.fill('Armbar details for today.');
  await expect(intro).toHaveValue('Armbar details for today.');
  const title = page.locator('#notes-tech-tech-1');
  await title.fill('Knee slice');
  await expect(title).toHaveValue('Knee slice');
  const water = page.getByRole('switch', { name: 'Water break after Technique / Drill 1' });
  await water.click();
  await expect(water).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Add technique', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Technique / Drill 4' })).toBeVisible();

  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  await expect(intro).toBeHidden();
  await showPlan(page);
  await expect(intro).toHaveValue('Armbar details for today.');
  await expect(title).toHaveValue('Knee slice');

  await page.getByRole('button', { name: 'Open Daily Training Videos for Warm-up' }).click();
  await expect(page.getByRole('heading', { name: 'Daily Training Videos' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  const timer = page.getByRole('radiogroup', { name: 'Loop timer for Technique / Drill 1' });
  await timer.getByRole('radio', { name: '2:30', exact: true }).click();
  await expect(timer.getByRole('radio', { name: '2:30', exact: true })).toHaveAttribute('aria-checked', 'true');
  await timer.getByRole('radio', { name: '5:00', exact: true }).click();
  await expect(timer.getByRole('radio', { name: '5:00', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Daily Lesson Plan' })).toBeVisible();
  const returned = new URL(page.url());
  expect(returned.pathname).toBe('/notes');
  expect(returned.searchParams.get('from')).toBe('coach');
  expect(returned.searchParams.get('date')).toBe(day ?? dateKey(0));
  await expect(page.locator('#notes-intro')).toHaveValue('Armbar details for today.');

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect(page).toHaveURL(/\/coach$/);
  await expect(page.getByRole('link', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
});

test('phone and TV screenshots of the hide screen covers', async ({ page }) => {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await page.setViewportSize(PHONE);
  await seed(page);
  await openLesson(page, '/notes?from=coach');
  await page.screenshot({ path: '/opt/cursor/artifacts/hide-screen-toggle-390.png' });

  await page.getByRole('radio', { name: 'Logo', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Advantage', exact: true })).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/hide-screen-logo-390.png' });
  await showPlan(page);

  await page.getByRole('radio', { name: 'Schedule', exact: true }).click();
  await expect(page.getByText('Fundamentals')).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/hide-screen-schedule-390.png' });
  await showPlan(page);

  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  await expect(page.locator('.notes-cover--black')).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/hide-screen-black-390.png' });
  await showPlan(page);

  await page.setViewportSize(TV);
  await page.getByRole('radio', { name: 'Schedule', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Weekly class schedule' })).toBeVisible();
  await expect(page.getByText('Fundamentals')).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/hide-screen-schedule-1920.png' });
});
