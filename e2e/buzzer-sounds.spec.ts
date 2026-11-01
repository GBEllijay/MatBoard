import { expect, test, type Page } from '@playwright/test';

/**
 * End cue (Buzzer / Bell / Parou) + Extra loud on the Timer and Scoreboard.
 * AudioContext is swapped for an OfflineAudioContext so a preview tap can be
 * rendered and its loudness measured.
 */
async function prep(page: Page, saved?: object) {
  await page.addInitScript((prefs) => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('matboard.tvTip.v1', '1');
    if (prefs && !sessionStorage.getItem('seeded')) {
      localStorage.setItem('matboard.audio.v1', JSON.stringify(prefs));
      sessionStorage.setItem('seeded', '1');
    }
    const off = new OfflineAudioContext(1, 48000 * 3, 48000);
    Object.defineProperty(off, 'state', { get: () => 'running' });
    off.resume = () => Promise.resolve();
    let oscillators = 0;
    const make = off.createOscillator.bind(off);
    off.createOscillator = () => {
      oscillators += 1;
      return make();
    };
    const w = window as unknown as { AudioContext: unknown; __off: OfflineAudioContext; __osc: () => number };
    w.__off = off;
    w.__osc = () => oscillators;
    w.AudioContext = function () {
      return off;
    };
  }, saved ?? null);
}

async function renderedLevels(page: Page) {
  return page.evaluate(async () => {
    const off = (window as unknown as { __off: OfflineAudioContext }).__off;
    await new Promise((r) => setTimeout(r, 150));
    const x = (await off.startRendering()).getChannelData(0);
    let peak = 0;
    let sum = 0;
    let count = 0;
    for (const v of x) {
      const a = Math.abs(v);
      peak = Math.max(peak, a);
      if (a > 0.001) {
        sum += v * v;
        count += 1;
      }
    }
    return { peakDb: 20 * Math.log10(peak), rmsDb: 10 * Math.log10(sum / Math.max(1, count)) };
  });
}

const CUES = ['Buzzer', 'Bell', 'PAROU! ("STOP!")'];
const EXTRA = 'Extra loud (for rooms with music)';

const timerCues = (page: Page) => page.getByRole('radiogroup', { name: 'Training end cue' });
const boardCues = (page: Page) => page.getByRole('radiogroup', { name: 'Match end cue' });
const timerEnd = (page: Page) => page.getByRole('group', { name: 'Preview cues' }).getByRole('button', { name: 'End' });
const boardEnd = (page: Page) => page.getByRole('group', { name: 'Preview match cues' }).getByRole('button', { name: 'End' });
const oscCount = (page: Page) => page.evaluate(() => (window as unknown as { __osc: () => number }).__osc());

test('Timer: three end cue buttons + Extra loud; old Buzzer sound list is gone; choice is remembered', async ({ page }) => {
  await prep(page);
  await page.goto('/training/control');
  await expect(timerCues(page).getByRole('radio')).toHaveText(CUES);
  await expect(timerCues(page).getByRole('radio', { name: 'Buzzer', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Buzzer sound' })).toHaveCount(0);
  await expect(page.getByText(/Arena horn|Air horn|Triple beep/)).toHaveCount(0);
  await expect(page.getByLabel(EXTRA)).not.toBeChecked();

  await timerCues(page).getByRole('radio', { name: 'Bell' }).click();
  await page.getByLabel(EXTRA).check();
  await page.reload();
  await expect(timerCues(page).getByRole('radio', { name: 'Bell' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel(EXTRA)).toBeChecked();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('matboard.audio.v1') ?? '{}'));
  expect(saved.endCue).toBe('bell');
  expect(saved.extraLoud).toBe(true);
  // Existing sound controls are still there.
  for (const label of ['Mute', 'Vibrate']) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  await expect(page.getByRole('slider')).toBeVisible();
});

test('Scoreboard has the same control, in sync with the Timer on this device', async ({ page }) => {
  await prep(page);
  await page.goto('/training/control');
  await timerCues(page).getByRole('radio', { name: 'Bell' }).click();
  await page.getByLabel(EXTRA).check();

  await page.goto('/match/control');
  await expect(boardCues(page).getByRole('radio')).toHaveText(CUES);
  await expect(boardCues(page).getByRole('radio', { name: 'Bell' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel(EXTRA)).toBeChecked();

  await boardCues(page).getByRole('radio', { name: /PAROU/ }).click();
  await page.getByLabel(EXTRA).uncheck();
  await page.goto('/training/control');
  await expect(timerCues(page).getByRole('radio', { name: /PAROU/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel(EXTRA)).not.toBeChecked();
});

test('Picking a cue does not play it; the End preview plays the Bell loud but unclipped', async ({ page }) => {
  await prep(page);
  await page.goto('/training/control');
  await timerCues(page).getByRole('radio', { name: 'Bell' }).click();
  await page.waitForTimeout(150);
  expect(await oscCount(page)).toBe(0);
  await timerEnd(page).click();
  await expect.poll(() => oscCount(page)).toBeGreaterThan(0);
  const { peakDb, rmsDb } = await renderedLevels(page);
  expect(peakDb).toBeLessThan(0);
  expect(peakDb).toBeGreaterThan(-1.5);
  expect(rmsDb).toBeGreaterThan(-16);
});

test('Scoreboard End preview follows the choice (Bell)', async ({ page }) => {
  await prep(page, { endCue: 'bell', loudV2: true });
  await page.goto('/match/control');
  await boardEnd(page).click();
  await expect.poll(() => oscCount(page)).toBeGreaterThan(0);
  const { peakDb } = await renderedLevels(page);
  expect(peakDb).toBeLessThan(0);
  expect(peakDb).toBeGreaterThan(-1.5);
});

test('Buzzer at full volume is louder than the old buzzer (old: -8.4 dBFS RMS)', async ({ page }) => {
  await prep(page);
  await page.goto('/training/control');
  await timerEnd(page).click();
  const { peakDb, rmsDb } = await renderedLevels(page);
  expect(peakDb).toBeLessThan(0);
  expect(rmsDb).toBeGreaterThan(-7.5);
});

test('saved draft buzzer sounds migrate: Triple beep -> Buzzer, Boxing bell -> Bell, Parou kept', async ({ page }) => {
  await prep(page, { endCue: 'buzzer', buzzerSound: 'triple', loudV2: true });
  await page.goto('/training/control');
  await expect(timerCues(page).getByRole('radio', { name: 'Buzzer', exact: true })).toHaveAttribute('aria-checked', 'true');

  const bell = await page.context().newPage();
  await prep(bell, { endCue: 'buzzer', buzzerSound: 'bell', loudV2: true });
  await bell.goto('/training/control');
  await expect(timerCues(bell).getByRole('radio', { name: 'Bell' })).toHaveAttribute('aria-checked', 'true');

  await bell.evaluate(() => {
    localStorage.setItem('matboard.audio.v1', JSON.stringify({ endCue: 'parou', buzzerSound: 'arena', loudV2: true }));
  });
  await bell.reload();
  await expect(timerCues(bell).getByRole('radio', { name: /PAROU/ })).toHaveAttribute('aria-checked', 'true');
});

test('volume slider still scales the sound', async ({ page }) => {
  await prep(page, { volume: 0.25, loudV2: true });
  await page.goto('/training/control');
  await timerEnd(page).click();
  const quiet = await renderedLevels(page);
  expect(quiet.peakDb).toBeLessThan(-10);
  expect(quiet.peakDb).toBeGreaterThan(-14);
});

test('Mute silences the End preview', async ({ page }) => {
  await prep(page, { muted: true, loudV2: true });
  await page.goto('/training/control');
  await timerEnd(page).click();
  await page.waitForTimeout(200);
  expect(await oscCount(page)).toBe(0);
});
