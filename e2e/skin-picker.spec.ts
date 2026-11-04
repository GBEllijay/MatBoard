import { expect, test, type Page } from '@playwright/test';
import { IMPLIED_DOORS } from '../src/lib/tierImplications';

/**
 * Skin picker on the Scoreboard and Round Timer. The nine polished families (plus the timer-only
 * Calçadão) appear wherever the /media hub check opens (Media, Pro, owner; Instructor once PR #339
 * gives Coach the Media door). White and Student never see them: no lock tiles, no upsell.
 * White's scoreboard and round timer each list Mock-Tournament, Old School, and Quick Result.
 * Student keeps the old toggles (Classic / Advantage on the timer; Mock / Old School / Quick Result
 * on suite scoreboards). With Media one Skins button replaces those toggles in the same spot.
 */

const POLISHED = ['Kids Arcade', 'Kids Sticker', 'Keynote', 'Heavy Metal', 'Brasil', 'Woodblock', 'Reggae', 'Psychedelic', 'Visionary', 'Creature Anime', 'Idol Hunters', 'Shinobi Anime'];
const POLISHED_TIMER = [...POLISHED.slice(0, 5), 'Calçadão', ...POLISHED.slice(5)];

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

test('White controller: exactly Mock-Tournament, Old School, and Quick Result', async ({ page }) => {
  await seed(page, 'white', { 'matboard.match.v1': JSON.stringify(matchState()) });
  await page.goto('/match/control');
  await expect(page.getByRole('button', { name: 'Reset clock' })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Scoreboard skin' });
  await panel.getByRole('button', { name: /^Scoreboard skins/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Scoreboard skins' });
  await expect(dialog.getByRole('radio')).toHaveText(['Mock-Tournament', 'Old School', 'Quick Result']);
  await expect(dialog.getByRole('link')).toHaveCount(0);
  await expect(page.getByText('Unlock with Media Edition')).toHaveCount(0);
  for (const name of POLISHED) await expect(dialog.getByRole('radio', { name })).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Old School' }).click();
  expect(await savedMatchSkin(page)).toBe('OLD_SCHOOL');

  await page.goto('/match');
  await expect(page.locator('main.display')).toHaveClass(/scoreboard-skin--old-school/);
  await expect(page.locator('.flap').first()).toBeVisible();
});

test('White timer: exactly Mock-Tournament, Old School, and Quick Result', async ({ page }) => {
  await seed(page, 'white', { 'matboard.training.v1': JSON.stringify(trainingState()) });
  await page.goto('/training/control');
  await expect(page.getByRole('radiogroup', { name: 'Timer skin' })).toHaveCount(0);
  const fieldset = page.getByRole('group', { name: 'Skin' });
  await fieldset.getByRole('button', { name: /^Timer skins/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Timer skins' });
  await expect(dialog.getByRole('radio')).toHaveText(['Mock-Tournament', 'Old School', 'Quick Result']);
  await expect(dialog.getByRole('link')).toHaveCount(0);
  await expect(page.getByText('Unlock with Media Edition')).toHaveCount(0);
  for (const name of ['Classic', 'Advantage', ...POLISHED_TIMER]) {
    await expect(dialog.getByRole('radio', { name })).toHaveCount(0);
  }
  await dialog.getByRole('radio', { name: 'Quick Result' }).click();
  expect(await page.evaluate(() => localStorage.getItem('matboard.trainingSkin.v1'))).toBe('QUICK_RESULT');
  await expect(page.locator('main.training-control')).toHaveClass(/controller--wt-quick/);
});

test('the tier ladder gives Instructor (coach) the Media door', () => {
  expect(IMPLIED_DOORS.coach).toContain('media');
});

test('Instructor (legacy coach flag): the controller gets the Skins button and the new families', async ({ page }) => {
  await seed(page, 'coach', { 'matboard.match.v1': JSON.stringify(matchState()) });
  await page.goto('/match/control');
  await expect(page.getByRole('button', { name: 'Reset clock' })).toBeVisible();
  await page.getByRole('button', { name: /^Scoreboard skins/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Scoreboard skins' });
  await expect(dialog.getByRole('radio')).toHaveText(['Mock-Tournament', ...POLISHED]);
  await expect(dialog.getByRole('link')).toHaveCount(0);
});

/** Instructor through a coach-only grant: no Media, Pro, White or Student flag; Media comes from the tier table. */
async function seedCoachOnlyGrant(page: Page, extra: Record<string, string> = {}) {
  await page.addInitScript(
    ({ extra }) => {
      if (sessionStorage.getItem('skin-picker-seeded')) return;
      sessionStorage.setItem('skin-picker-seeded', '1');
      for (const key of ['advantage.proUnlocked', 'advantage.whiteUnlocked', 'advantage.studentEditionUnlocked', 'advantage.coachUnlocked']) {
        localStorage.removeItem(key);
      }
      sessionStorage.setItem(
        'advantage.ownerTest.v1',
        JSON.stringify({ v: 1, source: 'owner-test', grants: ['coach'], tier: 'coach', expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
      );
      localStorage.setItem('advantage.legacyNoticeDismissed', '1');
      localStorage.setItem('matboard.tvTip.v1', '1');
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
    },
    { extra },
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

test('Instructor (coach-only grant): Skins button on the timer and the scoreboard via the tier table', async ({ page }) => {
  await seedCoachOnlyGrant(page, {
    'matboard.training.v1': JSON.stringify(trainingState()),
    'matboard.trainingSkin.v1': 'themed',
    'matboard.match.v1': JSON.stringify(matchState()),
  });
  await page.goto('/training/control');
  // Timer: the Classic / Advantage toggle is replaced by the Skins button; the choice carries over.
  await expect(page.getByRole('radiogroup', { name: 'Timer skin' })).toHaveCount(0);
  const fieldset = page.getByRole('group', { name: 'Skin' });
  const button = fieldset.getByRole('button', { name: 'Timer skins, Advantage' });
  await expect(button).toHaveText('Skins');
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Timer skins' });
  await expect(dialog.getByRole('radio')).toHaveText(['Classic', 'Advantage', ...POLISHED_TIMER]);
  await expect(dialog.getByRole('radio', { name: 'Advantage' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('link')).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Reggae' }).click();
  expect(await page.evaluate(() => localStorage.getItem('matboard.trainingSkin.v1'))).toBe('reggae');
  await page.keyboard.press('Escape');
  // Background & logo (PR #340) stays in the same Options, next to the Skins control.
  await expect(page.locator('legend', { hasText: 'Background & logo' }).first()).toBeVisible();

  // Scoreboard controller: the same grant opens the Skins button there too.
  await page.goto('/match/control');
  await expect(page.getByRole('button', { name: 'Reset clock' })).toBeVisible();
  await page.getByRole('button', { name: /^Scoreboard skins/ }).click();
  await expect(page.getByRole('dialog', { name: 'Scoreboard skins' }).getByRole('radio')).toHaveText(['Mock-Tournament', ...POLISHED]);
});

for (const tier of ['pro'] as const) {
  test(`${tier} controller: new skins are open and the pick sticks after reload`, async ({ page }) => {
    await seed(page, tier, { 'matboard.match.v1': JSON.stringify(matchState()) });
    await page.goto('/match/control');
    // One Skins button in the Scoreboard skin panel; the old chip toggle is gone for Media and up.
    const panel = page.getByRole('region', { name: 'Scoreboard skin' });
    const button = panel.getByRole('button', { name: 'Scoreboard skins, Mock-Tournament' });
    await expect(button).toHaveText('Skins');
    await expect(panel.getByRole('radiogroup', { name: 'Scoreboard skin' })).toHaveCount(0);
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Scoreboard skins' });
    await expect(dialog.getByRole('radio')).toHaveText(['Mock-Tournament', ...POLISHED]);
    await expect(dialog.getByRole('radio', { name: 'Mock-Tournament' })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByRole('link')).toHaveCount(0);
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

test('Media+ suite board: the Skins button replaces the Mock / Old School / Quick Result toggle and keeps the pick', async ({ page }) => {
  await seed(page, 'pro', { 'matboard.match.v1': JSON.stringify(matchState('OLD_SCHOOL')) });
  await page.goto('/match/control?from=suite');
  const panel = page.getByRole('region', { name: 'Scoreboard skin' });
  await expect(panel.getByRole('radiogroup', { name: 'Scoreboard skin' })).toHaveCount(0);
  const button = panel.getByRole('button', { name: 'Scoreboard skins, Old School' });
  await expect(button).toHaveText('Skins');
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Scoreboard skins' });
  await expect(dialog.getByRole('radio')).toHaveText(['Mock-Tournament', 'Old School', 'Quick Result', ...POLISHED]);
  await expect(dialog.getByRole('radio', { name: 'Old School' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('radio', { name: 'Quick Result' }).click();
  expect(await savedMatchSkin(page)).toBe('QUICK_RESULT');
});

test('White suite board: the same three base skins, and no new families', async ({ page }) => {
  await seed(page, 'white', { 'matboard.match.v1': JSON.stringify(matchState()) });
  await page.goto('/match/control?from=suite');
  const panel = page.getByRole('region', { name: 'Scoreboard skin' });
  await expect(panel.getByRole('radiogroup', { name: 'Scoreboard skin' })).toHaveCount(0);
  await panel.getByRole('button', { name: /^Scoreboard skins/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Scoreboard skins' });
  await expect(dialog.getByRole('radio')).toHaveText(['Mock-Tournament', 'Old School', 'Quick Result']);
  for (const name of POLISHED) await expect(dialog.getByRole('radio', { name })).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Old School' }).click();
  expect(await savedMatchSkin(page)).toBe('OLD_SCHOOL');
});

test('Student keeps the old timer toggle and the suite scoreboard toggle', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('skin-picker-seeded')) return;
    sessionStorage.setItem('skin-picker-seeded', '1');
    localStorage.setItem('advantage.studentEditionUnlocked', '1');
    localStorage.setItem('advantage.legacyNoticeDismissed', '1');
    localStorage.setItem('matboard.tvTip.v1', '1');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/training/control');
  const group = page.getByRole('radiogroup', { name: 'Timer skin' });
  await expect(group.getByRole('radio')).toHaveText(['Classic', 'Advantage']);
  await expect(page.getByRole('button', { name: /^Timer skins/ })).toHaveCount(0);
  for (const name of POLISHED_TIMER) await expect(page.getByRole('radio', { name })).toHaveCount(0);

  await page.goto('/match/control');
  await expect(page.getByRole('region', { name: 'Scoreboard skin' })).toHaveCount(0);

  await page.goto('/match/control?from=suite');
  const toggle = page.getByRole('region', { name: 'Scoreboard skin' }).getByRole('radiogroup', { name: 'Scoreboard skin' });
  await expect(toggle.getByRole('radio')).toHaveText(['Mock-Tournament', 'Old School', 'Quick Result']);
  await expect(page.getByRole('button', { name: /^Scoreboard skins/ })).toHaveCount(0);
});

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
  await expect(page.getByRole('button', { name: 'Timer skins, Reggae' })).toBeVisible();

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

for (const [saved, label] of [['classic', 'Classic'], ['themed', 'Advantage']] as const) {
  test(`Media+ timer options: one Skins button replaces Classic/Advantage and keeps ${label}`, async ({ page }) => {
    await seed(page, 'pro', { 'matboard.training.v1': JSON.stringify(trainingState()), 'matboard.trainingSkin.v1': saved });
    await page.goto('/training/control');
    // The old toggle is gone; the Skins button sits in the same Skin fieldset.
    await expect(page.getByRole('radiogroup', { name: 'Timer skin' })).toHaveCount(0);
    const fieldset = page.getByRole('group', { name: 'Skin' });
    const button = fieldset.getByRole('button', { name: `Timer skins, ${label}` });
    await expect(button).toHaveText('Skins');
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Timer skins' });
    await expect(dialog.getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'true');
    const other = label === 'Classic' ? 'Advantage' : 'Classic';
    await dialog.getByRole('radio', { name: other }).click();
    expect(await page.evaluate(() => localStorage.getItem('matboard.trainingSkin.v1'))).toBe(saved === 'classic' ? 'themed' : 'classic');
    await expect(fieldset.getByRole('button', { name: `Timer skins, ${other}` })).toBeVisible();
  });
}

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

test('a saved new timer skin falls back to Mock-Tournament when the browser is only White', async ({ page }) => {
  await seed(page, 'white', {
    'matboard.training.v1': JSON.stringify(trainingState()),
    'matboard.trainingSkin.v1': 'woodblock',
  });
  await page.goto('/training');
  await expect(page.locator('.skin-root')).toHaveCount(0);
  await expect(page.locator('main.training')).toHaveClass(/training--wt-mock/);
  await expect(page.locator('button.training__clock')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('matboard.trainingSkin.v1'))).toBe('woodblock');
  await page.goto('/training/control');
  await page.getByRole('button', { name: 'Timer skins, Mock-Tournament' }).click();
  await expect(page.getByRole('dialog', { name: 'Timer skins' }).getByRole('radio', { name: 'Mock-Tournament' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
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

test('Pro timer list: Calçadão sits after Brasil and paints the timer; Visionary rests on "Breathe"', async ({ page }) => {
  await seed(page, 'pro', { 'matboard.training.v1': JSON.stringify(trainingState()) });
  await page.goto('/training/control');
  await page.getByRole('button', { name: /^Timer skins/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Timer skins' });
  await expect(dialog.getByRole('radio')).toHaveText(['Classic', 'Advantage', ...POLISHED_TIMER]);
  await dialog.getByRole('radio', { name: 'Calçadão' }).click();
  expect(await page.evaluate(() => localStorage.getItem('matboard.trainingSkin.v1'))).toBe('calcadao');
  await page.goto('/training');
  const calc = page.locator('.skin-root[data-skin="calcadao"]');
  await expect(calc.locator('.tm .panel button.tm-clock')).toHaveAttribute('aria-label', /^05:00\./);
  await expect(calc.locator('.cbar i')).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem('matboard.trainingSkin.v1', 'visionary');
    const t = JSON.parse(localStorage.getItem('matboard.training.v1') || '{}');
    localStorage.setItem('matboard.training.v1', JSON.stringify({ ...t, phase: 'break', remainingMs: 30000 }));
  });
  await page.reload();
  const vis = page.locator('.skin-root[data-skin="visionary"]');
  await expect(vis.locator('.tm.rest')).toBeVisible();
  await expect(vis.locator('.title')).toHaveText('Breathe');
  await expect(vis.locator('.keye')).toHaveCount(1);
});

test('Calçadão has no scoreboard: the scoreboard list never offers it', async ({ page }) => {
  await seed(page, 'pro', { 'matboard.match.v1': JSON.stringify(matchState()) });
  await page.goto('/match/control');
  await page.getByRole('button', { name: /^Scoreboard skins/ }).click();
  await expect(page.getByRole('dialog', { name: 'Scoreboard skins' }).getByRole('radio', { name: 'Calçadão' })).toHaveCount(0);
});

for (const motion of ['reduce', 'no-preference'] as const) {
  test(`Visionary timer: the ring hue drifts only with prefers-reduced-motion: ${motion}`, async ({ page }) => {
    await seed(page, 'pro', {
      'matboard.training.v1': JSON.stringify(trainingState()),
      'matboard.trainingSkin.v1': 'visionary',
    });
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto('/training');
    const root = page.locator('.skin-root[data-skin="visionary"]');
    await expect(root.locator('.tm .title')).toHaveText('Round 2');
    const fill = await root.locator('.ring.fill').evaluate((el) => getComputedStyle(el).animationName);
    expect(fill).toBe(motion === 'reduce' ? 'none' : 'vis-hue');
  });
}
