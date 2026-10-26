import { writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

const BACK = 'Back. Hold for Home.';
const PHONE = { width: 390, height: 844 };
const PNG = '/tmp/gallery-header.png';

const SCROLLING_MENUS: { path: string; heading: string; logo: string }[] = [
  { path: '/pro', heading: 'Advantage Pro', logo: '.home__logo' },
  { path: '/coach', heading: 'Advantage - Coach', logo: '.home__logo' },
  { path: '/coach-unlimited', heading: 'Advantage - Coach Unlimited', logo: '.home__logo' },
  { path: '/instructors', heading: 'Instructor Invitations and Access Management', logo: '.home__logo' },
  { path: '/suite', heading: 'Tournament Management Pro', logo: '.home__logo' },
  { path: '/white', heading: 'Advantage - White', logo: '.home__logo' },
];

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
  });
}

function consoleSection(root: Locator, name: string) {
  return root
    .locator('.saver-folder__title', { hasText: new RegExp(`^${name}$`) })
    .locator('xpath=ancestor::details[1]');
}

async function headerPin(locator: Locator, wrapSelector: string, stopClass: string) {
  return locator.evaluate(
    (el, args) => {
      const wrap = el.closest(args.wrapSelector);
      if (!(wrap instanceof HTMLElement)) return { position: 'missing', sticky: ['missing wrap'] };
      const sticky: string[] = [];
      let node: HTMLElement | null = wrap;
      while (node && !node.classList.contains(args.stopClass)) {
        const position = getComputedStyle(node).position;
        if (position === 'fixed' || position === 'sticky') sticky.push(`${node.className}:${position}`);
        node = node.parentElement;
      }
      return { position: getComputedStyle(wrap).position, sticky };
    },
    { wrapSelector, stopClass },
  );
}

test('gallery belt scrolls away and other Pro headers stay as they were', async ({ page }) => {
  test.setTimeout(120_000);
  await unlock(page);
  await page.setViewportSize(PHONE);

  await page.goto('/slideshow?folder=gallery');
  const sheet = page.getByRole('dialog', { name: 'Media Console' });
  const belt = sheet.getByRole('heading', { name: 'Advantage - Media Console', exact: true });
  await expect(belt).toBeVisible();
  const galleryPin = await headerPin(belt, '.saver-belt', 'sheet__body');
  expect(galleryPin.position).toBe('static');
  expect(galleryPin.sticky).toEqual([]);
  await expect(belt.locator('xpath=ancestor::*[contains(@class,"sheet__body")]')).toHaveCount(1);

  const back = page.getByRole('link', { name: BACK, exact: true });
  await expect(back).toHaveAttribute('href', '/pro');
  await expect(back).toHaveCSS('position', 'fixed');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  await expect(page.locator('.media-art a')).toHaveCount(0);

  const before = await belt.evaluate((el) => el.getBoundingClientRect().top);
  const backBefore = await back.evaluate((el) => el.getBoundingClientRect().top);
  const body = sheet.locator('.sheet__body');
  await body.evaluate((el) => {
    const header = el.querySelector('.saver-belt');
    el.scrollTop = header instanceof HTMLElement ? header.offsetTop + header.offsetHeight + 24 : 480;
  });
  const bodyTop = await body.evaluate((el) => el.getBoundingClientRect().top);
  await expect.poll(async () => belt.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThan(bodyTop);
  await expect.poll(async () => belt.evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(before - 40);
  const backAfter = await back.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(backAfter - backBefore)).toBeLessThan(2);
  await page.screenshot({
    path: '/opt/cursor/artifacts/gallery_header_scrolled_phone.png',
    fullPage: false,
  });

  for (const folder of ['events', 'shop'] as const) {
    await page.goto(`/slideshow?folder=${folder}`);
    const pinned = page.locator('.saver-belt');
    await expect(pinned).toHaveCSS('position', 'fixed');
    await expect(pinned).toHaveCount(1);
    const pinnedSheet = page.getByRole('dialog', { name: 'Media Console' });
    const pinnedTop = await pinned.evaluate((el) => el.getBoundingClientRect().top);
    await pinnedSheet.locator('.sheet__body').evaluate((el) => {
      el.scrollTop = 360;
    });
    const pinnedAfter = await pinned.evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(pinnedAfter - pinnedTop)).toBeLessThan(2);
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveCSS('position', 'fixed');
  }

  for (const menu of SCROLLING_MENUS) {
    await page.goto(menu.path);
    const heading = page.getByRole('heading', { name: menu.heading, exact: true });
    await expect(heading).toBeVisible();
    const pin = await headerPin(heading, '.belt-header', 'main');
    expect(pin.position, menu.path).toBe('static');
    expect(pin.sticky, menu.path).toEqual([]);
    const logo = page.locator(menu.logo).first();
    await expect(logo).toHaveCSS('position', 'fixed');
    const logoTop = await logo.evaluate((el) => el.getBoundingClientRect().top);
    const headingTop = await heading.evaluate((el) => el.getBoundingClientRect().top);
    await page.locator('main').evaluate((el) => {
      el.scrollTop = 280;
    });
    const headingAfter = await heading.evaluate((el) => el.getBoundingClientRect().top);
    const logoAfter = await logo.evaluate((el) => el.getBoundingClientRect().top);
    expect(headingAfter, menu.path).toBeLessThan(headingTop - 120);
    expect(Math.abs(logoAfter - logoTop), menu.path).toBeLessThan(2);
    if (menu.path === '/pro' || menu.path === '/coach' || menu.path === '/white') {
      await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/products');
      await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveCSS('position', 'fixed');
      await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/products');
    }
  }
});

test('gallery page controls still work after the belt scrolls', async ({ page }) => {
  test.setTimeout(180_000);
  await unlock(page);
  await page.setViewportSize(PHONE);
  writeFileSync(
    PNG,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  await page.goto('/slideshow?folder=gallery');
  const sheet = page.getByRole('dialog', { name: 'Media Console' });
  await expect(sheet.getByRole('heading', { name: 'Advantage - Media Console', exact: true })).toBeVisible();

  const playing = sheet.getByRole('checkbox', { name: 'Playing' });
  await playing.click();
  await expect(playing).not.toBeChecked();
  await playing.click();
  await expect(playing).toBeChecked();

  const gallery = consoleSection(sheet, 'Gallery');
  const galleryPlay = gallery.getByRole('button', { name: 'Play Gallery' });
  await galleryPlay.click();
  await expect(galleryPlay).toHaveAttribute('aria-pressed', 'false');
  await galleryPlay.click();
  await expect(galleryPlay).toHaveAttribute('aria-pressed', 'true');
  await gallery.locator('.saver-folder__title').click();
  await expect(gallery).toHaveJSProperty('open', true);

  await gallery.getByRole('button', { name: 'Add photos', exact: true }).click();
  const addPhotos = page.getByRole('dialog', { name: 'Add photos' });
  await expect(addPhotos.getByText('Take photo', { exact: true })).toBeVisible();
  await expect(addPhotos.getByText('Pick from gallery', { exact: true })).toBeVisible();
  await expect(addPhotos.getByRole('button', { name: 'Pick from Google Photos' })).toBeVisible();
  await expect(addPhotos.getByRole('button', { name: 'Pick from Google Drive' })).toBeVisible();
  await expect(addPhotos.getByRole('button', { name: 'Open my Drive' })).toBeVisible();
  await addPhotos.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#saver-photo-library').setInputFiles(PNG);
  await expect(gallery.getByLabel('Caption for Photo 1')).toBeVisible();
  await gallery.getByLabel('Caption for Photo 1').fill('Guard pass');
  await gallery.getByLabel('Caption for Photo 1').blur();
  await expect(gallery.getByLabel('Label for Photo 1')).toHaveValue('Photo 1');
  await gallery.getByLabel('Label for Photo 1').fill('Open guard');
  await gallery.getByLabel('Label for Photo 1').blur();
  await expect(gallery.getByLabel('Caption for Open guard')).toBeVisible();

  const showDate = gallery.getByRole('button', { name: 'Show on date', exact: true });
  await showDate.click();
  await expect(showDate).toHaveAttribute('aria-pressed', 'true');
  const date = gallery.getByLabel('Show date for Open guard');
  await date.fill('2026-10-26');
  await expect(date).toHaveValue('2026-10-26');
  const nextClass = gallery.getByRole('button', { name: 'Next class', exact: true });
  await nextClass.click();
  await expect(nextClass).toHaveAttribute('aria-pressed', 'true');
  await expect(showDate).toHaveAttribute('aria-pressed', 'false');

  const preview = gallery.getByRole('button', { name: 'Exclude Open guard from playback' });
  await preview.click();
  await expect(gallery.getByRole('button', { name: 'Include Open guard in playback' })).toBeVisible();
  await gallery.getByRole('button', { name: 'Include Open guard in playback' }).click();
  await expect(preview).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'Hold, then drag to move Open guard' })).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'Move Open guard up' })).toBeDisabled();
  await expect(gallery.getByRole('button', { name: 'Move Open guard down' })).toBeDisabled();

  await gallery.getByRole('button', { name: 'Add videos', exact: true }).click();
  const addVideos = page.getByRole('dialog', { name: 'Add videos' });
  await expect(addVideos.getByText('Record', { exact: true })).toBeVisible();
  await expect(addVideos.getByText('Pick from gallery', { exact: true })).toBeVisible();
  await addVideos.getByRole('button', { name: 'Close', exact: true }).click();

  await gallery.getByRole('button', { name: 'Pick from Google Photos', exact: true }).click();
  const photosConnect = page.getByRole('dialog', { name: 'Connect with' });
  await expect(photosConnect).toBeVisible();
  await photosConnect.getByRole('button', { name: 'Close', exact: true }).click();

  await gallery.getByRole('button', { name: 'Pick from Google Drive', exact: true }).click();
  const driveConnect = page.getByRole('dialog', { name: 'Connect with' });
  await expect(driveConnect).toBeVisible();
  await driveConnect.getByRole('button', { name: 'Close', exact: true }).click();

  await gallery.getByRole('button', { name: 'Open my Drive', exact: true }).click();
  const openDrive = page.getByRole('dialog', { name: 'Connect with' });
  await expect(openDrive).toBeVisible();
  await openDrive.getByRole('button', { name: 'Close', exact: true }).click();

  await gallery.getByRole('button', { name: "Link this day's technique clips" }).click();
  await expect(sheet.getByRole('status')).toBeVisible();

  await gallery.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(gallery.getByLabel('Caption for Open guard')).toHaveCount(0);
  await expect(gallery.getByRole('button', { name: 'Clear Gallery' })).toHaveCount(0);

  const schedule = consoleSection(sheet, 'Class Schedule');
  const schedulePlay = schedule.getByRole('button', { name: 'Play Class Schedule' });
  const scheduleWasOn = (await schedulePlay.getAttribute('aria-pressed')) === 'true';
  await schedulePlay.click();
  await expect(schedulePlay).toHaveAttribute('aria-pressed', scheduleWasOn ? 'false' : 'true');
  await expect(schedule).toHaveJSProperty('open', false);
  await schedulePlay.click();
  await expect(schedulePlay).toHaveAttribute('aria-pressed', scheduleWasOn ? 'true' : 'false');
  await schedule.locator('.saver-folder__title').click();
  await expect(schedule).toHaveJSProperty('open', true);
  await expect(gallery).toHaveJSProperty('open', false);
  await schedule.getByRole('radio', { name: 'Off the TV' }).click();
  await expect(schedulePlay).toHaveAttribute('aria-pressed', 'false');
  await schedule.getByRole('radio', { name: 'On the TV' }).click();
  await expect(schedulePlay).toHaveAttribute('aria-pressed', 'true');
  await schedule.getByRole('link', { name: 'Add class schedule' }).click();
  await expect(page.getByRole('heading', { name: 'Class Schedule', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe('/slideshow?folder=gallery');

  const shop = consoleSection(sheet, 'Pro Shop');
  await shop.locator('.saver-folder__title').click();
  const shopPlay = shop.getByRole('button', { name: 'Play Pro Shop' });
  await shopPlay.click();
  await expect(shopPlay).toHaveAttribute('aria-pressed', 'false');
  await shopPlay.click();
  await expect(shopPlay).toHaveAttribute('aria-pressed', 'true');
  await shop.getByRole('button', { name: 'Add cards', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add cards' }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#saver-photo-library').setInputFiles(PNG);
  await expect(shop.getByLabel('Buy link for Card 1')).toBeVisible();
  await shop.getByLabel('Buy link for Card 1').fill('gym.example/rashguard');
  await shop.getByLabel('Buy link for Card 1').blur();
  await expect(shop.getByRole('button', { name: 'New slide', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(shop.getByRole('button', { name: 'Same slide', exact: true })).toBeDisabled();
  await shop.getByRole('button', { name: 'Clear Pro Shop' }).click();
  await expect(shop.getByLabel('Buy link for Card 1')).toHaveCount(0);
  await shop.getByRole('button', { name: 'Pick from Google Drive', exact: true }).click();
  await page.getByRole('dialog', { name: 'Connect with' }).getByRole('button', { name: 'Close', exact: true }).click();

  const events = consoleSection(sheet, 'Events');
  await events.locator('.saver-folder__title').click();
  await expect(shop).toHaveJSProperty('open', false);
  const eventsPlay = events.getByRole('button', { name: 'Play Events' });
  await eventsPlay.click();
  await expect(eventsPlay).toHaveAttribute('aria-pressed', 'false');
  await eventsPlay.click();
  await expect(eventsPlay).toHaveAttribute('aria-pressed', 'true');
  await events.getByRole('button', { name: 'Add photos', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add photos' }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#saver-photo-library').setInputFiles(PNG);
  await expect(events.getByLabel('QR link 1 for Event 1')).toBeVisible();
  await events.getByLabel('QR link 1 for Event 1').fill('gym.example/register');
  await events.getByLabel('QR link 1 for Event 1').blur();
  await events.getByRole('button', { name: 'Add QR', exact: true }).click();
  await expect(events.getByRole('textbox', { name: 'QR link 2 for Event 1' })).toBeVisible();
  await events.getByRole('button', { name: 'Remove QR link 1 for Event 1' }).click();
  await events.getByRole('button', { name: 'Clear Events' }).click();
  await expect(events.getByLabel('QR link 1 for Event 1')).toHaveCount(0);
  await events.getByRole('button', { name: 'Pick from Google Drive', exact: true }).click();
  await page.getByRole('dialog', { name: 'Connect with' }).getByRole('button', { name: 'Close', exact: true }).click();

  const minus = sheet.getByRole('button', { name: 'Subtract one second' });
  const plus = sheet.getByRole('button', { name: 'Add one second' });
  const interval = sheet.locator('.interval-stepper strong');
  const intervalBefore = await interval.innerText();
  await plus.click();
  await expect(interval).not.toHaveText(intervalBefore);
  await minus.click();
  await expect(interval).toHaveText(intervalBefore);
  await sheet.getByRole('button', { name: '10s', exact: true }).click();
  await expect(interval).toHaveText('0:10');
  await sheet.getByRole('radio', { name: 'Shuffle', exact: true }).click();
  await expect(sheet.getByRole('radio', { name: 'Shuffle', exact: true })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('radio', { name: 'In order', exact: true }).click();
  await expect(sheet.getByRole('radio', { name: 'In order', exact: true })).toHaveAttribute('aria-checked', 'true');

  for (const name of ['Images only', 'Images + QR + logo', 'Images + QR'] as const) {
    const shopMode = sheet.getByRole('radiogroup', { name: 'Pro Shop on the TV' }).getByRole('radio', { name, exact: true });
    await shopMode.click();
    await expect(shopMode).toHaveAttribute('aria-checked', 'true');
  }
  for (const name of ['Images only', 'Images + QR + logo', 'Images + QR'] as const) {
    const eventsMode = sheet.getByRole('radiogroup', { name: 'Events on the TV' }).getByRole('radio', { name, exact: true });
    await eventsMode.click();
    await expect(eventsMode).toHaveAttribute('aria-checked', 'true');
  }
  await sheet.getByRole('radio', { name: 'Play video sound', exact: true }).click();
  await expect(sheet.getByRole('radio', { name: 'Play video sound', exact: true })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('radio', { name: 'Mute clips', exact: true }).click();
  await expect(sheet.getByRole('radio', { name: 'Mute clips', exact: true })).toHaveAttribute('aria-checked', 'true');

  const gym = sheet.getByRole('region', { name: 'Gym identity' });
  await gym.getByRole('button', { name: 'Add custom gym logo', exact: true }).click();
  const logoSheet = page.getByRole('dialog', { name: 'Custom gym logo' });
  await expect(logoSheet.getByText('Take photo', { exact: true })).toBeVisible();
  await expect(logoSheet.getByText('Pick from gallery', { exact: true })).toBeVisible();
  await logoSheet.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#gym-logo-library').setInputFiles(PNG);
  await expect(gym.getByRole('img', { name: 'Current gym logo' })).toBeVisible();
  await gym.getByRole('button', { name: 'Replace', exact: true }).click();
  await page.getByRole('dialog', { name: 'Custom gym logo' }).getByRole('button', { name: 'Close', exact: true }).click();
  await gym.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(gym.getByRole('button', { name: 'Add custom gym logo', exact: true })).toBeVisible();
  await gym.getByRole('textbox', { name: 'Gym name' }).fill('Alliance North');
  await expect(gym.getByRole('textbox', { name: 'Gym name' })).toHaveValue('Alliance North');
  const downloadPromise = page.waitForEvent('download');
  await gym.getByRole('button', { name: 'Download gym file for students', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.json$/);
  await gym.getByRole('button', { name: 'Open my Drive', exact: true }).click();
  const gymDrive = page.getByRole('dialog', { name: 'Connect with' });
  await expect(gymDrive.getByRole('heading', { name: 'Connect with' })).toBeVisible();
  // The connect sheet is fixed inside the scrolling console. From the bottom of
  // the list its Close control can sit outside the clipped panel, so activate it directly.
  await gymDrive.getByRole('button', { name: 'Close', exact: true }).evaluate((button) => {
    if (button instanceof HTMLButtonElement) button.click();
  });
  await expect(gymDrive).toHaveCount(0);

  const instructions = sheet.getByRole('button', { name: 'Instructions', exact: true });
  await instructions.click();
  await expect(page.getByRole('region', { name: 'Instructions' })).toBeVisible();
  await instructions.click();
  await expect(page.getByRole('region', { name: 'Instructions' })).toHaveCount(0);

  const fullscreen = page.getByRole('button', { name: /^Fullscreen/ });
  await fullscreen.click();
  await expect(page).toHaveURL(/\/slideshow/);
  await page.keyboard.press('Escape');

  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: 'Options', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Media Console' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Advantage - Media Console', exact: true })).toBeVisible();

  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/pro');
});
