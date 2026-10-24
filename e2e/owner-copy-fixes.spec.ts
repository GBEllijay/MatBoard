import { expect, test, type Page } from '@playwright/test';

const SEAT = {
  id: 'seat-coach',
  gymId: 'gym-1',
  email: 'coach-bot@example.com',
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

async function seedSeat(page: Page, pro: boolean) {
  await page.addInitScript(
    ({ seat, proOn }) => {
      if (proOn) localStorage.setItem('advantage.proUnlocked', '1');
      localStorage.setItem(
        'matboard.pro.instructorSeats.v1',
        JSON.stringify({ version: 1, deviceGymId: 'gym-1', seats: [seat] }),
      );
      localStorage.setItem('matboard.pro.instructorSeatSession.v1', JSON.stringify({ version: 1, seatId: seat.id }));
    },
    { seat: SEAT, proOn: pro },
  );
}

test('backup explains the four real file names', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/backup?student=1');
  await expect(page.getByRole('heading', { name: 'Backup & Print', exact: true })).toBeVisible();

  const names = await page.evaluate(() => {
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return [
      `advantage-student-backup-${day}.json`,
      `advantage-student-templates-${day}.csv`,
      `advantage-student-progress-${day}.pdf`,
      `advantage-student-self-assessment-${day}.pdf`,
    ];
  });

  const guide = page.getByRole('region', { name: 'What the four backup files are' });
  await expect(guide.getByRole('heading', { name: 'What the four files are for' })).toBeVisible();
  await expect(guide.getByText(names[0], { exact: true })).toBeVisible();
  await expect(guide.getByText(names[1], { exact: true })).toBeVisible();
  await expect(guide.getByText(names[2], { exact: true })).toBeVisible();
  await expect(guide.getByText(names[3], { exact: true })).toBeVisible();
  await expect(guide.getByText(/Use this file to restore with Merge or Replace/)).toBeVisible();
  await expect(guide.getByText(/open the rows in Excel or Sheets/)).toBeVisible();
  await expect(guide.getByText(/page to print or hand to your coach/)).toBeVisible();
  await expect(guide.getByText(/only the self-assessment/)).toBeVisible();

  await expect(page.getByRole('checkbox', { name: 'Include video files kept on this device' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back up my journal' })).toBeVisible();
  await expect(page.getByLabel('Restore from backup')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Print progress report', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Print self-assessment', exact: true })).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/backup-file-guide-390.png', fullPage: true });
});

test('drill notes and stop-doing notes stay separate and old combined notes still read', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/journal?student=1');
  await expect(page.getByRole('heading', { name: 'Journal', exact: true })).toBeVisible();
  await expect(page.getByText('What you drilled and what to remember.')).toBeVisible();
  await expect(page.getByText('Mistakes to stop making.')).toBeVisible();
  const drill = page.getByRole('textbox', { name: 'Drill notes', exact: true });
  const stop = page.getByRole('textbox', { name: 'Stop doing', exact: true });
  await expect(drill).toBeVisible();
  await expect(stop).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Drills', exact: true })).toBeVisible();
  await stop.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/opt/cursor/artifacts/journal-drill-and-stop-notes-390.png' });

  await page.getByRole('textbox', { name: 'Class', exact: true }).fill('Fundamentals');
  await drill.fill('collar deeper');
  await stop.fill('posting the near hand');
  await page.getByRole('textbox', { name: 'Drills', exact: true }).fill('hip escapes');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByRole('heading', { name: 'Journal card', exact: true })).toBeVisible();
  await expect(page.getByText('Drill notes: collar deeper')).toBeVisible();
  await expect(page.getByText('Stop doing: posting the near hand')).toBeVisible();
  await expect(page.getByText('Drills: hip escapes')).toBeVisible();
  await page.getByText('Stop doing: posting the near hand').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/opt/cursor/artifacts/journal-card-separated-notes-390.png' });

  await page.evaluate(() => {
    const key = 'matboard.studentEdition.v1';
    const report = JSON.parse(localStorage.getItem(key) ?? '{}') as { journal: { body: string }[] };
    report.journal[0].body = 'Class: Gi\nDrills: hip escapes\nRolls: 5 rounds\nNotes:\ncollar deeper and I keep posting';
    localStorage.setItem(key, JSON.stringify(report));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Journal card', exact: true })).toBeVisible();
  await expect(page.getByText('Drill notes: collar deeper and I keep posting')).toBeVisible();
  await expect(page.getByText('Stop doing: —')).toBeVisible();
  await expect(page.getByText('Drills: hip escapes')).toBeVisible();

  await page.getByRole('link', { name: /^Edit / }).click();
  await expect(page.getByRole('textbox', { name: 'Edit drill notes' })).toHaveValue('collar deeper and I keep posting');
  await expect(page.getByRole('textbox', { name: 'Edit stop doing' })).toHaveValue('');

  await page.evaluate(() => {
    const key = 'matboard.studentEdition.v1';
    const report = JSON.parse(localStorage.getItem(key) ?? '{}') as { journal: { body: string }[] };
    report.journal[0].body = 'Class: Gi\nDrills: hip escapes\nRolls: 5 rounds\nNotes:\ncollar deeper\nStop doing:\nposting the near hand';
    localStorage.setItem(key, JSON.stringify(report));
  });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Edit drill notes' })).toHaveValue('collar deeper');
  await expect(page.getByRole('textbox', { name: 'Edit stop doing' })).toHaveValue('posting the near hand');
  await expect(page.getByRole('textbox', { name: 'Edit drills' })).toHaveValue('hip escapes');
  await page.getByRole('button', { name: 'Save card' }).click();
  await expect(page.getByText('Drill notes: collar deeper')).toBeVisible();
  await expect(page.getByText('Stop doing: posting the near hand')).toBeVisible();
  await expect(page.getByText('Drills: hip escapes')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Stop doing: posting the near hand')).toBeVisible();
  await expect(page.getByText('Drill notes: collar deeper')).toBeVisible();
});

test('fundamentals drops live or better and still filters level 3 and above', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto('/student/fundamentals?student=1');
  await expect(page.getByRole('heading', { name: 'Fundamentals', exact: true })).toBeVisible();
  await expect(page.getByText(/Average level · 0 of \d+ ready when a partner resists/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Against resistance', exact: true })).toBeVisible();
  await expect(page.getByText(/live or better/i)).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Scissor sweep 3 Live with resistance' })).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/fundamentals-plain-resistance-390.png' });

  const sweeps = page.getByRole('region', { name: 'Sweeps' });
  await sweeps.getByRole('radio', { name: 'Scissor sweep 3 Live with resistance' }).click();
  await expect(sweeps.getByText('1 of 5 ready when a partner resists')).toBeVisible();
  await page.getByRole('button', { name: 'Against resistance', exact: true }).click();
  await expect(sweeps.getByRole('heading', { name: 'Scissor sweep', exact: true })).toBeVisible();
  await expect(sweeps.getByRole('heading', { name: 'Hip bump sweep', exact: true })).toHaveCount(0);
});

test('the coach seat bar is hidden in Student Edition and stays on coach pages', async ({ browser }) => {
  const seated = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await seated.newPage();
  await seedSeat(page, true);

  await page.goto('/student?student=1');
  await expect(page.getByRole('heading', { name: /Advantage . Student Edition/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Instructor seat' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out of seat' })).toHaveCount(0);
  await expect(page.getByText(/seats remaining/)).toHaveCount(0);
  await expect(page.getByText(/of 10 seats/)).toHaveCount(0);
  await page.screenshot({ path: '/opt/cursor/artifacts/student-hub-no-seat-bar-390.png' });

  await page.goto('/student/backup?student=1');
  await expect(page.getByRole('heading', { name: 'Backup & Print', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Instructor seat' })).toHaveCount(0);

  await page.goto('/coach');
  await expect(page.getByRole('heading', { name: 'Advantage - Coach' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Instructor seat' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out of seat' })).toBeVisible();
  await expect(page.getByText('coach-bot@example.com')).toBeVisible();

  await page.goto('/coach-unlimited');
  await expect(page.getByRole('heading', { name: 'Advantage - Coach Unlimited' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out of seat' })).toBeVisible();

  await page.goto('/pro');
  await expect(page.getByRole('heading', { name: 'Advantage Pro', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out of seat' })).toBeVisible();
  await seated.close();

  const owner = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ownerPage = await owner.newPage();
  await ownerPage.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
  });
  await ownerPage.goto('/instructors');
  await expect(ownerPage.getByRole('heading', { name: 'Instructor Invitations and Access Management' })).toBeVisible();
  await expect(ownerPage.locator('.invite-seat-cap__count')).toHaveText('0 of 10 seats used');
  await expect(ownerPage.locator('.invite-seat-cap__remaining')).toHaveText('10 seats remaining');
  await expect(ownerPage.locator('.binder-list__seats')).toContainText('0 of 10 seats used');
  await expect(ownerPage.locator('.binder-list__seats')).toContainText('10 seats remaining');
  await expect(ownerPage.getByRole('button', { name: 'Issue invite' })).toBeVisible();
  await owner.close();
});
