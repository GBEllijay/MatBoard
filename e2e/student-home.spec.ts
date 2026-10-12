import { expect, test, type Page } from '@playwright/test';
import { FULL_OWNER_UNLOCK_CODE, PRO_UNLOCK_CODE } from '../src/lib/proUnlock.ts';

const BACK = 'Back. Hold for Home.';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: true });
}

test('home picker keeps White, Coach, and Pro and adds locked Student Edition', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const titles = page.locator('.home__modes .mode-card strong');
  await expect(titles).toHaveText([
    'Advantage White',
    'Advantage – Student Edition',
    'Advantage Coach',
    'Advantage Pro',
  ]);

  const white = page.locator('.mode-card--white');
  await expect(white.getByRole('link', { name: 'Advantage White' })).toHaveAttribute('href', '/buy');
  await expect(white.getByRole('link', { name: 'Buy — $9.99' })).toHaveAttribute('href', '/buy');
  await expect(white.getByRole('link', { name: 'advantageappllc@gmail.com' })).toBeVisible();
  await expect(white).toContainText('White is in alpha testing.');
  await expect(white).not.toContainText(/free/i);
  await expect(page.locator('.mode-card--coach')).toContainText('Coach is in alpha testing.');
  await expect(page.locator('.mode-card--pro')).toContainText('Pro is in alpha testing.');
  await expect(page.locator('.mode-card--student')).toContainText('Student Edition is in alpha testing.');

  const student = page.locator('.mode-card--student');
  await expect(student).toContainText('$19.99 one-time');
  await expect(student).toContainText('Your jiu-jitsu journal');
  await expect(student.getByRole('link', { name: 'advantageappllc@gmail.com' })).toBeVisible();
  const spine = student.locator('.leather-spine');
  await expect(spine).toBeVisible();
  const grain = await spine.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(grain).toContain('black-leather-grain.png');
  const stitch = await spine.evaluate((el) => getComputedStyle(el, '::before').borderLeftStyle);
  expect(stitch).toBe('dashed');
  const spineWidth = await spine.evaluate((el) => parseFloat(getComputedStyle(el).width));
  expect(spineWidth).toBeGreaterThanOrEqual(16);
  expect(spineWidth).toBeLessThanOrEqual(20);

  await shot(page, 'home-picker-390');
  await student.screenshot({ path: '/opt/cursor/artifacts/student-button-closeup.png' });

  await page.getByRole('button', { name: 'Advantage Student Edition, coming soon' }).click();
  const dialog = page.getByRole('dialog', { name: 'Advantage – Student Edition' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Price: $19.99 one-time when it launches. Not for sale on this page.')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'advantageappllc@gmail.com' })).toBeVisible();
  await expect(dialog).toContainText('Student Edition is in alpha testing.');
  await expect(dialog).not.toContainText(/free/i);
  await expect(dialog.getByRole('button', { name: 'Owner unlock' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Buy/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Advantage Coach, coming soon' }).click();
  await expect(page.getByRole('dialog', { name: 'Advantage Coach' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Owner unlock' })).toBeVisible();
  await expect(page.getByText('Price: $29.99 one-time when it launches. Not for sale on this page.')).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();

  await page.getByRole('button', { name: 'Advantage Pro, coming soon' }).click();
  await expect(page.getByRole('dialog', { name: 'Advantage Pro' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Owner unlock' })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();

  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, 'home-picker-desktop');
});

test('?student=1 opens the Student hub, and submenus go back to it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?student=1');
  await page.getByRole('link', { name: 'Open Student Edition', exact: true }).click();
  await expect(page).toHaveURL(/\/student\?student=1$/);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/?student=1');
  const journal = page.getByRole('link', { name: 'Journal', exact: true });
  await expect(journal).toBeVisible();
  await expect(journal).toHaveCSS('background-color', 'rgb(244, 240, 228)');
  await expect(journal).toHaveCSS('font-family', /Patrick Hand/);
  const rules = await journal.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(rules).toContain('repeating-linear-gradient');
  await expect(page.getByRole('link', { name: 'Journal cards', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fundamentals', exact: true })).toBeVisible();
  await expect(page.locator('.student-hub__stamp')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Belt progress', exact: true })).toBeVisible();
  await shot(page, 'student-hub-390');

  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
  await expect(page.getByText('Coming soon.')).toHaveCount(0);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/student?student=1');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/?student=1');
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect(page).toHaveURL(/\/student\?student=1$/);

  await page.getByRole('link', { name: 'Belt progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Belt progress' })).toBeVisible();
  await expect(page.getByText('Coming soon.')).toHaveCount(0);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/\?student=1$/);
  await expect(page.getByRole('link', { name: 'Open Student Edition', exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/student?student=1');
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveCount(0);
  await shot(page, 'student-hub-desktop');
});

test('a direct /student visit stays closed, and sign out still leaves the seat', async ({ page }) => {
  await page.goto('/student');
  await expect(page.getByText('This preview opens with the owner unlock, or with ?student=1 on the address.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Journal', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Advantage Student Edition, coming soon' })).toBeVisible();

  await page.addInitScript(() => {
    const seat = {
      id: 'seat-coach',
      gymId: 'gym-1',
      email: 'coach@example.com',
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
    localStorage.setItem(
      'matboard.pro.instructorSeats.v1',
      JSON.stringify({ version: 1, deviceGymId: 'gym-1', seats: [seat] }),
    );
    localStorage.setItem(
      'matboard.pro.instructorSeatSession.v1',
      JSON.stringify({ version: 1, seatId: seat.id }),
    );
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign out of seat' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Advantage Student Edition, coming soon' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out of seat' }).click();
  await expect(page.getByText('Signed out')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Advantage Coach, coming soon' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/buy');
});

test('Student Edition owner unlock opens the hub from the locked card', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Advantage Student Edition, coming soon' }).click();
  await page.getByRole('button', { name: 'Owner unlock' }).click();
  await expect(page.getByRole('dialog', { name: 'Owner unlock' })).toBeVisible();
  await page.getByPlaceholder('Owner code').fill('not-a-code');
  await page.getByRole('button', { name: 'Unlock Student Edition' }).click();
  await expect(page.getByText('That code did not match.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Advantage Student Edition, coming soon' })).toBeVisible();

  await page.getByPlaceholder('Owner code').fill(FULL_OWNER_UNLOCK_CODE);
  await page.getByRole('button', { name: 'Unlock Student Edition' }).click();

  const openStudent = page.getByRole('link', { name: 'Open Student Edition', exact: true });
  await expect(openStudent).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/white');
  await openStudent.click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('link', { name: 'Journal', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fundamentals', exact: true })).toBeVisible();

  await page.goto('/pro');
  await page.getByRole('button', { name: 'Lock Pro' }).click();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Advantage Student Edition, coming soon' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await page.goto('/student');
  await expect(page.getByRole('link', { name: 'Journal', exact: true })).toHaveCount(0);
});

test('full owner URL params open Student Edition', async ({ browser }) => {
  for (const param of ['unlock', 'pro', 'coach', 'student'] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/?${param}=${FULL_OWNER_UNLOCK_CODE}`);
    const openStudent = page.getByRole('link', { name: 'Open Student Edition', exact: true });
    await expect(openStudent).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(FULL_OWNER_UNLOCK_CODE, 'i'));
    if (param === 'student') await expect(page).not.toHaveURL(/[?&]student=/);
    await openStudent.click();
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole('link', { name: 'Journal', exact: true })).toBeVisible();
    await context.close();
  }
});

test('the Pro owner code opens the Student Edition card', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Advantage Pro, coming soon' }).click();
  await page.getByRole('button', { name: 'Owner unlock' }).click();
  await page.getByPlaceholder('Owner code').fill(PRO_UNLOCK_CODE);
  await page.getByRole('button', { name: 'Unlock Pro' }).click();

  const openStudent = page.getByRole('link', { name: 'Open Student Edition', exact: true });
  await expect(openStudent).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/buy');
  await openStudent.click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('link', { name: 'Journal', exact: true })).toBeVisible();
});

test('the full owner unlock code opens the Student Edition hub', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Advantage Coach, coming soon' }).click();
  await page.getByRole('button', { name: 'Owner unlock' }).click();
  await page.getByPlaceholder('Owner code').fill(FULL_OWNER_UNLOCK_CODE);
  await page.getByRole('button', { name: 'Unlock Coach' }).click();

  const openStudent = page.getByRole('link', { name: 'Open Student Edition', exact: true });
  await expect(openStudent).toBeVisible();
  await openStudent.click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('link', { name: 'Journal', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Fundamentals', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/fundamentals$/);
  await expect(page.getByRole('heading', { name: 'Fundamentals' })).toBeVisible();

  await page.goto('/pro');
  await page.getByRole('button', { name: 'Lock Pro' }).click();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Advantage Student Edition, coming soon' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/white');
  await page.goto('/student');
  await expect(page.getByRole('link', { name: 'Journal', exact: true })).toHaveCount(0);
});
