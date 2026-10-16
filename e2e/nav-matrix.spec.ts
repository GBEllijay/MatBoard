import { expect, test, type Locator, type Page } from '@playwright/test';

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

async function leaveFullscreen(page: Page) {
  await page.evaluate(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
  });
  try {
    const session = await page.context().newCDPSession(page);
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'normal' },
    });
  } catch {
    /* Some browser builds keep fullscreen as a window flag. */
  }
}

function consoleSection(root: Locator, name: string) {
  return root
    .locator('.saver-folder__title', { hasText: new RegExp(`^${name}$`) })
    .locator('xpath=ancestor::details[1]');
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
  for (const path of ['/white', '/student', '/coach', '/pro']) {
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
  await page.goto('/coach');
  await openLink(page, 'Daily Lesson Plan');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  const lessonBack = page.getByRole('link', { name: BACK, exact: true });
  await expect(lessonBack).toHaveAttribute('href', '/coach');
  await lessonBack.click();
  await expect.poll(() => pathOf(page)).toBe('/coach');

  for (const name of ['Daily Training Videos', 'Technique Tree', 'Mock Tournament'] as const) {
    await page.goto('/coach');
    await openLink(page, name);
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
    const back = page.getByRole('link', { name: BACK, exact: true });
    await expect(back).toHaveAttribute('href', '/coach');
    await back.click();
    await expect.poll(() => pathOf(page)).toBe('/coach');
  }

  const coachTools = ['Student Roster'] as const;
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
  await page.goto('/coach-unlimited');
  await openLink(page, 'Daily Lesson Plan');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  const lessonBack = page.getByRole('link', { name: BACK, exact: true });
  await expect(lessonBack).toHaveAttribute('href', '/coach-unlimited');
  await lessonBack.click();
  await expect.poll(() => pathOf(page)).toBe('/coach-unlimited');

  await expect(page.getByRole('link', { name: 'Competition Class Curriculum', exact: true })).toHaveCount(0);
  for (const name of ['Daily Training Videos', 'Technique Tree'] as const) {
    await page.goto('/coach-unlimited');
    await openLink(page, name);
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
    const back = page.getByRole('link', { name: BACK, exact: true });
    await expect(back).toHaveAttribute('href', '/coach-unlimited');
    await back.click();
    await expect.poll(() => pathOf(page)).toBe('/coach-unlimited');
  }

  const unlimitedTools = ['Competitor Roster'] as const;
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

test('Media Console keeps only the top-left back logo', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await unlock(page);
  await page.goto('/pro');
  await openLink(page, 'Media Console');
  const sheet = page.getByRole('dialog', { name: 'Media Console' });
  await expect(page.getByRole('heading', { name: 'Advantage - Media Console' })).toBeVisible();
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/pro');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);

  const playing = sheet.getByRole('checkbox', { name: 'Playing' });
  await expect(playing).toBeChecked();
  await playing.click();
  await expect(playing).not.toBeChecked();
  await playing.click();
  await expect(playing).toBeChecked();

  const gallery = sheet.getByRole('button', { name: 'Play Gallery' });
  await expect(gallery).toHaveAttribute('aria-pressed', 'true');
  await gallery.click();
  await expect(gallery).toHaveAttribute('aria-pressed', 'false');
  await gallery.click();
  await expect(gallery).toHaveAttribute('aria-pressed', 'true');
  await expect(consoleSection(sheet, 'Gallery')).toHaveJSProperty('open', false);

  await consoleSection(sheet, 'Gallery').locator('.saver-folder__title').click();
  await sheet.getByRole('button', { name: 'Add photos', exact: true }).click();
  const addPhotos = page.getByRole('dialog', { name: 'Add photos' });
  await expect(addPhotos.getByRole('heading', { name: 'Add photos' })).toBeVisible();
  await addPhotos.getByRole('button', { name: 'Close', exact: true }).click();

  await sheet.getByRole('button', { name: 'Add videos', exact: true }).click();
  const addVideos = page.getByRole('dialog', { name: 'Add videos' });
  await expect(addVideos.getByRole('heading', { name: 'Add videos' })).toBeVisible();
  await addVideos.getByRole('button', { name: 'Close', exact: true }).click();

  await sheet.getByRole('button', { name: 'Pick from Google Drive', exact: true }).click();
  const connect = page.getByRole('dialog', { name: 'Connect with' });
  await expect(connect.getByRole('heading', { name: 'Connect with' })).toBeVisible();
  await connect.getByRole('button', { name: 'Close', exact: true }).click();

  await sheet.getByRole('button', { name: "Link this day's technique clips" }).click();
  await expect(sheet.getByRole('status')).toBeVisible();

  const instructions = sheet.getByRole('button', { name: 'Instructions' });
  await instructions.click();
  await expect(page.getByRole('region', { name: 'Instructions' })).toBeVisible();
  await instructions.click();

  const fullscreen = page.getByRole('button', { name: /^Fullscreen/ });
  await fullscreen.click();
  await expect(page).toHaveURL(/\/slideshow/);
  await leaveFullscreen(page);

  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: 'Options' }).click();
  await expect(page.getByRole('dialog', { name: 'Media Console' })).toBeVisible();

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/pro');
});

test('Media Console sections start collapsed and the play toggle stays separate', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await unlock(page);
  await page.goto('/slideshow?folder=gallery');
  const sheet = page.getByRole('dialog', { name: 'Media Console' });
  const art = page.locator('.media-art');
  await expect(art).toHaveAttribute('aria-hidden', 'true');
  await expect(art.locator('a')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);

  const names = ['Gallery', 'Class Schedule', 'Pro Shop', 'Events'] as const;
  for (const name of names) {
    const section = consoleSection(sheet, name);
    await expect(section.locator('.saver-folder__title')).toBeVisible();
    await expect(section).toHaveJSProperty('open', false);
  }

  for (const name of names) {
    const section = consoleSection(sheet, name);
    const play = section.getByRole('button', { name: `Play ${name}` });
    const wasOn = (await play.getAttribute('aria-pressed')) === 'true';
    await play.click();
    await expect(play).toHaveAttribute('aria-pressed', wasOn ? 'false' : 'true');
    await expect(section).toHaveJSProperty('open', false);
    await play.click();
    await expect(play).toHaveAttribute('aria-pressed', wasOn ? 'true' : 'false');
    await expect(section).toHaveJSProperty('open', false);
  }

  const gallery = consoleSection(sheet, 'Gallery');
  await gallery.locator('.saver-folder__title').click();
  await expect(gallery).toHaveJSProperty('open', true);
  await expect(gallery.getByRole('button', { name: 'Add photos', exact: true })).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'Add videos', exact: true })).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'Pick from Google Drive', exact: true })).toBeVisible();
  await expect(gallery.getByRole('button', { name: "Link this day's technique clips" })).toBeVisible();
  for (const name of names.slice(1)) {
    await expect(consoleSection(sheet, name)).toHaveJSProperty('open', false);
  }
  await gallery.locator('.saver-folder__title').click();
  await expect(gallery).toHaveJSProperty('open', false);

  const schedule = consoleSection(sheet, 'Class Schedule');
  await schedule.locator('.saver-folder__title').click();
  await expect(schedule).toHaveJSProperty('open', true);
  await expect(gallery).toHaveJSProperty('open', false);
  await expect(schedule.getByRole('link', { name: 'Add class schedule' })).toBeVisible();
  await schedule.getByRole('radio', { name: 'On the TV' }).click();
  await expect(schedule.getByRole('button', { name: 'Play Class Schedule' })).toHaveAttribute('aria-pressed', 'true');
  await schedule.getByRole('radio', { name: 'Off the TV' }).click();
  await expect(schedule.getByRole('button', { name: 'Play Class Schedule' })).toHaveAttribute('aria-pressed', 'false');
  await schedule.locator('.saver-folder__title').click();
  await expect(schedule).toHaveJSProperty('open', false);

  const shop = consoleSection(sheet, 'Pro Shop');
  await shop.locator('.saver-folder__title').click();
  await expect(shop).toHaveJSProperty('open', true);
  await expect(schedule).toHaveJSProperty('open', false);
  await shop.getByRole('button', { name: 'Add cards', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add cards' }).getByRole('button', { name: 'Close', exact: true }).click();
  await shop.getByRole('button', { name: 'Pick from Google Drive', exact: true }).click();
  await page.getByRole('dialog', { name: 'Connect with' }).getByRole('button', { name: 'Close', exact: true }).click();
  await shop.locator('.saver-folder__title').click();
  await expect(shop).toHaveJSProperty('open', false);

  const events = consoleSection(sheet, 'Events');
  await events.locator('.saver-folder__title').click();
  await expect(events).toHaveJSProperty('open', true);
  await expect(shop).toHaveJSProperty('open', false);
  await events.getByRole('button', { name: 'Add photos', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add photos' }).getByRole('button', { name: 'Close', exact: true }).click();
  await events.locator('.saver-folder__title').click();
  await expect(events).toHaveJSProperty('open', false);
});

test('Class Schedule goes back to Media Console; the center home stays off the phone and the TV', async ({ page }) => {
  await unlock(page);
  await page.goto('/pro');
  await openLink(page, 'Media Console');
  await page.locator('summary').filter({ hasText: 'Class Schedule' }).click();
  await openLink(page, 'Add class schedule');

  const back = page.getByRole('link', { name: BACK, exact: true });
  const home = page.getByRole('link', { name: 'Home', exact: true });
  await expect(back).toHaveAttribute('href', '/slideshow?folder=gallery');
  await expect(home).toHaveCSS('pointer-events', 'none');
  await back.click();
  await expect.poll(() => pathOf(page)).toBe('/slideshow?folder=gallery');

  await leaveFullscreen(page);
  await page.setViewportSize(PHONE);
  await page.goto('/schedule');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/slideshow?folder=gallery');
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect.poll(() => pathOf(page)).toBe('/slideshow?folder=gallery');
});

test('Tournament Management Pro and CMS tiles go back one level and home to the tier picker', async ({ page }) => {
  await unlock(page);

  await page.goto('/suite');
  await openLink(page, 'Brackets-Tournament Software');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  const bracketBack = page.getByRole('link', { name: BACK, exact: true });
  await expect(bracketBack).toHaveAttribute('href', '/suite');
  await bracketBack.click();
  await expect.poll(() => pathOf(page)).toBe('/suite');

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
