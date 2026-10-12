import { expect, test, type Locator, type Page } from '@playwright/test';

const NOTE =
  'Pick a role, then change any switch for this person. The role chooses which menus open. Inside those menus, cloud and sharing match the owner. The link stays on this device until the gym Google Drive folder carries it. Nothing is emailed or billed.';

const ROLES = [
  {
    id: 'assistant-coach',
    radio: 'Assistant Coach, Coach Unlimited. Lesson plans and daily videos',
    label: 'Assistant coach',
    plan: 'Coach Unlimited',
    family: 'blue',
    on: ['Daily training lesson plan access', "Download today's videos", 'Upload for instructor distribution'],
  },
  {
    id: 'program-director',
    radio: 'Program Director, Pro · Gallery. Events, Pro Shop, and gallery',
    label: 'Program director',
    plan: 'Pro · Gallery',
    family: 'purple',
    on: ['Gallery upload', 'Events access', 'Pro Shop access'],
  },
  {
    id: 'coach',
    radio: 'Coach, Coach Unlimited. Lesson plans, daily videos, and uploads',
    label: 'Coach',
    plan: 'Coach Unlimited',
    family: 'brown',
    on: [
      'Daily training lesson plan access',
      'Roster submit',
      'Roster pull',
      "Download today's videos",
      'Upload for instructor distribution',
    ],
  },
  {
    id: 'instructors',
    radio: 'Instructor, Coach Unlimited + Pro. Lessons, uploads, events, Pro Shop, and gallery',
    label: 'Instructors',
    plan: 'Coach Unlimited + Pro',
    family: 'black',
    on: [
      'Gallery upload',
      'Daily training lesson plan access',
      'Roster submit',
      'Roster pull',
      "Download today's videos",
      'Upload for instructor distribution',
      'Events access',
      'Pro Shop access',
    ],
  },
] as const;

const SWITCHES = [
  'Gallery upload',
  'Daily training lesson plan access',
  'Roster submit',
  'Roster pull',
  "Download today's videos",
  'Upload for instructor distribution',
  'Events access',
  'Pro Shop access',
] as const;

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.removeItem('matboard.pro.instructorSeats.v1');
    localStorage.removeItem('matboard.pro.instructorSeatSession.v1');
  });
}

async function coverFamily(img: Locator) {
  return img.evaluate((node) => {
    const image = node as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || !image.naturalWidth) return { blue: 0, brown: 0, purple: 0, black: 0, red: 0 };
    ctx.drawImage(image, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const counts = { blue: 0, brown: 0, purple: 0, black: 0, red: 0 };
    for (let y = 0; y < height; y += 3) {
      for (let x = 0; x < width; x += 3) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 200) continue;
        if (b > 150 && g > r + 30 && b > g) counts.blue += 1;
        if (r > 60 && r > g && g > b + 5 && b < 100 && g < 150) counts.brown += 1;
        if (b > 150 && r > g + 20 && b > r) counts.purple += 1;
        if (r < 45 && g < 45 && b < 45) counts.black += 1;
        if (r > 150 && g < 80 && b < 80) counts.red += 1;
      }
    }
    return counts;
  });
}

test('each invite role uses the 2026-10-11 binder and keeps its switches', async ({ page }) => {
  await unlock(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/instructors');
  await expect(page.getByText('Generate instructor invite')).toBeVisible();
  await expect(page.locator('.invite-form__note')).toHaveText(NOTE);
  const issue = page.getByRole('button', { name: 'Issue invite' });
  await expect(issue).toHaveCSS('background-color', 'rgb(252, 192, 0)');
  await expect(issue).toHaveCSS('color', 'rgb(20, 22, 28)');

  const row = page.locator('.role-options__row');
  const fit = await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
  expect(fit).toBe(true);

  for (const role of ROLES) {
    const radio = page.getByRole('radio', { name: role.radio });
    await radio.click();
    await expect(radio).toHaveClass(new RegExp(`binder-pick--${role.id}`));
    await expect(radio).toHaveClass(/binder-pick--on/);
    await expect(radio).toHaveAttribute('aria-checked', 'true');
    const img = radio.locator('img');
    await expect(img).toHaveAttribute('src', `/instructor-binders/${role.id === 'instructors' ? 'instructor' : role.id}.png`);
    await expect(img).toHaveJSProperty('complete', true);
    const colors = await coverFamily(img);
    if (role.family === 'blue') {
      expect(colors.blue).toBeGreaterThan(80);
      expect(colors.blue).toBeGreaterThan(colors.brown);
      expect(colors.blue).toBeGreaterThan(colors.purple);
    } else if (role.family === 'brown') {
      expect(colors.brown).toBeGreaterThan(80);
      expect(colors.brown).toBeGreaterThan(colors.purple);
      expect(colors.brown).toBeGreaterThan(colors.blue);
    } else if (role.family === 'purple') {
      expect(colors.purple).toBeGreaterThan(80);
      expect(colors.purple).toBeGreaterThan(colors.brown);
      expect(colors.purple).toBeGreaterThan(colors.blue);
    } else {
      expect(colors.black).toBeGreaterThan(80);
      expect(colors.red).toBeGreaterThan(15);
    }
    for (const label of SWITCHES) {
      const toggle = page.getByRole('switch', { name: new RegExp(label) });
      await expect(toggle).toHaveAttribute('aria-checked', role.on.includes(label) ? 'true' : 'false');
    }
  }
});

test('an issued invite keeps the picked role, seat count, and permission edit', async ({ page }) => {
  await unlock(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/instructors');
  await expect(page.locator('.invite-seat-cap__count')).toHaveText('0 of 10 seats used');

  await page.getByLabel('Instructor email').fill('coach@gym.test');
  await page.getByRole('radio', { name: ROLES[2].radio }).click();
  await page.getByRole('switch', { name: /Gallery upload/ }).click();
  await page.getByRole('button', { name: 'Issue invite' }).click();
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toBeVisible();
  await expect(page.locator('.invite-link')).toContainText('Coach Unlimited');
  await expect(page.locator('.invite-seat-cap__count')).toHaveText('1 of 10 seats used');
  await expect(page.locator('.binder-list__seats')).toContainText('1 of 10 seats used');
  await expect(page.locator('.binder-list__seats')).toContainText('9 seats remaining');
  await expect(page.getByText('Coach · adjusted', { exact: true })).toBeVisible();

  const others = [
    { email: 'assist@gym.test', role: ROLES[0] },
    { email: 'pd@gym.test', role: ROLES[1] },
    { email: 'lead@gym.test', role: ROLES[3] },
  ];
  for (const [index, item] of others.entries()) {
    await page.getByLabel('Instructor email').fill(item.email);
    await page.getByRole('radio', { name: item.role.radio }).click();
    await page.getByRole('button', { name: 'Issue invite' }).click();
    await expect(page.locator('.invite-seat-cap__count')).toHaveText(`${index + 2} of 10 seats used`);
    await expect(page.getByText(item.role.label, { exact: true }).first()).toBeVisible();
  }

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('matboard.pro.instructorSeats.v1');
    const parsed = JSON.parse(raw ?? '{"seats":[]}') as {
      seats: { email: string; presetId: string; permissions: Record<string, boolean>; status: string }[];
    };
    return parsed.seats;
  });
  expect(stored).toHaveLength(4);
  const byEmail = Object.fromEntries(stored.map((seat) => [seat.email, seat]));
  expect(byEmail['coach@gym.test'].presetId).toBe('coach');
  expect(byEmail['coach@gym.test'].permissions.galleryUpload).toBe(true);
  expect(byEmail['coach@gym.test'].permissions.eventsAccess).toBe(false);
  expect(byEmail['assist@gym.test'].presetId).toBe('assistant-coach');
  expect(byEmail['assist@gym.test'].permissions.rosterSubmit).toBe(false);
  expect(byEmail['pd@gym.test'].presetId).toBe('program-director');
  expect(byEmail['pd@gym.test'].permissions.eventsAccess).toBe(true);
  expect(byEmail['pd@gym.test'].permissions.dailyLessonPlanAccess).toBe(false);
  expect(byEmail['lead@gym.test'].presetId).toBe('instructors');
  expect(byEmail['lead@gym.test'].permissions.proShopAccess).toBe(true);

  const coachCard = page.locator('.seat-card', { hasText: 'coach@gym.test' });
  await coachCard.getByRole('button', { name: 'Edit permissions' }).click();
  const editor = page.getByRole('radiogroup', { name: 'Instructor role' }).last();
  await editor.getByRole('radio', { name: ROLES[1].radio }).click();
  await expect(editor.getByRole('radio', { name: ROLES[1].radio })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: /Events access/ }).last()).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: /Roster submit/ }).last()).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Save permissions' }).click();
  await expect(coachCard.getByText('Program director', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('matboard.pro.instructorSeats.v1');
    const parsed = JSON.parse(raw ?? '{"seats":[]}') as {
      seats: { email: string; presetId: string; permissions: Record<string, boolean> }[];
    };
    return parsed.seats.find((seat) => seat.email === 'coach@gym.test');
  });
  expect(saved?.presetId).toBe('program-director');
  expect(saved?.permissions.galleryUpload).toBe(true);
  expect(saved?.permissions.eventsAccess).toBe(true);
  await expect(page.locator('.invite-seat-cap__count')).toHaveText('4 of 10 seats used');
});

test('mobile binder row peeks and scrolls to the last role', async ({ page }) => {
  await unlock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/instructors');
  const row = page.locator('.role-options__row');
  await row.waitFor();
  const before = await row.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(before.scrollWidth).toBeGreaterThan(before.clientWidth + 24);
  const instructor = page.getByRole('radio', { name: ROLES[3].radio });
  const hidden = await instructor.evaluate((el) => {
    const row = el.parentElement;
    if (!row) return false;
    const rowBox = row.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return box.right > rowBox.right + 8;
  });
  expect(hidden).toBe(true);
  const next = await page.getByRole('radio', { name: ROLES[2].radio }).evaluate((el) => {
    const row = el.parentElement;
    if (!row) return null;
    const rowBox = row.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return { startsPast: box.left - rowBox.right, width: box.width };
  });
  expect(next).not.toBeNull();
  expect(next!.startsPast).toBeGreaterThan(-24);
  expect(next!.startsPast).toBeLessThan(24);
  await row.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect.poll(async () =>
    instructor.evaluate((el) => {
      const row = el.parentElement;
      if (!row) return false;
      const rowBox = row.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return box.right <= rowBox.right + 2 && box.left >= rowBox.left - 2;
    }),
  ).toBe(true);
  await instructor.click();
  await expect(instructor).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: /Pro Shop access/ })).toHaveAttribute('aria-checked', 'true');
});

test('role binders read Assistant, Program Director, Coach, then Instructor', async ({ page }) => {
  await unlock(page);
  const order = [
    'binder-pick--assistant-coach',
    'binder-pick--program-director',
    'binder-pick--coach',
    'binder-pick--instructors',
  ];
  const expectOrder = async (row: Locator) => {
    const radios = row.getByRole('radio');
    await expect(radios).toHaveCount(4);
    const placed = await radios.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { className: node.className, left: box.left, top: box.top, label: node.getAttribute('aria-label') };
      }),
    );
    for (let index = 0; index < order.length; index += 1) {
      expect(placed[index].className).toContain(order[index]);
    }
    expect(placed.map((item) => item.label)).toEqual(ROLES.map((role) => `${role.radio}. Full cloud and sharing in these menus`));
    for (let index = 1; index < placed.length; index += 1) {
      expect(placed[index].left).toBeGreaterThan(placed[index - 1].left + 16);
      expect(Math.abs(placed[index].top - placed[0].top)).toBeLessThan(8);
    }
  };

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/instructors');
    await expectOrder(page.locator('.role-options__row'));
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel('Instructor email').fill('order@gym.test');
  await page.getByRole('radio', { name: ROLES[0].radio }).click();
  await page.getByRole('button', { name: 'Issue invite' }).click();
  await page.locator('.seat-card', { hasText: 'order@gym.test' }).getByRole('button', { name: 'Edit permissions' }).click();
  await expectOrder(page.getByRole('radiogroup', { name: 'Instructor role' }).last());
});

test('invite page back mark returns to Pro and the center mark goes Home', async ({ page }) => {
  await unlock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/instructors');
  await page.getByRole('link', { name: 'Back. Hold for Home.' }).click();
  await expect(page).toHaveURL(/\/pro$/);
  await page.goto('/instructors');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
