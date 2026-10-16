import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

const SCHEDULE_KEY = 'matboard.schedule.v1';
const PHONE = { width: 390, height: 844 };
const WHEN = new Date(2026, 9, 15, 15, 0, 0);

mkdirSync('/opt/cursor/artifacts', { recursive: true });

type SpecialSeed = {
  id: string;
  date: string;
  title: string;
};

function board(template: 'week' | 'monthly' | 'weekly-list', specials: SpecialSeed[], notes = '') {
  const row = (
    id: string,
    day: string,
    time: string,
    title: string,
    location: string,
    level: string,
  ) => ({
    id,
    kind: 'class',
    day,
    time,
    title,
    location,
    subtitle: '',
    level,
  });
  return {
    version: 1,
    title: 'Sample Academy',
    qrUrl: '',
    notes,
    template,
    castEnabled: true,
    classes: [
      row('c1', 'mon', '18:00', 'Fundamentals', 'MAT 1', 'fundamentals'),
      row('c2', 'wed', '18:00', 'Advanced', 'MAT 2', 'advanced'),
      row('c3', 'fri', '17:00', 'Kids', 'MAT 1', 'kids'),
    ],
    specials: specials.map((item) => ({
      id: item.id,
      kind: 'special',
      date: item.date,
      title: item.title,
      body: '',
      flyerId: null,
    })),
  };
}

async function seed(page: Page, template: 'week' | 'monthly' | 'weekly-list', specials: SpecialSeed[], notes = '') {
  const saved = board(template, specials, notes);
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem('advantage.proUnlocked', '1');
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SCHEDULE_KEY, value: saved },
  );
}

async function openSchedule(page: Page) {
  await page.setViewportSize(PHONE);
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { name: 'Class Schedule' })).toBeVisible();
}

/** Stop the fake clock before the 3s dwell fires, so later jumps are one step each. */
async function pauseSoon(page: Page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 400);
}

async function expectActive(slide: Locator) {
  await expect(slide).toHaveClass(/is-on/);
  await expect(slide).not.toHaveAttribute('aria-hidden', 'true');
}

async function expectInactive(slide: Locator) {
  await expect(slide).not.toHaveClass(/is-on/);
  await expect(slide).toHaveAttribute('aria-hidden', 'true');
}

function strip(page: Page) {
  return page.locator('.week-cast__notes');
}

async function expectWithinStripHeight(locator: Locator) {
  const ok = await locator.evaluate((el) => {
    const max = Number.parseFloat(getComputedStyle(el).maxHeight);
    return Number.isFinite(max) && el.getBoundingClientRect().height <= max + 1;
  });
  expect(ok).toBe(true);
}

test('two special events this month alternate every 3 seconds', async ({ page }) => {
  await page.clock.install({ time: WHEN });
  await seed(page, 'monthly', [
    { id: 'seminar', date: '2026-10-10', title: 'Seminar' },
    { id: 'promotion', date: '2026-10-24', title: 'Promotion' },
  ]);
  await openSchedule(page);
  await pauseSoon(page);

  const bar = strip(page);
  const seminar = bar.locator('[data-special-slide="seminar"]');
  const promotion = bar.locator('[data-special-slide="promotion"]');
  await expect(bar).toHaveAttribute('data-rotator', 'live');
  await expectActive(seminar);
  await expectInactive(promotion);
  await expect(page.locator('.month-cast__special', { hasText: 'Seminar' })).toBeVisible();
  await expect(page.locator('.month-cast__special', { hasText: 'Promotion' })).toBeVisible();
  await expect(page.locator('.month-cast__chip[data-level="fundamentals"]').first()).toBeVisible();
  await expectWithinStripHeight(bar);
  await page.screenshot({ path: '/opt/cursor/artifacts/special-events-phone-seminar.png', fullPage: false });

  await page.clock.fastForward(3000);
  await expectActive(promotion);
  await expectInactive(seminar);
  await expect(bar.getByRole('button', { name: /Promotion/ })).toHaveAttribute('aria-current', 'true');
  await page.screenshot({ path: '/opt/cursor/artifacts/special-events-phone-promotion.png', fullPage: false });

  await page.clock.fastForward(3000);
  await expectActive(seminar);
  await expectInactive(promotion);

  await bar.hover();
  await page.clock.fastForward(3000);
  await expectActive(seminar);
  await page.mouse.move(4, 4);
  await page.clock.fastForward(3000);
  await expectActive(promotion);

  await bar.getByRole('button', { name: /Seminar/ }).click();
  await expectActive(seminar);
  await expect(bar.getByRole('button', { name: /Seminar/ })).toHaveAttribute('aria-current', 'true');
  await page.clock.fastForward(3000);
  await expectActive(seminar);

  const viewport = bar.locator('.special-rotator__viewport');
  const box = await viewport.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width * 0.82, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 6, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expectActive(promotion);

  await page.goto('/slideshow');
  await pauseSoon(page);
  await expect(page.getByRole('region', { name: 'Monthly class schedule' })).toBeVisible();
  const cast = page.locator('.week-cast--cast .week-cast__notes');
  await expect(cast).toHaveAttribute('data-rotator', 'live');
  await expectActive(cast.locator('[data-special-slide="seminar"]'));
  await expectWithinStripHeight(cast);
  await expectDotsClearOfOptions(page);
  await page.screenshot({ path: '/opt/cursor/artifacts/special-events-phone-cast.png', fullPage: false });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expectDotsClearOfOptions(page);
  await page.screenshot({ path: '/opt/cursor/artifacts/special-events-tv-cast.png', fullPage: false });
  await restoreWindow(page);
  await page.setViewportSize(PHONE);

  await page.goto('/schedule');
  await pauseSoon(page);
  await page.getByRole('radio', { name: 'Week' }).click();
  await expect(page.getByRole('region', { name: 'Weekly class schedule' })).toBeVisible();
  await expect(strip(page)).toHaveAttribute('data-rotator', 'live');
  const legend = page.locator('.week-cast__legend');
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('Fundamentals');
  await expect(legend).toContainText('Advanced');
  await expect(legend).toContainText('Kids');
  await page.screenshot({ path: '/opt/cursor/artifacts/special-events-phone-week.png', fullPage: false });

  await page.getByRole('radio', { name: 'Phone list' }).click();
  const list = page.locator('.schedule__notes');
  await expect(list).toHaveAttribute('data-rotator', 'live');
  await expect(list.getByText('Notices', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/special-events-phone-list.png', fullPage: false });
});

async function restoreWindow(page: Page) {
  const session = await page.context().newCDPSession(page);
  const { windowId } = await session.send('Browser.getWindowForTarget');
  await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
}

async function expectDotsClearOfOptions(page: Page) {
  const dots = page.locator('.week-cast--cast .special-rotator__dots');
  const options = page.locator('.week-cast__options');
  await expect(dots).toBeVisible();
  const dotsBox = await dots.boundingBox();
  const optionsBox = await options.boundingBox();
  expect(dotsBox).toBeTruthy();
  expect(optionsBox).toBeTruthy();
  const overlap =
    dotsBox!.x < optionsBox!.x + optionsBox!.width &&
    dotsBox!.x + dotsBox!.width > optionsBox!.x &&
    dotsBox!.y < optionsBox!.y + optionsBox!.height &&
    dotsBox!.y + dotsBox!.height > optionsBox!.y;
  expect(overlap).toBe(false);
}

test('one special event stays static', async ({ page }) => {
  await page.clock.install({ time: WHEN });
  await seed(
    page,
    'monthly',
    [
      { id: 'seminar', date: '2026-10-10', title: 'Seminar' },
      { id: 'later', date: '2026-11-20', title: 'Holiday party' },
    ],
    'No-gi night is on the far mat.',
  );
  await openSchedule(page);

  const bar = strip(page);
  await expect(bar).toHaveAttribute('data-rotator', 'static');
  await expect(bar.locator('[data-special-slide="seminar"]')).toBeVisible();
  await expect(bar.locator('[data-special-slide="seminar"]')).toContainText('Seminar');
  await expect(bar).toContainText('No-gi night is on the far mat.');
  await expect(bar.getByText('Holiday party')).toHaveCount(0);
  await expect(bar.locator('.special-rotator__dot')).toHaveCount(0);
  await expectWithinStripHeight(bar);
  await page.clock.fastForward(9000);
  await expect(bar).toHaveAttribute('data-rotator', 'static');
  await expect(bar.locator('[data-special-slide="seminar"]')).toBeVisible();
  await expect(bar).toContainText('No-gi night is on the far mat.');
  await page.screenshot({ path: '/opt/cursor/artifacts/special-events-phone-static.png', fullPage: false });

  await page.getByRole('radio', { name: 'Week' }).click();
  await expect(strip(page)).toHaveAttribute('data-rotator', 'static');
  await expect(strip(page)).toContainText('Seminar');
  await page.getByRole('radio', { name: 'Phone list' }).click();
  const list = page.locator('.schedule__notes');
  await expect(list).toHaveAttribute('data-rotator', 'static');
  await expect(list).toContainText('Seminar');
  await expect(list).toContainText('No-gi night is on the far mat.');
  await expect(list.getByText('Holiday party')).toHaveCount(0);
  await expect(list.locator('.special-rotator__dot')).toHaveCount(0);
});

test('no special events keeps the notices placeholder', async ({ page }) => {
  await seed(page, 'weekly-list', []);
  await openSchedule(page);
  const list = page.locator('.schedule__notes');
  await expect(list).toHaveAttribute('aria-label', 'Notices');
  await expect(list).toContainText('Holiday closings, schedule changes, and special events go here.');
  await expect(list.locator('.special-rotator')).toHaveCount(0);
  await expect(list).not.toHaveAttribute('data-rotator', 'live');
});

test('reduced motion switches special events manually', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: WHEN });
  await seed(page, 'monthly', [
    { id: 'seminar', date: '2026-10-10', title: 'Seminar' },
    { id: 'promotion', date: '2026-10-24', title: 'Promotion' },
  ]);
  await openSchedule(page);
  await pauseSoon(page);
  const bar = strip(page);
  const seminar = bar.locator('[data-special-slide="seminar"]');
  const promotion = bar.locator('[data-special-slide="promotion"]');
  await expect(bar).toHaveAttribute('data-rotator', 'manual');
  await expectActive(seminar);
  await page.clock.fastForward(6000);
  await expectActive(seminar);
  await expectInactive(promotion);
  await bar.getByRole('button', { name: /Promotion/ }).click();
  await expectActive(promotion);
  await expectInactive(seminar);
  await expectWithinStripHeight(bar);
});
