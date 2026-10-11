import { expect, test, type Page } from '@playwright/test';

const BACK = 'Back. Hold for Home.';
const DESKTOP = { width: 1280, height: 690 };
const PHONE = { width: 390, height: 844 };

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
  });
}

function pathOf(page: Page) {
  const url = new URL(page.url());
  return url.pathname + url.search;
}

async function openLink(page: Page, name: string | RegExp, exact = true) {
  const link =
    typeof name === 'string'
      ? page.getByRole('link', { name, exact })
      : page.getByRole('link', { name });
  await link.click();
}

async function assertBackAndHome(page: Page, backPath: string) {
  const back = page.getByRole('link', { name: BACK, exact: true });
  const home = page.getByRole('link', { name: 'Home', exact: true });
  await expect(back).toHaveAttribute('href', backPath);
  await expect(home).toHaveAttribute('href', '/');
  await back.click();
  await expect.poll(() => pathOf(page)).toBe(backPath);
}

async function assertHomeFrom(page: Page, reopen: () => Promise<void>) {
  await reopen();
  const home = page.getByRole('link', { name: 'Home', exact: true });
  await expect(home).toHaveAttribute('href', '/');
  const covered = await home.evaluate((el) => getComputedStyle(el).pointerEvents === 'none');
  if (covered) await page.setViewportSize(PHONE);
  await home.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  if (covered) await page.setViewportSize(DESKTOP);
}

test('tier homes use the center logo for home and have no corner back', async ({ page }) => {
  await unlock(page);
  for (const path of ['/white', '/coach', '/pro']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveCount(0);
    const home = page.getByRole('link', { name: 'Home', exact: true });
    await expect(home).toHaveAttribute('href', '/');
    await home.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  }
});

test('Coach hub tools go back to Coach and home to the tier picker', async ({ page }) => {
  await unlock(page);
  const coachTools = [
    'Daily Lesson Plan',
    'Daily Training Videos',
    'Technique Tree',
    'Student Roster',
    'Mock Tournament',
  ] as const;
  for (const name of coachTools) {
    await page.goto('/coach');
    await openLink(page, name);
    await assertBackAndHome(page, '/coach');
    await assertHomeFrom(page, async () => {
      await page.goto('/coach');
      await openLink(page, name);
    });
  }
});

test('White Match names goes back to White and home to the tier picker', async ({ page }) => {
  await unlock(page);
  await page.goto('/white');
  await openLink(page, 'Match names');
  await assertBackAndHome(page, '/white');
  await assertHomeFrom(page, async () => {
    await page.goto('/white');
    await openLink(page, 'Match names');
  });
});

test('Coach Unlimited tools go back to Coach Unlimited and home to the tier picker', async ({ page }) => {
  await unlock(page);
  const unlimitedTools = [
    'Daily Lesson Plan',
    'Daily Training Videos',
    'Technique Tree',
    'Competitor Roster',
    'Competition Class Curriculum',
  ] as const;
  for (const name of unlimitedTools) {
    await page.goto('/coach-unlimited');
    await openLink(page, name);
    await assertBackAndHome(page, '/coach-unlimited');
    await assertHomeFrom(page, async () => {
      await page.goto('/coach-unlimited');
      await openLink(page, name);
    });
  }
});

test('Pro menus go back to Pro and home to the tier picker', async ({ page }) => {
  await unlock(page);
  const proMenus = [
    'Advantage Coach Unlimited',
    'Instructor Invitation and Access Management',
    'Tournament Management Pro',
    'Media Console',
  ] as const;
  for (const name of proMenus) {
    await page.goto('/pro');
    await openLink(page, name);
    await assertBackAndHome(page, '/pro');
    await assertHomeFrom(page, async () => {
      await page.goto('/pro');
      await openLink(page, name);
    });
  }
});

test('Class Schedule goes back to Media Console; the center home stays off the TV board', async ({ page }) => {
  await unlock(page);
  await page.goto('/pro');
  await openLink(page, 'Media Console');
  await page.locator('summary').filter({ hasText: 'Class Schedule' }).click();
  await openLink(page, 'Add class schedule');

  const back = page.getByRole('link', { name: BACK, exact: true });
  const home = page.getByRole('link', { name: 'Home', exact: true });
  await expect(back).toHaveAttribute('href', '/slideshow?folder=gallery');
  await expect(home).toHaveAttribute('href', '/');
  await expect(home).toHaveCSS('pointer-events', 'none');
  await back.click();
  await expect.poll(() => pathOf(page)).toBe('/slideshow?folder=gallery');

  await page.setViewportSize(PHONE);
  await page.goto('/schedule');
  await expect(home).toHaveCSS('pointer-events', 'auto');
  await home.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
});

test('Tournament Management Pro and CMS tiles go back one level and home to the tier picker', async ({ page }) => {
  await unlock(page);

  await page.goto('/suite');
  await openLink(page, 'Brackets-Tournament Software');
  await assertBackAndHome(page, '/suite');
  await assertHomeFrom(page, async () => {
    await page.goto('/suite');
    await openLink(page, 'Brackets-Tournament Software');
  });

  await page.goto('/suite');
  await openLink(page, 'Competitor Management System');
  await assertBackAndHome(page, '/suite');
  await assertHomeFrom(page, async () => {
    await page.goto('/suite');
    await openLink(page, 'Competitor Management System');
  });

  await page.goto('/suite');
  await openLink(page, 'Scoreboard');
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/suite');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/suite');

  await page.goto('/suite');
  await openLink(page, 'Round Timer');
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/suite');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/suite');

  const cmsTools = ['Competitor Roster', 'Competition Ready', 'Competitor Game Plan', 'Rankings / Results'] as const;
  for (const name of cmsTools) {
    await page.goto('/competitors?from=suite');
    await openLink(page, name, false);
    await assertBackAndHome(page, '/competitors');
    await assertHomeFrom(page, async () => {
      await page.goto('/competitors?from=suite');
      await openLink(page, name, false);
    });
  }
});
