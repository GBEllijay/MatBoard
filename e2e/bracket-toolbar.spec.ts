import { expect, test, type Page } from '@playwright/test';

const SEAT = {
  id: 'seat-coach-bot',
  gymId: 'gym-1',
  email: 'coach-bot-three@example.com',
  status: 'active',
  issuedAt: 1,
  presetId: 'coach',
  permissions: {
    galleryUpload: false,
    dailyLessonPlanAccess: true,
    rosterSubmit: true,
    rosterPull: true,
    downloadTodaysVideos: true,
    uploadForDistribution: true,
    eventsAccess: false,
    proShopAccess: false,
  },
  inviteToken: 'tok',
};

const CHIPS = ['Skin', 'Bright', 'Dark', '4', 'Save', 'Edit names', 'Fill from check-in', 'Undo last result', 'Reset'] as const;

async function seed(page: Page, seat: boolean) {
  await page.addInitScript(
    ({ seatOn, seatRecord }) => {
      localStorage.setItem('advantage.proUnlocked', '1');
      localStorage.setItem('advantage.coachUnlocked', '1');
      localStorage.setItem('advantage.whiteUnlocked', '1');
      localStorage.setItem('matboard.kidsScoreboard.v1', JSON.stringify({ enabled: true, skin: 'dinos', mascot: true }));
      localStorage.setItem('matboard.bracketTheme.v1', 'bright');
      localStorage.setItem(
        'matboard.tournament.v1',
        JSON.stringify({
          version: 2,
          activeId: 'bracket-1',
          saved: [
            {
              id: 'bracket-1',
              name: 'Save',
              updatedAt: 1,
              board: {
                version: 1,
                size: 4,
                placement: 'ibjjf',
                title: 'Sim Back Attacks Mock',
                entries: {
                  'sf-0-a': 'Ada Cruz',
                  'sf-0-b': 'Bea Ortiz',
                  'sf-1-a': 'Cam Diaz',
                  'sf-1-b': 'Dee Kim',
                },
                results: { 'sf-0': { winnerSide: 'a', call: 'win', method: 'points' } },
                lastOutcomeMatchId: 'sf-0',
              },
            },
          ],
        }),
      );
      if (!seatOn) return;
      localStorage.setItem(
        'matboard.pro.instructorSeats.v1',
        JSON.stringify({ version: 1, deviceGymId: 'gym-1', seats: [seatRecord] }),
      );
      localStorage.setItem(
        'matboard.pro.instructorSeatSession.v1',
        JSON.stringify({ version: 1, seatId: seatRecord.id }),
      );
    },
    { seatOn: seat, seatRecord: SEAT },
  );
}

function chip(page: Page, label: string) {
  return page.locator('.tournament__actions button').filter({ hasText: new RegExp(`^${label}$`) });
}

async function hitAtCenter(page: Page, label: string) {
  const button = chip(page, label);
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box, label).toBeTruthy();
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!(el instanceof HTMLElement)) return null;
    const owner = el.closest('button');
    return {
      text: (owner || el).textContent?.trim() ?? '',
      label: (owner || el).getAttribute('aria-label') ?? '',
    };
  }, point);
  expect(hit, `${label} center`).toBeTruthy();
  const text = hit!.text;
  const name = hit!.label;
  expect(
    text === label || name === label || name.startsWith(`${label},`) || name.startsWith(`${label} `),
    `${label} center hit ${text} / ${name}`,
  ).toBe(true);
  const titleBox = await page.locator('.tournament__center').boundingBox();
  const buttonBox = box!;
  const overlaps =
    titleBox &&
    !(
      buttonBox.x + buttonBox.width < titleBox.x ||
      titleBox.x + titleBox.width < buttonBox.x ||
      buttonBox.y + buttonBox.height < titleBox.y ||
      titleBox.y + titleBox.height < buttonBox.y
    );
  expect(overlaps, `${label} overlaps the title row`).toBe(false);
}

test('seat-bar toolbar chips receive the pointer, and only Fullscreen asks for fullscreen', async ({ page }) => {
  page.setDefaultTimeout(8_000);
  await seed(page, true);
  const widths = [
    { width: 1280, height: 690 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];

  for (const viewport of widths) {
    await page.setViewportSize(viewport);
    await page.goto('/tournament?from=suite');
    await expect(page.getByRole('region', { name: 'Instructor seat' })).toContainText('coach-bot-three@example.com');
    await expect(page.getByLabel('Division or class name')).toHaveValue('Sim Back Attacks Mock');
    for (const label of CHIPS) await hitAtCenter(page, label);
  }

  await page.setViewportSize({ width: 1280, height: 690 });
  await page.goto('/tournament?from=suite');
  await page.screenshot({ path: '/opt/cursor/artifacts/toolbar-1280-seat.png', fullPage: false });
  await page.evaluate(() => {
    const proto = Element.prototype as Element & { requestFullscreen: (options?: FullscreenOptions) => Promise<void> };
    const orig = proto.requestFullscreen;
    proto.requestFullscreen = function (this: Element, options?: FullscreenOptions) {
      const win = window as Window & { __fullscreenRequests?: number };
      win.__fullscreenRequests = (win.__fullscreenRequests || 0) + 1;
      return orig.call(this, options);
    };
  });

  const requests = () => page.evaluate(() => (window as Window & { __fullscreenRequests?: number }).__fullscreenRequests || 0);

  await chip(page, 'Dark').click();
  await expect(page.locator('main')).toHaveClass(/tournament--dark/);
  await page.screenshot({ path: '/opt/cursor/artifacts/toolbar-1280-seat-dark.png', fullPage: false });
  await chip(page, 'Bright').click();
  await expect(page.locator('main')).toHaveClass(/tournament--bright/);
  await page.screenshot({ path: '/opt/cursor/artifacts/toolbar-1280-seat-bright.png', fullPage: false });
  expect(await requests()).toBe(0);

  await page.locator('.tournament__roundline').click();
  await page.getByLabel('Division or class name').click();
  expect(await requests()).toBe(0);
  await expect(page.locator('main')).toHaveClass(/tournament--bright/);

  await chip(page, '4').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/toolbar-1280-seat-size.png', fullPage: false });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await chip(page, 'Skin').click();
  await expect(page.locator('.kids-skin__picker')).toBeVisible();
  await page.locator('.tournament__roundline').click();
  await expect(page.locator('.kids-skin__picker')).toBeHidden();

  await chip(page, 'Fill from check-in').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await chip(page, 'Edit names').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await chip(page, 'Save').click();
  await expect(page.getByRole('dialog', { name: 'Saved brackets' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  const undo = chip(page, 'Undo last result');
  if (await undo.isDisabled()) {
    await page.getByRole('button', { name: 'Win', exact: true }).first().click();
    await page.getByRole('button', { name: /^Points/ }).click();
  }
  await expect(undo).toBeEnabled();
  await undo.click();
  await chip(page, 'Reset').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  expect(await requests()).toBe(0);

  const fullscreen = page.locator('.tournament__actions .play-fs');
  if (await fullscreen.count()) {
    await page.addStyleTag({ content: '.play-fs--nudge { animation: none !important; }' });
    await fullscreen.click();
    expect(await requests()).toBe(1);
  }
});

test('toolbar chips stay clear of the title without a seat bar', async ({ page }) => {
  await seed(page, false);
  await page.setViewportSize({ width: 1280, height: 690 });
  await page.goto('/tournament?from=suite');
  await expect(page.getByRole('region', { name: 'Instructor seat' })).toHaveCount(0);
  for (const label of CHIPS) await hitAtCenter(page, label);
});
