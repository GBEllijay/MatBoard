import { expect, test, type Locator, type Page } from '@playwright/test';

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    const plan = {
      version: 1,
      id: 'plan-review',
      coachName: 'Alex',
      classDesignation: 'GB1',
      classTime: '5:00 PM',
      intro: 'Passing series.',
      introExpected: '',
      warmupNote: '',
      warmupExpected: '',
      techniques: [
        { id: 't1', slotId: 's1', title: '', notes: '', expected: '', waterBreak: false },
        { id: 't2', slotId: 's2', title: '', notes: '', expected: '', waterBreak: false },
        { id: 't3', slotId: 's3', title: '', notes: '', expected: '', waterBreak: false },
      ],
      specificNote: '',
      specificExpected: '',
      cooldownNote: '',
      cooldownExpected: '',
      closing: 'Bow.',
    };
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    localStorage.setItem(
      'matboard.coach.trainingNotes.v1',
      JSON.stringify({ version: 3, days: { [dateKey]: { plans: [plan] } } }),
    );
    localStorage.setItem(
      'matboard.pro.lessonDriveQueue.v1',
      JSON.stringify({
        version: 1,
        revisions: [
          {
            revisionId: `draft:${dateKey}:alex:plan-review`,
            dateKey,
            coachName: 'Alex',
            savedAt: 1,
            kind: 'draft',
            driveFileId: null,
            status: 'waiting-for-drive',
            plan,
            media: [],
          },
        ],
      }),
    );
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: false });
}

async function fillColor(locator: Locator) {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

test('a second submit keeps the first proposal in version history', async ({ page }) => {
  await unlock(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/notes?plan=unlimited');
  await expect(page.getByLabel('Intro')).toHaveValue('Passing series.');
  const submit = page.getByRole('complementary', { name: 'Submit for review' });
  await expect(submit.getByText('Submit for review saves a proposed copy.')).toBeVisible();
  await submit.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Sent for review.')).toBeVisible();

  await page.getByLabel('Intro').fill('Passing series, second.');
  await submit.getByRole('button', { name: 'Submit for review' }).click();
  const history = page.getByRole('region', { name: 'Version history' });
  const version2 = history.getByRole('button', { name: 'Version 2 · Waiting for review' });
  const version1 = history.getByRole('button', { name: 'Version 1 · Waiting for review' });
  await expect(version2).toBeVisible();
  await expect(version1).toBeVisible();
  await expect(history.getByText('Intro: Passing series. → Passing series, second.')).toBeVisible();
  await expect(history.getByText('Passing series, second.', { exact: true })).toBeVisible();
  expect(await fillColor(version2)).toBe('rgb(0, 78, 186)');
  await version1.click();
  await expect(version1).toHaveAttribute('aria-expanded', 'true');
  await expect(history.getByText('Passing series.', { exact: true })).toBeVisible();
  expect(await fillColor(version1)).toBe('rgb(0, 78, 186)');
  await shot(page, 'lesson-versions-desktop');

  await page.goto('/coach-unlimited');
  await page.getByRole('link', { name: /Alex · GB1 5:00 PM · .+ · Draft/ }).click();
  await expect(page).toHaveURL(/\/review\?revision=/);
  const reviewHistory = page.getByRole('region', { name: 'Version history' });
  await expect(reviewHistory.getByRole('button', { name: 'Version 1 · Waiting for review' })).toBeVisible();
  await expect(reviewHistory.getByRole('button', { name: 'Version 2 · Waiting for review' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('article', { name: 'This submission' }).getByText('Approved', { exact: true })).toBeVisible();
  await expect(reviewHistory.getByRole('button', { name: 'Version 2 · Approved' })).toBeVisible();
  await expect(reviewHistory.getByRole('button', { name: 'Version 1 · Waiting for review' })).toBeVisible();
  await reviewHistory.getByRole('button', { name: 'Version 1 · Waiting for review' }).click();
  await expect(reviewHistory.getByText('Passing series.', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'lesson-versions-phone');
});
