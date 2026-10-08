import { expect, test, type Page } from '@playwright/test';

async function unlock(page: Page, pro: boolean) {
  await page.addInitScript((proOn) => {
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.whiteUnlocked', '1');
    if (proOn) localStorage.setItem('advantage.proUnlocked', '1');
    else localStorage.removeItem('advantage.proUnlocked');
  }, pro);
}

async function promotionBoxes(page: Page) {
  const date = page.getByLabel('Last promotion', { exact: true });
  const detail = page.getByLabel('Last promotion detail');
  await expect(date).toBeVisible();
  await expect(detail).toBeVisible();
  const dateBox = await date.boundingBox();
  const detailBox = await detail.boundingBox();
  expect(dateBox).toBeTruthy();
  expect(detailBox).toBeTruthy();
  return { dateBox: dateBox!, detailBox: detailBox! };
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return !(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1);
}

async function assertPromotionLayout(page: Page, wide: boolean) {
  const { dateBox, detailBox } = await promotionBoxes(page);
  expect(overlaps(dateBox, detailBox)).toBe(false);
  const sideBySide = Math.abs(dateBox.y - detailBox.y) < 28 && detailBox.x >= dateBox.x + dateBox.width - 8;
  const stacked =
    detailBox.y >= dateBox.y + dateBox.height - 8 && Math.abs(detailBox.x - dateBox.x) < 28;
  if (wide) expect(sideBySide, 'date and detail sit on one row').toBe(true);
  else expect(sideBySide || stacked, 'phone keeps the detail beside the date or directly under it').toBe(true);
}

async function shot(page: Page, name: string) {
  const group = page.locator('.roster-edit__promotion');
  await group.scrollIntoViewIfNeeded();
  await group.screenshot({ path: `/opt/cursor/artifacts/${name}.png` });
}

async function fillPromotion(page: Page, detail: string) {
  await page.getByLabel('Last promotion', { exact: true }).fill('2026-04-01');
  await page.getByLabel('Last promotion detail').fill(detail);
}

test('student roster add and edit keep the promotion date and detail together', async ({ page }) => {
  await unlock(page, false);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/roster?from=students');
  await page.getByRole('button', { name: 'Add student' }).click();
  await page.getByLabel('Student name').fill('Ada Cruz');
  await page.getByRole('radio', { name: 'White', exact: true }).click();
  await page.getByLabel('Division').fill('Kids Gi');
  await fillPromotion(page, '3rd stripe, white belt');
  await page.getByLabel('Student Notes').fill('Tape the knee');
  await assertPromotionLayout(page, true);
  await shot(page, 'roster-student-desktop');
  await page.getByRole('button', { name: 'Save student' }).click();
  await expect(page.getByRole('heading', { name: 'Ada Cruz' })).toBeVisible();
  await expect(page.locator('.roster-card__promotion')).toContainText('3rd stripe, white belt');
  await expect(page.locator('.roster-card__promotion')).toContainText('2026');

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Last promotion detail')).toHaveValue('3rd stripe, white belt');
  await expect(page.getByLabel('Last promotion', { exact: true })).toHaveValue('2026-04-01');
  await page.getByLabel('Last promotion detail').fill('blue belt');
  await page.getByRole('button', { name: 'Save student' }).click();
  await expect(page.locator('.roster-card__promotion')).toContainText('blue belt');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Edit' }).click();
  await assertPromotionLayout(page, false);
  await shot(page, 'roster-student-phone');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
});

test('competitor roster check-in, notes, and CSV keep the promotion detail', async ({ page }) => {
  await unlock(page, true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/roster?from=competitors');
  await page.getByRole('button', { name: 'Add competitor', exact: true }).first().click();
  await page.getByLabel('Competitor name').fill('Bea Ortiz');
  await page.getByRole('radio', { name: 'Blue', exact: true }).click();
  await page.getByLabel('Division').fill('Adult Blue');
  await page.getByLabel('Gym name / nickname').fill('GB Ellijay');
  await fillPromotion(page, 'blue belt');
  await page.getByLabel('Competitor Notes').fill('Left knee');
  await assertPromotionLayout(page, true);
  await shot(page, 'roster-competitor-desktop');
  await page.getByRole('button', { name: 'Save competitor' }).click();

  const card = page.locator('.roster-card', { hasText: 'Bea Ortiz' });
  await expect(card.locator('.roster-card__promotion')).toContainText('blue belt');
  await card.getByRole('button', { name: 'Check In Bea Ortiz' }).click();
  await expect(card.getByRole('button', { name: 'Check In Bea Ortiz' })).toHaveAttribute('aria-pressed', 'true');

  await card.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Competitor Notes')).toHaveValue('Left knee');
  await expect(page.getByLabel('Division')).toHaveValue('Adult Blue');
  await expect(page.getByLabel('Last promotion detail')).toHaveValue('blue belt');
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  const exported = await download.createReadStream().then(
    (stream) =>
      new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('error', reject);
      }),
  );
  expect(exported).toContain('Last promotion detail');
  expect(exported).toContain('blue belt');
  expect(exported).toContain('2026-04-01');

  await page.getByLabel('Import roster CSV').setInputFiles({
    name: 'legacy.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Belt,Last promotion,Notes\nPat Lee,Purple,2026-02-02,Quiet\n'),
  });
  await expect(page.getByRole('heading', { name: 'Pat Lee' })).toBeVisible();
  const pat = page.locator('.roster-card', { hasText: 'Pat Lee' });
  await expect(pat.locator('.roster-card__promotion')).toContainText('2026');
  await expect(pat.locator('.roster-card__promotion')).not.toContainText('stripe');

  await page.getByLabel('Import roster CSV').setInputFiles({
    name: 'detail.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Name,Belt,Last promotion,Last promotion detail\nCam Diaz,Brown,2026-05-05,"3rd stripe, white belt"\n',
    ),
  });
  const cam = page.locator('.roster-card', { hasText: 'Cam Diaz' });
  await expect(cam.locator('.roster-card__promotion')).toContainText('3rd stripe, white belt');

  await page.setViewportSize({ width: 390, height: 844 });
  await cam.getByRole('button', { name: 'Edit' }).click();
  await assertPromotionLayout(page, false);
  await shot(page, 'roster-competitor-phone');
});

test('bracket and scoreboard name pickers still fill the name only', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem(
      'matboard.roster.v1',
      JSON.stringify({
        version: 1,
        students: [
          {
            id: 'ada',
            name: 'Ada Cruz',
            belt: 'White',
            division: 'Kids Gi',
            gym: '',
            photo: '',
            lastPromotion: '2026-04-01',
            lastPromotionDetail: '3rd stripe, white belt',
            note: 'Tape',
            checkedIn: false,
            rosterList: 'student',
          },
          {
            id: 'bea',
            name: 'Bea Ortiz',
            belt: 'Blue',
            division: 'Adult Blue',
            gym: 'GB Ellijay',
            photo: '',
            lastPromotion: '2026-04-01',
            lastPromotionDetail: 'blue belt',
            note: 'Knee',
            checkedIn: true,
          },
        ],
        ready: {},
        gamePlans: {},
      }),
    );
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tournament?from=coach');
  await page.getByRole('button', { name: 'Edit names' }).first().click();
  await page.getByRole('textbox', { name: 'Student name 1', exact: true }).click();
  await page.getByRole('button', { name: /Ada Cruz/ }).click();
  await expect(page.getByRole('textbox', { name: 'Student name 1', exact: true })).toHaveValue('Ada Cruz');

  await page.goto('/tournament?from=suite');
  await page.getByRole('button', { name: 'Edit names' }).first().click();
  await page.getByRole('textbox', { name: 'Competitor 2', exact: true }).click();
  await page.getByRole('button', { name: /Bea Ortiz/ }).click();
  await expect(page.getByRole('textbox', { name: 'Competitor 2', exact: true })).toHaveValue('Bea Ortiz');

  await page.goto('/match/control?from=suite');
  await page.getByLabel('Blue name').click();
  await page.getByRole('dialog').getByLabel('Competitor name').fill('Bea');
  await page.getByRole('button', { name: /Bea Ortiz/ }).click();
  await expect(page.getByLabel('Blue name')).toHaveValue('Bea Ortiz');
});
