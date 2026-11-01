import { expect, test, type Page } from '@playwright/test';
import { IMPLIED_DOORS } from '../src/lib/tierImplications';

/**
 * Skin picker on the Scoreboard and Round Timer. The eight polished skins open wherever
 * the /media hub check opens (Media, Pro, owner; Instructor once PR #339 gives Coach the
 * Media door). White and Student see them locked with "Unlock with Media Edition". Mock-Tournament, Old School, Quick Result,
 * Classic and Advantage behave exactly as before.
 */

const POLISHED = ['Kids Arcade', 'Kids Sticker', 'Keynote', 'Heavy Metal', 'Brasil', 'Woodblock', 'Reggae', 'Psychedelic'];
/** Instructor follows the Media door in the tier table (PR #339 adds it). */
const COACH_HAS_MEDIA = (IMPLIED_DOORS.coach as readonly string[]).includes('media');

function matchState(skin = 'MOCK_TOURNAMENT') {
  return {
    blue: { name: 'Kat B.', gym: 'Alliance', rank: 'Purple', points: 0, advantages: 0, disadvantages: 0 },
    white: { name: 'Sam R.', gym: 'Checkmat', rank: 'Blue', points: 0, advantages: 0, disadvantages: 0 },
    round: 'Final',
    division: 'Adult',
    durationMs: 300000,
    remainingMs: 300000,
    running: false,
    startedAt: null,
    startBeep: false,
    warningBeep: false,
    warned: false,
    endBuzzer: false,
    endCue: 'off',
    bracketMatchId: null,
    autoAnnounce: false,
    skin,
    outcome: null,
    outcomeFlash: null,
    revision: 4,
  };
}

function trainingState(phase: 'work' | 'break' = 'work') {
  return {
    workMs: 300000,
    breakMs: 30000,
    rounds: 5,
    endless: false,
    remainingMs: phase === 'work' ? 300000 : 30000,
    running: false,
    startedAt: null,
    phase,
    currentRound: 2,
    warned: false,
    startSound: false,
    warningSound: false,
    endSound: false,
  };
}

/** Legacy on-device tier flags (the same ones other specs use). */
type Tier = 'white' | 'coach' | 'pro';
async function seed(page: Page, tier: Tier, extra: Record<string, string> = {}) {
  await page.addInitScript(
    ({ tier, extra }) => {
      if (sessionStorage.getItem('skin-picker-seeded')) return;
      sessionStorage.setItem('skin-picker-seeded', '1');
      localStorage.setItem(`advantage.${tier}Unlocked`, '1');
      localStorage.setItem('advantage.legacyNoticeDismissed', '1');
      localStorage.setItem('matboard.tvTip.v1', '1');
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
    },
    { tier, extra },
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

const savedMatchSkin = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('matboard.match.v1') || '{}').skin as string | undefined);

test('White controller: picker lists every skin, the eight new ones locked with the Media Edition link', async ({ page }) => {
  await seed(page, 'white', { 'matboard.match.v1': JSON.stringify(matchState()) });
  await page.goto('/match/control');
  await page.getByRole('button', { name: /^Scoreboard skins/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Scoreboard skins' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Mock-Tournament' })).toHaveAttribute('aria-checked', 'true');
  for (const name of POLISHED) {
    await expect(dialog.getByRole('radio', { name: `${name} (locked)` })).toHaveAttribute('aria-disabled', 'true');
  }
  const unlock = dialog.getByRole('link', { name: 'Unlock with Media Edition' });
  await expect(unlock).toHaveAttribute('href', '/media');

  // A locked tile does nothing.
  await dialog.getByRole('radio', { name: 'Keynote (locked)' }).click({ force: true });
  expect(await savedMatchSkin(page)).toBe('MOCK_TOURNAMENT');

  await unlock.click();
  await expect(page).toHaveURL(/\/media$/);
});

test('White timer options: new skins locked; Classic and Advantage still switch', async ({ page }) => {
  await seed(page, 'white', { 'matboard.training.v1': JSON.stringify(trainingState()) });
  await page.goto('/training/control');
  const group = page.getByRole('radiogroup', { name: 'Timer skin' });
  await group.getByRole('radio', { name: 'Advantage' }).click();
  await expect(group.getByRole('radio', { name: 'Advantage' })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('matboard.trainingSkin.v1'))).toBe('themed');

  await page.getByRole('button', { name: /^Timer skins/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Timer skins' });
  await expect(dialog.getByRole('radio', { name: 'Advantage' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.locator('.is-locked')).toHaveCount(8);
  await expect(dialog.getByRole('link', { name: 'Unlock with Media Edition' })).toHaveAttribute('href', '/media');
  await dialog.getByRole('radio', { name: 'Classic' }).click();
  await expect(group.getByRole('radio', { name: 'Classic' })).toHaveAttribute('aria-checked', 'true');
});

test(`Instructor (legacy coach) follows the Media check: ${COACH_HAS_MEDIA ? 'open' : 'locked until PR #339'}`, async ({ page }) => {
  await seed(page, 'coach', { 'matboard.match.v1': JSON.stringify(matchState()) });
  await page.goto('/match/control');
  await page.getByRole('button', { name: /^Scoreboard skins/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Scoreboard skins' });
  await expect(dialog.locator('.is-locked')).toHaveCount(COACH_HAS_MEDIA ? 0 : POLISHED.length);
  await expect(dialog.getByRole('link', { name: 'Unlock with Media Edition' })).toHaveCount(COACH_HAS_MEDIA ? 0 : 1);
});

for (const tier of ['pro'] as const) {
  test(`${tier} controller: new skins are open and the pick sticks after reload`, async ({ page }) => {
    await seed(page, tier, { 'matboard.match.v1': JSON.stringify(matchState()) });
    await page.goto('/match/control');
    await page.getByRole('button', { name: /^Scoreboard skins/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Scoreboard skins' });
    await expect(dialog.locator('.is-locked')).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: 'Unlock with Media Edition' })).toHaveCount(0);
    await dialog.getByRole('radio', { name: 'Keynote' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await savedMatchSkin(page)).toBe('KEYNOTE');

    await page.reload();
    await page.getByRole('button', { name: 'Scoreboard skins, Keynote' }).click();
    await expect(page.getByRole('dialog', { name: 'Scoreboard skins' }).getByRole('radio', { name: 'Keynote' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.goto('/match');
    await expect(page.locator('.skin-root[data-skin="keynote"]')).toBeVisible();
  });
}

test('a saved new skin falls back to the default board when the browser is only White', async ({ page }) => {
  await seed(page, 'white', { 'matboard.match.v1': JSON.stringify(matchState('HEAVY_METAL')) });
  await page.goto('/match');
  await expect(page.locator('main.display')).toHaveClass(/scoreboard-skin--mock-tournament/);
  await expect(page.locator('.skin-root')).toHaveCount(0);
  // The saved pick is kept, so it comes back if Media is unlocked later.
  expect(await savedMatchSkin(page)).toBe('HEAVY_METAL');
});

test('polished board keeps the scoreboard controls: tap adds, hold subtracts, clock starts and pauses', async ({ page }) => {
  await seed(page, 'pro', { 'matboard.match.v1': JSON.stringify(matchState('BRASIL')) });
  await page.goto('/match');
  await expect(page.locator('.skin-root[data-skin="brasil"]')).toBeVisible();
  const blue = page.getByRole('region', { name: 'Blue competitor' });
  await blue.getByRole('button', { name: /^Points 0\./ }).click();
  await expect(blue.getByRole('button', { name: /^Points 1\./ })).toBeVisible();
  await blue.getByRole('button', { name: /^Adv 0\./ }).click();
  await expect(blue.getByRole('button', { name: /^Adv 1\./ })).toBeVisible();

  const pts = blue.getByRole('button', { name: /^Points 1\./ });
  const box = await pts.boundingBox();
  if (!box) throw new Error('no tile');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(blue.getByRole('button', { name: /^Points 0\./ })).toBeVisible();

  const white = page.getByRole('region', { name: 'White competitor' });
  await white.getByRole('button', { name: /^Pen 0\./ }).click();
  await expect(white.getByRole('button', { name: /^Pen 1\./ })).toBeVisible();

  const clock = page.getByRole('button', { name: 'Start or pause match clock' });
  await expect(clock).toHaveText('05:00');
  await clock.click();
  await expect(clock).not.toHaveText('05:00', { timeout: 5000 });
  await clock.click();
  const paused = await clock.textContent();
  await page.waitForTimeout(1300);
  await expect(clock).toHaveText(paused ?? '');
});

test('Pro timer: pick Reggae; clock and round line still work; rest reads "Rest Easy"', async ({ page }) => {
  await seed(page, 'pro', { 'matboard.training.v1': JSON.stringify(trainingState()) });
  await page.goto('/training/control');
  await page.getByRole('button', { name: /^Timer skins/ }).click();
  await page.getByRole('dialog', { name: 'Timer skins' }).getByRole('radio', { name: 'Reggae' }).click();
  expect(await page.evaluate(() => localStorage.getItem('matboard.trainingSkin.v1'))).toBe('reggae');
  // Classic/Advantage radios show neither while a new skin is on.
  const group = page.getByRole('radiogroup', { name: 'Timer skin' });
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(0);

  await page.goto('/training');
  const root = page.locator('.skin-root[data-skin="reggae"]');
  await expect(root).toBeVisible();
  await expect(root.locator('.tm')).not.toHaveClass(/\brest\b/);
  const clock = root.locator('button.tm-clock');
  await expect(clock).toHaveAttribute('aria-label', /^05:00\./);
  await clock.click();
  await expect(clock).not.toHaveAttribute('aria-label', /^05:00\./, { timeout: 5000 });
  await clock.click();
  await expect(root.locator('.tm')).toHaveAttribute('style', /--p:/);
});

test('Pro timer on the break: .tm.rest and the Reggae "Rest Easy" title', async ({ page }) => {
  await seed(page, 'pro', {
    'matboard.training.v1': JSON.stringify(trainingState('break')),
    'matboard.trainingSkin.v1': 'reggae',
  });
  await page.goto('/training');
  const root = page.locator('.skin-root[data-skin="reggae"]');
  await expect(root.locator('.tm.rest')).toBeVisible();
  await expect(root.locator('.title')).toHaveText('Rest Easy');
});

test('a saved new timer skin falls back to Classic when the browser is only White', async ({ page }) => {
  await seed(page, 'white', {
    'matboard.training.v1': JSON.stringify(trainingState()),
    'matboard.trainingSkin.v1': 'woodblock',
  });
  await page.goto('/training');
  await expect(page.locator('.skin-root')).toHaveCount(0);
  await expect(page.locator('button.training__clock')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('matboard.trainingSkin.v1'))).toBe('woodblock');
});

for (const motion of ['reduce', 'no-preference'] as const) {
  test(`Psychedelic timer: hue drift and spiral ${motion === 'reduce' ? 'stop' : 'run'} with prefers-reduced-motion: ${motion}`, async ({ page }) => {
    await seed(page, 'pro', {
      'matboard.training.v1': JSON.stringify(trainingState()),
      'matboard.trainingSkin.v1': 'psychedelic',
    });
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto('/training');
    const root = page.locator('.skin-root[data-skin="psychedelic"]');
    await expect(root).toBeVisible();
    await expect(root.locator('.tm .title')).toHaveText('Round 2');
    const names = await root.evaluate((el) => ({
      bg: getComputedStyle(el.querySelector('.bg')!).animationName,
      spiral: getComputedStyle(el.querySelector('.spiral')!).animationName,
    }));
    expect(names).toEqual(motion === 'reduce' ? { bg: 'none', spiral: 'none' } : { bg: 'psy-hue', spiral: 'psy-spin' });
  });
}
