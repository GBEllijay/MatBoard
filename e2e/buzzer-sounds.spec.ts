import { expect, test, type Page } from '@playwright/test';

/**
 * Round timer Buzzer sound picker. AudioContext is swapped for an
 * OfflineAudioContext so a Test tap can be rendered and its loudness measured.
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

test('Rounds controller: five buzzer sounds, each with a Test button; choice is remembered', async ({ page }) => {
  await prep(page);
  await page.goto('/training/control');
  const group = page.getByRole('radiogroup', { name: 'Buzzer sound' });
  await expect(group.getByRole('radio')).toHaveText([
    /Original buzzer/,
    /Arena horn/,
    /Air horn/,
    /Boxing bell/,
    /Triple beep/,
  ]);
  await expect(group.getByRole('radio', { name: /Original buzzer/ })).toHaveAttribute('aria-checked', 'true');
  for (const name of ['Original buzzer', 'Arena horn', 'Air horn', 'Boxing bell', 'Triple beep']) {
    await expect(page.getByRole('button', { name: `Test ${name}` })).toBeVisible();
  }

  await group.getByRole('radio', { name: /Air horn/ }).click();
  await expect(group.getByRole('radio', { name: /Air horn/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Extra loud (for rooms with music)').check();
  await page.reload();
  await expect(page.getByRole('radiogroup', { name: 'Buzzer sound' }).getByRole('radio', { name: /Air horn/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Extra loud (for rooms with music)')).toBeChecked();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('matboard.audio.v1') ?? '{}'));
  expect(saved.buzzerSound).toBe('airhorn');
  // The existing end-cue choice is untouched by picking a buzzer sound.
  await expect(page.getByRole('radiogroup', { name: 'Training end cue' }).getByRole('radio', { name: 'Buzzer' })).toHaveAttribute('aria-checked', 'true');
});

test('Test plays the sound without changing the saved choice, loud but unclipped', async ({ page }) => {
  await prep(page);
  await page.goto('/training/control');
  await page.getByRole('button', { name: 'Test Triple beep' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __osc: () => number }).__osc())).toBeGreaterThan(0);
  const { peakDb, rmsDb } = await renderedLevels(page);
  expect(peakDb).toBeLessThan(0);
  expect(peakDb).toBeGreaterThan(-1.5);
  expect(rmsDb).toBeGreaterThan(-9);
  await expect(page.getByRole('radiogroup', { name: 'Buzzer sound' }).getByRole('radio', { name: /Original buzzer/ })).toHaveAttribute('aria-checked', 'true');
});

test('Original buzzer at full volume is louder than the old buzzer (old: -8.4 dBFS RMS)', async ({ page }) => {
  await prep(page);
  await page.goto('/training/control');
  await page.getByRole('button', { name: 'Test Original buzzer' }).click();
  const { peakDb, rmsDb } = await renderedLevels(page);
  expect(peakDb).toBeLessThan(0);
  expect(rmsDb).toBeGreaterThan(-7.5);
});

test('volume slider still scales the sound', async ({ page }) => {
  await prep(page, { volume: 0.25, loudV2: true });
  await page.goto('/training/control');
  await page.getByRole('button', { name: 'Test Original buzzer' }).click();
  const quiet = await renderedLevels(page);
  expect(quiet.peakDb).toBeLessThan(-10);
  expect(quiet.peakDb).toBeGreaterThan(-14);
});

test('Mute silences the Test buttons', async ({ page }) => {
  await prep(page, { muted: true, loudV2: true });
  await page.goto('/training/control');
  await page.getByRole('button', { name: 'Test Arena horn' }).click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { __osc: () => number }).__osc())).toBe(0);
});
