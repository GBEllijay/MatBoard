import { expect, test, type Page } from '@playwright/test';

const BACK = 'Back. Hold for Home.';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: true });
}

/** Capture a group page only after that page's heading is on screen. */
async function shotGroup(page: Page, heading: string, name: string) {
  const title = page.getByRole('heading', { name: heading, exact: true });
  await expect(title).toBeVisible();
  await expect(title).toHaveText(heading);
  await expect(page.locator('main.s-group')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: true });
}

test('home picker keeps White, Coach, and Pro and adds locked Student Edition', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products');

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
  await expect(student).toContainText('personal BJJ training journal');
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
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/products?student=1');
  const training = page.getByRole('link', { name: 'Training & Journal', exact: true });
  await expect(training).toBeVisible();
  await expect(training).toHaveCSS('font-family', /Inter/);
  const leather = await training.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(leather).toContain('black-leather-grain.png');
  await expect(page.getByText('No event yet')).toBeVisible();
  await expect(page.getByText('No matches yet')).toBeVisible();
  await expect(page.locator('.student-menu-home .site-footer a[href^="mailto:"]')).toHaveCSS('color', 'rgb(0, 78, 186)');
  await expect(page.getByRole('link', { name: 'Rank & Progress', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Competitor', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Coach & Academy', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Backup & Print/ })).toBeVisible();
  await expect(page.locator('summary')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Journal', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Fundamentals', exact: true })).toHaveCount(0);
  const tileHeight = await training.evaluate((el) => el.getBoundingClientRect().height);
  expect(tileHeight).toBeGreaterThanOrEqual(88);
  await expect(page.getByRole('heading', { name: 'Advantage – Student Edition', exact: true })).toBeVisible();
  await shot(page, 'hub-rank-card-272-390');

  await page.getByRole('link', { name: 'Training & Journal', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/training/);
  await shotGroup(page, 'Training & Journal', 'group-training-journal-390');
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: 'Rank & Progress', exact: true }).click();
  const homeMark = page.getByRole('link', { name: 'Home', exact: true });
  const rankTitle = page.getByRole('heading', { name: 'Rank & Progress', exact: true });
  await expect(homeMark).toBeVisible();
  await expect(rankTitle).toBeVisible();
  const homeBox = await homeMark.boundingBox();
  const rankTitleBox = await rankTitle.boundingBox();
  expect(homeBox).not.toBeNull();
  expect(rankTitleBox).not.toBeNull();
  expect(rankTitleBox!.y).toBeGreaterThan(homeBox!.y + homeBox!.height - 1);
  const homeImage = await homeMark.locator('img').evaluate((img) => img.getBoundingClientRect().width);
  const backImage = await page.getByRole('link', { name: BACK, exact: true }).locator('img').evaluate((img) => img.getBoundingClientRect().width);
  expect(homeImage).toBeGreaterThan(backImage);
  const rankRows = await page.locator('a.s-row--belt').evaluateAll((nodes) =>
    nodes.map((node) => {
      const title = node.querySelector('.s-row__title');
      const chev = node.querySelector('.s-chev');
      const rail = node.querySelector('.belt-rail');
      const rowBox = node.getBoundingClientRect();
      const chevBox = chev?.getBoundingClientRect();
      const style = getComputedStyle(node);
      const railStyle = rail ? getComputedStyle(rail) : null;
      const stripeClass = rail ? [...rail.classList].find((name) => name.startsWith('belt-rail--stripes-')) ?? '' : '';
      return {
        stripes: node.getAttribute('data-stripes'),
        stripeClass,
        white: rail?.classList.contains('belt-rail--white') ?? false,
        degrees: rail?.classList.contains('belt-rail--degrees') ?? false,
        rightBelt: Boolean(node.querySelector('.s-belt')),
        wrapped: title ? title.scrollWidth > title.clientWidth + 1 || title.getBoundingClientRect().height > 28 : true,
        background: style.backgroundImage,
        railWeave: railStyle?.backgroundImage ?? '',
        chevronInside: Boolean(
          chevBox && chevBox.width > 0 && chevBox.left >= rowBox.left && chevBox.right <= rowBox.right + 0.5,
        ),
      };
    }),
  );
  expect(rankRows.map((row) => row.stripes)).toEqual(['1', '2', '3', '4']);
  expect(rankRows.map((row) => row.stripeClass)).toEqual([
    'belt-rail--stripes-1',
    'belt-rail--stripes-2',
    'belt-rail--stripes-3',
    'belt-rail--stripes-4',
  ]);
  expect(rankRows.every((row) => row.white && row.degrees && !row.rightBelt && !row.wrapped && row.chevronInside)).toBeTruthy();
  expect(rankRows.every((row) => row.background.includes('belt-weave.png') && row.railWeave.includes('belt-weave.png'))).toBeTruthy();
  const mat = await page.locator('main.s-group').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(mat).toContain('home-mat-tatami.png');
  await shotGroup(page, 'Rank & Progress', 'rank-progress-left-rail-390');
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: 'Competitor', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/compete/);
  await shotGroup(page, 'Competitor', 'group-competitor-390');
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: 'Coach & Academy', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/coach/);
  await shotGroup(page, 'Coach & Academy', 'group-coach-academy-390');
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: /Backup & Print/ }).click();
  await expect(page).toHaveURL(/\/student\/backup/);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const covered = await page.locator('main.s-group').evaluate((el) => {
    const box = el.getBoundingClientRect();
    const image = getComputedStyle(el).backgroundImage;
    return {
      image: image.includes('home-mat-tatami.png'),
      covers: box.top <= 0 && box.bottom >= window.innerHeight - 1,
    };
  });
  expect(covered.image).toBeTruthy();
  expect(covered.covers).toBeTruthy();
  await shotGroup(page, 'Backup & Print', 'group-backup-print-390');
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect(page).toHaveURL(/\/student\?student=1$/);

  await page.getByRole('link', { name: 'Training & Journal', exact: true }).click();
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
  await expect(page.getByText('Coming soon.')).toHaveCount(0);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/student/training?student=1');
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/products?student=1');
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await page.getByRole('link', { name: BACK, exact: true }).click();
  await expect(page).toHaveURL(/\/student\?student=1$/);

  await page.getByRole('link', { name: 'Rank & Progress', exact: true }).click();
  await page.getByRole('link', { name: 'Belt progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Belt progress' })).toBeVisible();
  await expect(page.getByText('Coming soon.')).toHaveCount(0);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/products\?student=1$/);
  await expect(page.getByRole('link', { name: 'Open Student Edition', exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/student?student=1');
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveCount(0);
  await shot(page, 'student-hub-desktop');
  await page.goto('/student/compete?student=1');
  const wide = await page.locator('main.s-group').evaluate((el) => {
    const box = el.getBoundingClientRect();
    return getComputedStyle(el).backgroundImage.includes('home-mat-tatami.png') && box.height >= window.innerHeight - 1;
  });
  expect(wide).toBeTruthy();
  const competeTitle = await page.getByRole('heading', { name: 'Competitor', exact: true }).boundingBox();
  const wideHome = await page.getByRole('link', { name: 'Home', exact: true }).boundingBox();
  expect(competeTitle && wideHome).toBeTruthy();
  expect(competeTitle!.y).toBeGreaterThan(wideHome!.y + wideHome!.height - 1);
});

test('a direct /student visit stays closed, and sign out still leaves the seat', async ({ page }) => {
  await page.goto('/student');
  await expect(page.getByText('This preview opens with the owner unlock, or with ?student=1 on the address.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Training & Journal', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/products$/);
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
  await page.goto('/products');
  await expect(page.getByRole('button', { name: 'Sign out of seat' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Advantage Student Edition, coming soon' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out of seat' }).click();
  await expect(page.getByText('Signed out')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Advantage Coach, coming soon' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/buy');
});

test('Student Edition owner unlock opens the hub from the locked card', async ({ page }) => {
  await page.goto('/products');
  await page.getByRole('button', { name: 'Advantage Student Edition, coming soon' }).click();
  await page.getByRole('button', { name: 'Owner unlock' }).click();
  await expect(page.getByRole('dialog', { name: 'Owner unlock' })).toBeVisible();
  await page.getByPlaceholder('Owner code').fill('not-a-code');
  await page.getByRole('button', { name: 'Unlock Student Edition' }).click();
  await expect(page.getByText('That code did not match.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Advantage Student Edition, coming soon' })).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.studentEditionUnlocked', '1');
  });
  await page.reload();

  const openStudent = page.getByRole('link', { name: 'Open Student Edition', exact: true });
  await expect(openStudent).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/white');
  await openStudent.click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('link', { name: 'Training & Journal', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Rank & Progress', exact: true })).toBeVisible();

  await page.goto('/pro');
  await page.getByRole('button', { name: 'Lock Pro' }).click();
  await page.goto('/products');
  await expect(page.getByRole('button', { name: 'Advantage Student Edition, coming soon' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await page.goto('/student');
  await expect(page.getByRole('link', { name: 'Training & Journal', exact: true })).toHaveCount(0);
});

test('URL params do not unlock a tier', async ({ browser }) => {
  for (const param of ['unlock', 'pro', 'coach', 'student'] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/?${param}=1`);
    if (param === 'student') {
      await expect(page.getByRole('link', { name: 'Open demo', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toHaveCount(0);
      await context.close();
      continue;
    }
    await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open demo', exact: true })).toHaveCount(0);
    await context.close();
  }
});

test('the Pro owner code opens the Student Edition card', async ({ page }) => {
  await page.goto('/products');
  await page.getByRole('button', { name: 'Advantage Pro, coming soon' }).click();
  await page.getByRole('button', { name: 'Owner unlock' }).click();
  await page.evaluate(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.studentEditionUnlocked', '1');
  });
  await page.reload();

  const openStudent = page.getByRole('link', { name: 'Open Student Edition', exact: true });
  await expect(openStudent).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/buy');
  await openStudent.click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('link', { name: 'Training & Journal', exact: true })).toBeVisible();
});

test('the full owner unlock code opens the Student Edition hub', async ({ page }) => {
  await page.goto('/products');
  await page.getByRole('button', { name: 'Advantage Coach, coming soon' }).click();
  await page.getByRole('button', { name: 'Owner unlock' }).click();
  await page.evaluate(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.studentEditionUnlocked', '1');
  });
  await page.reload();

  const openStudent = page.getByRole('link', { name: 'Open Student Edition', exact: true });
  await expect(openStudent).toBeVisible();
  await openStudent.click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('link', { name: 'Training & Journal', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Rank & Progress', exact: true }).click();
  await page.getByRole('link', { name: 'Fundamentals', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/fundamentals$/);
  await expect(page.getByRole('heading', { name: 'Fundamentals' })).toBeVisible();

  await page.goto('/pro');
  await page.getByRole('button', { name: 'Lock Pro' }).click();
  await page.goto('/products');
  await expect(page.getByRole('button', { name: 'Advantage Student Edition, coming soon' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Advantage White/ })).toHaveAttribute('href', '/white');
  await page.goto('/student');
  await expect(page.getByRole('link', { name: 'Training & Journal', exact: true })).toHaveCount(0);
});

test('Training & Journal has no Log today bar, and the journal links still open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student?student=1');
  await expect(page.getByRole('link', { name: "Log today's class", exact: true })).toHaveCount(0);
  await expect(page.locator('.s-pin')).toHaveCount(0);

  await page.getByRole('link', { name: 'Training & Journal', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/training\?student=1$/);
  await expect(page.getByRole('heading', { name: 'Training & Journal', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: "Log today's class", exact: true })).toHaveCount(0);
  await expect(page.locator('.s-pin')).toHaveCount(0);

  const steps: {
    name: string;
    url: RegExp;
    heading: string;
    marker: () => ReturnType<Page['getByRole']>;
  }[] = [
    {
      name: "Today's page",
      url: /\/student\/journal\?student=1$/,
      heading: 'Journal',
      marker: () => page.getByRole('button', { name: 'Save entry' }),
    },
    {
      name: 'Journal cards',
      url: /\/student\/cards\?student=1$/,
      heading: 'Journal cards',
      marker: () => page.getByRole('textbox', { name: 'Search journal' }),
    },
    {
      name: 'Calendar',
      url: /\/student\/calendar\?student=1$/,
      heading: 'Calendar',
      marker: () => page.getByRole('button', { name: 'Previous month' }),
    },
    {
      name: 'Video Library',
      url: /\/student\/videos\?student=1$/,
      heading: 'Video Library',
      marker: () => page.getByRole('button', { name: 'Add video' }),
    },
  ];
  for (const step of steps) {
    const link = page.getByRole('link', { name: step.name, exact: true });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(64);
    await link.click();
    await expect(page).toHaveURL(step.url);
    await expect(page.getByRole('heading', { name: step.heading, exact: true })).toBeVisible();
    await expect(step.marker()).toBeVisible();
    await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/student/training?student=1');
    await page.getByRole('link', { name: BACK, exact: true }).click();
    await expect(page).toHaveURL(/\/student\/training\?student=1$/);
    await expect(page.getByRole('link', { name: "Log today's class", exact: true })).toHaveCount(0);
  }

  await page.goto('/student/journal?student=1&date=2026-10-24');
  await expect(page.getByRole('heading', { name: 'Journal', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save entry' })).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveValue('2026-10-24');
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', '/student/training?student=1');
});

test('Training & Journal ends on the leather edge', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student?student=1');
  await expect(page.getByRole('heading', { name: 'Advantage – Student Edition', exact: true })).toBeVisible();

  const training = page.getByRole('link', { name: 'Training & Journal', exact: true });
  const rank = page.getByRole('link', { name: 'Rank & Progress', exact: true });
  await expect(training).toBeVisible();
  await expect(training.locator('.s-journal__pages')).toHaveCount(0);
  await expect(training.locator('.s-journal__elastic')).toBeVisible();
  await expect(training.locator('.s-journal__stamp')).toHaveCount(1);
  await expect(training.locator('.s-journal__ribbon')).toHaveCount(1);

  const edges = await page.evaluate(() => {
    const journal = document.querySelector('.s-journal');
    const rankCard = document.querySelector('.s-rank');
    if (!(journal instanceof HTMLElement) || !(rankCard instanceof HTMLElement)) return null;
    const journalBox = journal.getBoundingClientRect();
    const rankBox = rankCard.getBoundingClientRect();
    const journalStyle = getComputedStyle(journal);
    const rankStyle = getComputedStyle(rankCard);
    const after = getComputedStyle(journal, '::after').content;
    return {
      journalRight: journalBox.right,
      rankRight: rankBox.right,
      journalLeft: journalBox.left,
      rankLeft: rankBox.left,
      journalRadius: journalStyle.borderTopRightRadius,
      rankRadius: rankStyle.borderTopRightRadius,
      marginRight: journalStyle.marginRight,
      after,
    };
  });
  expect(edges).not.toBeNull();
  expect(Math.abs(edges!.journalRight - edges!.rankRight)).toBeLessThanOrEqual(1);
  expect(Math.abs(edges!.journalLeft - edges!.rankLeft)).toBeLessThanOrEqual(1);
  expect(edges!.journalRadius).toBe(edges!.rankRadius);
  expect(edges!.journalRadius).not.toBe('0px');
  expect(edges!.marginRight).toBe('0px');
  expect(edges!.after === 'none' || edges!.after === 'normal').toBe(true);

  await page.screenshot({ path: '/opt/cursor/artifacts/student-hub-journal-edge-390.png' });
  await training.click();
  await expect(page).toHaveURL(/\/student\/training/);
  await expect(page.getByRole('heading', { name: 'Training & Journal', exact: true })).toBeVisible();
});
