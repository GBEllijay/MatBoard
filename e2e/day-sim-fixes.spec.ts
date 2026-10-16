import { expect, test, type Page } from '@playwright/test';

const COACH_PERMS = {
  galleryUpload: false,
  dailyLessonPlanAccess: true,
  rosterSubmit: true,
  rosterPull: true,
  downloadTodaysVideos: true,
  uploadForDistribution: true,
  eventsAccess: false,
  proShopAccess: false,
};

function seatRecord(presetId: string, email: string, permissions: Record<string, boolean>) {
  return {
    id: `seat-${presetId}`,
    gymId: 'gym-1',
    email,
    status: 'active',
    issuedAt: 1,
    presetId,
    permissions,
    inviteToken: 'tok',
  };
}

async function seed(page: Page, options: { pro?: boolean; coach?: boolean; white?: boolean; seat?: unknown }) {
  await page.addInitScript((opts) => {
    const setFlag = (key: string, on: boolean | undefined) => {
      if (on) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
    };
    setFlag('advantage.proUnlocked', opts.pro);
    setFlag('advantage.coachUnlocked', opts.coach);
    setFlag('advantage.whiteUnlocked', opts.white);
    if (!opts.seat) return;
    localStorage.setItem(
      'matboard.pro.instructorSeats.v1',
      JSON.stringify({ version: 1, deviceGymId: 'gym-1', seats: [opts.seat] }),
    );
    localStorage.setItem(
      'matboard.pro.instructorSeatSession.v1',
      JSON.stringify({ version: 1, seatId: (opts.seat as { id: string }).id }),
    );
  }, options);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: false });
}

async function openTrainingOptions(page: Page) {
  const classic = page.getByRole('radio', { name: 'Classic' });
  if (await classic.isVisible()) return;
  const main = page.locator('main.training');
  const box = await main.boundingBox();
  expect(box).toBeTruthy();
  await main.click({ position: { x: 28, y: Math.min(180, box!.height - 24) } });
  await expect(classic).toBeVisible();
}

async function boardStyle(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const style = getComputedStyle(el);
    return { color: style.backgroundColor, image: style.backgroundImage, className: el.className };
  });
}

async function pickSkin(page: Page, skin: 'Classic' | 'Advantage') {
  await page.getByRole('radio', { name: skin }).click();
  await expect(page.getByRole('radio', { name: skin })).toHaveAttribute('aria-checked', 'true');
}

async function expectClassic(page: Page, kind: 'training' | 'controller') {
  const selector = kind === 'training' ? 'main.training' : 'main.controller';
  const style = await boardStyle(page, selector);
  expect(style.className.includes(kind === 'training' ? 'training--themed' : 'controller--classic')).toBe(
    kind !== 'training',
  );
  expect(style.color).toBe('rgb(5, 5, 5)');
  if (kind === 'controller') expect(style.image).toBe('none');
}

async function expectAdvantage(page: Page, kind: 'training' | 'controller') {
  const selector = kind === 'training' ? 'main.training' : 'main.controller';
  const style = await boardStyle(page, selector);
  if (kind === 'training') expect(style.className).toContain('training--themed');
  else {
    expect(style.className).not.toContain('controller--classic');
    expect(style.image).not.toBe('none');
  }
}

async function exerciseSounds(page: Page) {
  const previews = page.getByRole('group', { name: 'Preview cues' });
  const start = page.getByRole('checkbox', { name: 'Start sound' });
  const warn = page.getByRole('checkbox', { name: '10-second warning' });
  const end = page.getByRole('checkbox', { name: 'Training end sound' });
  const mute = page.getByRole('checkbox', { name: 'Mute' });
  const vibrate = page.getByRole('checkbox', { name: 'Vibrate' });
  const volume = page.getByRole('slider', { name: 'Volume' });
  await expect(start).toBeChecked();
  await expect(warn).toBeChecked();
  await expect(end).toBeChecked();
  await expect(previews.getByRole('button', { name: 'Start' })).toBeEnabled();
  await expect(previews.getByRole('button', { name: '10s' })).toBeEnabled();
  await expect(previews.getByRole('button', { name: 'End' })).toBeEnabled();

  await start.click();
  await warn.click();
  await end.click();
  await expect(previews.getByRole('button', { name: 'Start' })).toBeDisabled();
  await expect(previews.getByRole('button', { name: '10s' })).toBeDisabled();
  await expect(previews.getByRole('button', { name: 'End' })).toBeDisabled();

  const vibrateBefore = await vibrate.isChecked();
  await volume.fill('0.35');
  await expect(volume).toHaveValue('0.35');
  await mute.click();
  await expect(mute).toBeChecked();
  await vibrate.click();
  const vibrateOn = !vibrateBefore;

  await page.reload();
  await openTrainingOptions(page);
  await expect(start).not.toBeChecked();
  await expect(warn).not.toBeChecked();
  await expect(end).not.toBeChecked();
  await expect(mute).toBeChecked();
  await expect(volume).toHaveValue('0.35');
  await expect(vibrate).toBeChecked({ checked: vibrateOn });

  await start.click();
  await warn.click();
  await end.click();
  await mute.click();
  await vibrate.click();
  await expect(vibrate).toBeChecked({ checked: vibrateBefore });
  await expect(start).toBeChecked();
  await expect(warn).toBeChecked();
  await expect(end).toBeChecked();
  await expect(mute).not.toBeChecked();
  await expect(previews.getByRole('button', { name: 'Start' })).toBeEnabled();
  await expect(previews.getByRole('button', { name: '10s' })).toBeEnabled();
  await expect(previews.getByRole('button', { name: 'End' })).toBeEnabled();
  await previews.getByRole('button', { name: 'Start' }).click();
  await previews.getByRole('button', { name: '10s' }).click();
  await previews.getByRole('button', { name: 'End' }).click();
}

test('a Gallery seat opens Gallery and an adjusted seat explains the label', async ({ page }) => {
  await seed(page, {
    seat: seatRecord('coach', 'coach-gallery@example.com', { ...COACH_PERMS, galleryUpload: true }),
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByText('Coach · adjusted')).toBeVisible();
  await expect(page.getByText("The owner changed this seat's permissions from the role defaults.")).toBeVisible();
  await shot(page, 'seat-adjusted-desktop');
  await page.locator('.mode-card__actions').getByRole('link', { name: 'Open Media Console' }).click();
  await expect(page).toHaveURL(/\/pro$/);
  await expect(page.getByRole('link', { name: 'Gallery' })).toBeVisible();
  await expect(page.getByText('This seat keeps the menus from its invite.')).toBeVisible();
  await page.getByRole('link', { name: 'Gallery' }).click();
  await expect(page).toHaveURL(/\/slideshow\?folder=gallery/);
  await expect(page.getByRole('button', { name: 'Add photos' }).first()).toBeVisible();
  await expect(page).not.toHaveURL(/coming-soon/);
  await shot(page, 'gallery-seat-desktop');

  await page.goto('/events');
  await expect(page).toHaveURL(/\/$/);
  await expect(page).not.toHaveURL(/coming-soon/);
  await page.goto('/coming-soon');
  await expect(page).toHaveURL(/\/$/);
  await expect(page).not.toHaveURL(/coming-soon/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText("The owner changed this seat's permissions from the role defaults.")).toBeVisible();
  await shot(page, 'seat-adjusted-phone');
  await page.goto('/gallery');
  await expect(page).toHaveURL(/folder=gallery/);
  await expect(page.getByRole('button', { name: 'Add photos' }).first()).toBeVisible();
  await shot(page, 'gallery-seat-phone');

  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out of seat' }).click();
  await expect(page.getByText('Signed in as')).toHaveCount(0);
});

test('a seat without Gallery stays out of Gallery and off Coming soon', async ({ page }) => {
  await seed(page, { seat: seatRecord('coach', 'coach-plain@example.com', COACH_PERMS) });
  await page.goto('/gallery');
  await expect(page).toHaveURL(/\/$/);
  await expect(page).not.toHaveURL(/coming-soon/);
  await expect(page.getByRole('link', { name: 'Open Media Console' })).toHaveCount(0);
});

test('the owner and an Instructor seat both open Gallery', async ({ page }) => {
  await seed(page, { pro: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/gallery');
  await expect(page).toHaveURL(/folder=gallery/);
  await expect(page.getByRole('button', { name: 'Add photos' }).first()).toBeVisible();
  await page.goto('/pro');
  await expect(page.getByRole('link', { name: 'Media Console' })).toBeVisible();
  await page.getByRole('link', { name: 'Media Console' }).click();
  await expect(page).toHaveURL(/slideshow/);

  await seed(page, {
    seat: seatRecord('instructors', 'instructor@example.com', {
      galleryUpload: true,
      dailyLessonPlanAccess: true,
      rosterSubmit: true,
      rosterPull: true,
      downloadTodaysVideos: true,
      uploadForDistribution: true,
      eventsAccess: true,
      proShopAccess: true,
    }),
  });
  await page.goto('/pro');
  await expect(page.getByRole('link', { name: 'Gallery' })).toBeVisible();
  await page.getByRole('link', { name: 'Gallery' }).click();
  await expect(page).toHaveURL(/folder=gallery/);
  await expect(page.getByRole('button', { name: 'Add photos' }).first()).toBeVisible();
});

test('lesson title saves, reopens from Classes, and reaches the review list', async ({ page }) => {
  await seed(page, { pro: true, coach: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/notes');
  await page.getByLabel('Coach name').fill('Justin');
  await page.getByLabel('Class designation').fill('GB1');
  await page.getByLabel('Lesson title').fill('Guard passing');
  await page.getByLabel('Class time').fill('5:00 PM');
  const designationBox = await page.getByLabel('Class designation').boundingBox();
  const titleBox = await page.getByLabel('Lesson title').boundingBox();
  expect(designationBox && titleBox).toBeTruthy();
  expect(Math.abs(designationBox!.y - titleBox!.y)).toBeLessThan(40);
  expect(titleBox!.x).toBeGreaterThan(designationBox!.x + 40);
  await page.getByLabel('Lesson title').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Connect Google Drive first' })).toBeVisible();
  await shot(page, 'lesson-title-desktop');
  await page.getByRole('button', { name: 'Connect Google Drive first' }).click();
  const connect = page.getByRole('dialog', { name: 'Connect with' });
  await expect(connect).toBeVisible();
  await expect(connect.getByRole('button', { name: 'Google Drive' })).toBeVisible();
  await shot(page, 'drive-connect-desktop');
  await connect.getByRole('button', { name: 'Close', exact: true }).click();

  await page.reload();
  await expect(page.getByLabel('Lesson title')).toHaveValue('Guard passing');
  await expect(page.getByLabel('Class designation')).toHaveValue('GB1');
  const stored = await page.evaluate(() => localStorage.getItem('matboard.coach.trainingNotes.v1') ?? '');
  expect(stored).toContain('"lessonTitle":"Guard passing"');
  await page.getByRole('button', { name: 'Classes' }).click();
  await page.getByRole('button', { name: /GB1/ }).click();
  await expect(page.getByRole('button', { name: /Justin \/ GB1 \/ Guard passing \/ 5:00 PM/ })).toBeVisible();
  await shot(page, 'lesson-classes-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/notes');
  await expect(page.getByLabel('Lesson title')).toHaveValue('Guard passing');
  const phoneDesignation = await page.getByLabel('Class designation').boundingBox();
  const phoneTitle = await page.getByLabel('Lesson title').boundingBox();
  expect(phoneDesignation && phoneTitle).toBeTruthy();
  const phoneSideBySide = Math.abs(phoneDesignation!.y - phoneTitle!.y) < 40;
  const phoneStacked = phoneTitle!.y >= phoneDesignation!.y + phoneDesignation!.height - 8;
  expect(phoneSideBySide || phoneStacked).toBe(true);
  await page.getByLabel('Lesson title').scrollIntoViewIfNeeded();
  await shot(page, 'lesson-title-phone');
  await page.getByRole('button', { name: 'Connect Google Drive first' }).click();
  await expect(page.getByRole('dialog', { name: 'Connect with' })).toBeVisible();
  await shot(page, 'drive-connect-phone');
  await page.getByRole('dialog', { name: 'Connect with' }).getByRole('button', { name: 'Close', exact: true }).click();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/notes?plan=unlimited');
  await page.getByLabel('Lesson title').fill('Guard passing drill');
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('matboard.pro.lessonDriveQueue.v1') ?? ''))
    .toContain('Guard passing drill');
  await page.goto('/coach-unlimited');
  await expect(page.getByText(/Justin · GB1 Guard passing drill 5:00 PM/)).toBeVisible();
  const queue = await page.evaluate(() => localStorage.getItem('matboard.pro.lessonDriveQueue.v1') ?? '');
  expect(queue).toContain('Guard passing drill');
  await shot(page, 'lesson-review-desktop');
});

test('Classic and Advantage follow the skin on Rounds and the controller', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, { pro: true, coach: true, white: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('/training');
  await openTrainingOptions(page);
  await pickSkin(page, 'Advantage');
  await expectAdvantage(page, 'training');
  await pickSkin(page, 'Classic');
  await expectClassic(page, 'training');
  await shot(page, 'rounds-classic-training-desktop');

  await page.goto('/training/control');
  await expect(page.locator('main.controller')).toHaveClass(/controller--classic/);
  await pickSkin(page, 'Advantage');
  await expectAdvantage(page, 'controller');
  await pickSkin(page, 'Classic');
  await expectClassic(page, 'controller');
  await shot(page, 'rounds-classic-control-desktop');

  await page.goto('/training?from=suite');
  await expect(page.locator('main.training')).toHaveClass(/origin-suite/);
  await openTrainingOptions(page);
  await pickSkin(page, 'Advantage');
  await expectAdvantage(page, 'training');
  await expect(page.locator('main.training')).toHaveClass(/origin-suite/);
  await pickSkin(page, 'Classic');
  await expectClassic(page, 'training');

  await page.goto('/training/control?from=suite');
  await expect(page.locator('main.controller')).toHaveClass(/origin-suite/);
  await expect(page.locator('main.controller')).toHaveClass(/controller--classic/);
  await pickSkin(page, 'Advantage');
  await expectAdvantage(page, 'controller');
  await expect(page.locator('main.controller')).toHaveClass(/origin-suite/);
  await pickSkin(page, 'Classic');
  await expectClassic(page, 'controller');
  const clock = page.locator('.training-control__actions').getByRole('button', { name: 'Start' });
  await clock.click();
  await expect(page.locator('.training-control__actions').getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.locator('.training-control__actions').getByRole('button', { name: 'Pause' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/training');
  await openTrainingOptions(page);
  await expectClassic(page, 'training');
  await shot(page, 'rounds-classic-training-phone');
  await page.goto('/training/control');
  await expectClassic(page, 'controller');
  await shot(page, 'rounds-classic-control-phone');
});

test('Start sound and 10-second warning toggles work on Pro and White Rounds', async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, { pro: true, coach: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/training');
  await openTrainingOptions(page);
  await exerciseSounds(page);
  await shot(page, 'rounds-sounds-training-desktop');

  await page.goto('/training/control');
  await exerciseSounds(page);
  await shot(page, 'rounds-sounds-control-desktop');

  await page.goto('/training?from=suite');
  await openTrainingOptions(page);
  await expect(page.getByRole('checkbox', { name: 'Start sound' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Start sound' }).click();
  await expect(page.getByRole('group', { name: 'Preview cues' }).getByRole('button', { name: 'Start' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Start sound' }).click();

  await page.goto('/training/control?from=suite');
  await expect(page.locator('main.controller')).toHaveClass(/origin-suite/);
  await expect(page.getByRole('checkbox', { name: '10-second warning' })).toBeChecked();
  await page.getByRole('checkbox', { name: '10-second warning' }).click();
  await expect(page.getByRole('group', { name: 'Preview cues' }).getByRole('button', { name: '10s' })).toBeDisabled();
  await page.getByRole('checkbox', { name: '10-second warning' }).click();

  await seed(page, { white: true });
  const roundsCard = page.locator('.mode-card--training');
  await page.goto('/white');
  await roundsCard.getByRole('link', { name: 'Rounds', exact: true }).click();
  await expect(page).toHaveURL(/\/training$/);
  await openTrainingOptions(page);
  await exerciseSounds(page);
  await shot(page, 'white-rounds-desktop');

  await page.goto('/white');
  await roundsCard.getByRole('link', { name: 'Controller', exact: true }).click();
  await expect(page).toHaveURL(/\/training\/control$/);
  await expect(page.getByRole('checkbox', { name: 'Start sound' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '10-second warning' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Start sound' }).click();
  await page.getByRole('checkbox', { name: '10-second warning' }).click();
  await expect(page.getByRole('group', { name: 'Preview cues' }).getByRole('button', { name: 'Start' })).toBeDisabled();
  await expect(page.getByRole('group', { name: 'Preview cues' }).getByRole('button', { name: '10s' })).toBeDisabled();
  await page.locator('.training-control__actions').getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.training-control__actions').getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.locator('.training-control__actions').getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('checkbox', { name: 'Start sound' }).click();
  await page.getByRole('checkbox', { name: '10-second warning' }).click();
  await shot(page, 'white-controller-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/white');
  await shot(page, 'white-home-phone');
  await page.locator('.mode-card--training').getByRole('link', { name: 'Rounds', exact: true }).click();
  await openTrainingOptions(page);
  await expect(page.getByRole('checkbox', { name: 'Start sound' })).toBeVisible();
  await shot(page, 'white-rounds-phone');
  await page.goto('/white');
  await page.locator('.mode-card--training').getByRole('link', { name: 'Controller', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '10-second warning' })).toBeVisible();
  await shot(page, 'white-controller-phone');
});

test('roster promotion detail and Fill from check-in still open', async ({ page }) => {
  await seed(page, { pro: true, coach: true, white: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/roster?from=students');
  await page.getByRole('button', { name: 'Add student' }).click();
  await page.getByLabel('Student name').fill('Ada Cruz');
  await page.getByRole('radio', { name: 'White', exact: true }).click();
  await page.getByLabel('Last promotion', { exact: true }).fill('2026-04-01');
  await page.getByLabel('Last promotion detail').fill('3rd stripe, white belt');
  await page.getByRole('button', { name: 'Save student' }).click();
  await expect(page.locator('.roster-card__promotion')).toContainText('3rd stripe, white belt');

  await page.goto('/tournament?from=suite');
  await page.getByRole('button', { name: 'Fill from check-in' }).click();
  const sheet = page.getByRole('dialog', { name: 'Fill from check-in' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sheet).toHaveCount(0);
});
