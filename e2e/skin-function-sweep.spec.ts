import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

/**
 * Skin function sweep. Every skin the Media+ picker offers, on the round timer and the
 * scoreboard, display and controller, at phone portrait and landscape: the skin must
 * not swallow a single tap. Taps land at the control's on-screen center (like a finger),
 * after checking that the topmost element there is the control itself, so a decorative
 * layer painted over a button fails here with its class name. Every check reads the
 * real state (clock digits, saved score, phase line), not just that a click happened.
 *
 * Unlocked with the same legacy on-device Pro flag the skin-picker spec uses; no codes or secrets.
 */

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };
const VIEWPORTS = [
  ['portrait', PORTRAIT],
  ['landscape', LANDSCAPE],
] as const;
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

/** [stored id, picker label]. Classic and Advantage first, then every polished family, Calçadão after Brasil. */
const TIMER_SKINS = [
  ['classic', 'Classic'],
  ['themed', 'Advantage'],
  ['kids-arcade', 'Kids Arcade'],
  ['kids-sticker', 'Kids Sticker'],
  ['keynote', 'Keynote'],
  ['heavy-metal', 'Heavy Metal'],
  ['brasil', 'Brasil'],
  ['calcadao', 'Calçadão'],
  ['woodblock', 'Woodblock'],
  ['reggae', 'Reggae'],
  ['psychedelic', 'Psychedelic'],
  ['visionary', 'Visionary'],
] as const;

/** [stored id, picker label, suite board]. Old School and Quick Result live on the suite board. */
const BOARD_SKINS = [
  ['MOCK_TOURNAMENT', 'Mock-Tournament', false],
  ['OLD_SCHOOL', 'Old School', true],
  ['QUICK_RESULT', 'Quick Result', true],
  ['KIDS_ARCADE', 'Kids Arcade', false],
  ['KIDS_STICKER', 'Kids Sticker', false],
  ['KEYNOTE', 'Keynote', false],
  ['HEAVY_METAL', 'Heavy Metal', false],
  ['BRASIL', 'Brasil', false],
  ['WOODBLOCK', 'Woodblock', false],
  ['REGGAE', 'Reggae', false],
  ['PSYCHEDELIC', 'Psychedelic', false],
  ['VISIONARY', 'Visionary', false],
] as const;

function trainingState() {
  return {
    workMs: 300000,
    breakMs: 30000,
    rounds: 5,
    endless: false,
    remainingMs: 300000,
    running: false,
    startedAt: null,
    phase: 'work',
    currentRound: 1,
    warned: false,
    startSound: false,
    warningSound: false,
    endSound: false,
  };
}

function matchState(skin: string) {
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
    endCue: 'buzzer',
    bracketMatchId: null,
    autoAnnounce: false,
    skin,
    outcome: null,
    outcomeFlash: null,
    revision: 4,
  };
}

/** A phone with a fake fullscreen API (headless has none) and window.open recorded. */
async function phone(browser: Browser, viewport: { width: number; height: number }, extra: Record<string, string>) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, userAgent: ANDROID_UA });
  const page = await context.newPage();
  await page.addInitScript((extra) => {
    const fs = { element: null as Element | null, enters: 0, exits: 0, popups: [] as string[] };
    (window as unknown as { __fs: typeof fs }).__fs = fs;
    Element.prototype.requestFullscreen = function () {
      fs.enters += 1;
      fs.element = document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    document.exitFullscreen = async () => {
      fs.exits += 1;
      fs.element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fs.element });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    window.open = ((url?: string | URL) => {
      fs.popups.push(String(url));
      return null;
    }) as typeof window.open;
    if (sessionStorage.getItem('skin-sweep-seeded')) return;
    sessionStorage.setItem('skin-sweep-seeded', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.legacyNoticeDismissed', '1');
    localStorage.setItem('matboard.tvTip.v1', '1');
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
  }, extra);
  // Motion stays ON on purpose: the Visionary eye only covered the clock with its live animation running.
  return page;
}

/** The topmost element at the control's center must be the control (or inside it). */
async function centerOf(page: Page, target: Locator, what: string) {
  await expect(target, `${what} is visible`).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`${what}: no box`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = await target.evaluate((el, [px, py]) => {
    const top = document.elementFromPoint(px, py);
    if (!top) return 'nothing';
    if (el === top || el.contains(top)) return 'ok';
    const cls = typeof top.className === 'string' ? top.className : (top.getAttribute('class') ?? '');
    return `${top.tagName.toLowerCase()}${cls ? '.' + cls.trim().split(/\s+/).join('.') : ''}`;
  }, [x, y] as const);
  expect(hit, `${what}: the tap at its center lands on ${hit} instead`).toBe('ok');
  return { x, y };
}

async function tap(page: Page, target: Locator, what: string) {
  const { x, y } = await centerOf(page, target, what);
  await page.touchscreen.tap(x, y);
}

/** Press and hold with the mouse (the score tiles subtract on a hold). */
async function hold(page: Page, target: Locator, what: string) {
  const { x, y } = await centerOf(page, target, what);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
}

const saved = <T>(page: Page, key: string) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), key) as Promise<T>;

type Training = { endless: boolean; currentRound: number };
type Side = { points: number; advantages: number; disadvantages: number };
type Match = { running: boolean; blue: Side; white: Side; endCue: string; durationMs: number };

/** Read the clock text (polished timer digits sit in the aria-label). */
async function clockText(clock: Locator) {
  const label = await clock.getAttribute('aria-label');
  const m = label?.match(/^(\d+:\d\d)/);
  return m ? m[1] : ((await clock.textContent()) ?? '').trim();
}

/**
 * Tap starts the clock (the time moves), a second tap pauses it (the time holds).
 * The training store never saves `running`, so the moving digits are the truth there;
 * the match store saves it, so the scoreboard checks that too.
 */
async function expectRunsThenPauses(page: Page, clock: Locator, what: string, running?: () => Promise<boolean>) {
  const before = await clockText(clock);
  await tap(page, clock, `${what} (start)`);
  if (running) await expect.poll(running, { message: `${what}: tap starts the clock` }).toBe(true);
  await expect.poll(() => clockText(clock), { message: `${what}: tap starts the clock, the time counts down`, timeout: 5000 }).not.toBe(before);
  await tap(page, clock, `${what} (pause)`);
  if (running) await expect.poll(running, { message: `${what}: second tap pauses` }).toBe(false);
  await page.waitForTimeout(300);
  const paused = await clockText(clock);
  await page.waitForTimeout(1500);
  expect(await clockText(clock), `${what}: second tap pauses, the time holds`).toBe(paused);
}

for (const [vpName, viewport] of VIEWPORTS) {
  for (const [skin, label] of TIMER_SKINS) {
    test(`timer display · ${label} · ${vpName}: clock tap starts/pauses, round line goes fullscreen, empty tap opens Options, sounds, rounds and reset work`, async ({ browser }) => {
      const page = await phone(browser, viewport, {
        'matboard.training.v1': JSON.stringify(trainingState()),
        'matboard.trainingSkin.v1': skin,
      });
      await page.goto('/training');
      const polished = !['classic', 'themed'].includes(skin);
      if (polished) await expect(page.locator(`.skin-root[data-skin="${skin}"]:not(.skin-root--loading)`)).toBeVisible();
      else await expect(page.locator('.skin-root')).toHaveCount(0);
      await page.waitForTimeout(300);
      const clock = page.locator(polished ? 'button.tm-clock' : 'button.training__clock');
      const phase = page.locator(polished ? 'button.tm-phase' : 'button.training__phase');
      // 1. The center clock.
      await expectRunsThenPauses(page, clock, 'center clock');
      await expect(page.getByRole('dialog', { name: 'Training options' }), 'clock taps never open Options').toHaveCount(0);

      // 2. The round line toggles fullscreen and does not open Options. In portrait it enters,
      // then leaves. Phone landscape is already fullscreen and the page asks for it again
      // right away (the stub always grants it), so there the check is that the tap asked to leave.
      const main = page.locator('main.training');
      const fsCalls = () => page.evaluate(() => (window as unknown as { __fs: { enters: number; exits: number } }).__fs);
      if (viewport === LANDSCAPE) {
        await expect(main).toHaveClass(/\bplay--fs\b/);
        const before = await fsCalls();
        await tap(page, phase, 'round line');
        await expect.poll(async () => (await fsCalls()).exits, { message: 'round line leaves fullscreen' }).toBeGreaterThan(before.exits);
      } else {
        await tap(page, phase, 'round line');
        await expect(main, 'round line enters fullscreen').toHaveClass(/\bplay--fs\b/);
        await expect(page.getByRole('dialog', { name: 'Training options' })).toHaveCount(0);
        await tap(page, phase, 'round line (exit)');
        await expect(main, 'round line leaves fullscreen').not.toHaveClass(/\bplay--fs\b/);
      }
      await expect(page.getByRole('dialog', { name: 'Training options' })).toHaveCount(0);

      // 3. A tap away from the clock opens Options.
      await page.touchscreen.tap(Math.round(viewport.width / 2), viewport.height - 12);
      const sheet = page.getByRole('dialog', { name: 'Training options' });
      await expect(sheet, 'empty tap opens Options').toBeVisible();

      // 4. Sound: end cue buttons, Extra loud, End preview.
      const cues = sheet.getByRole('radiogroup', { name: 'Training end cue' });
      for (const cue of ['Bell', 'PAROU! ("STOP!")', 'Buzzer']) {
        await cues.getByRole('radio', { name: cue }).click();
        await expect(cues.getByRole('radio', { name: cue })).toHaveAttribute('aria-checked', 'true');
      }
      const loud = sheet.getByRole('checkbox', { name: 'Extra loud (for rooms with music)' });
      await loud.click();
      await expect(loud).toBeChecked();
      await sheet.getByRole('checkbox', { name: 'Training end sound' }).click();
      await sheet.getByRole('group', { name: 'Preview cues' }).getByRole('button', { name: 'End' }).click();

      // 5. Rounds: Endless, then back to Counted; the phase line follows.
      await sheet.getByRole('button', { name: 'Endless', exact: true }).click();
      await expect.poll(async () => (await saved<Training>(page, 'matboard.training.v1')).endless).toBe(true);
      await sheet.getByRole('button', { name: 'Counted', exact: true }).click();
      await expect.poll(async () => (await saved<Training>(page, 'matboard.training.v1')).endless).toBe(false);

      // 6. Reset: run the clock, then Reset session puts it back to 05:00 round 1.
      await page.getByRole('button', { name: 'Close options' }).click({ position: { x: 5, y: 5 } });
      await expect(sheet).toHaveCount(0);
      await tap(page, clock, 'center clock (before reset)');
      await expect.poll(() => clockText(clock), { timeout: 5000 }).not.toBe('05:00');
      await page.touchscreen.tap(Math.round(viewport.width / 2), viewport.height - 12);
      await expect(sheet).toBeVisible();
      await sheet.getByRole('button', { name: 'Reset session' }).click();
      await expect(sheet).toHaveCount(0);
      await expect.poll(() => clockText(clock)).toBe('05:00');
      await page.waitForTimeout(1200);
      expect(await clockText(clock), 'reset leaves the clock stopped').toBe('05:00');
      await page.context().close();
    });

    test(`timer controller · ${label} · ${vpName}: pick the skin, clock tap and Start/Pause, sounds, rounds, Rounds chip`, async ({ browser }) => {
      const page = await phone(browser, viewport, {
        'matboard.training.v1': JSON.stringify(trainingState()),
        'matboard.trainingSkin.v1': skin === 'classic' ? 'themed' : 'classic',
      });
      await page.goto('/training/control');
      // Pick it from the Skins popup.
      await page.getByRole('button', { name: /^Timer skins/ }).click();
      await page.getByRole('dialog', { name: 'Timer skins' }).getByRole('radio', { name: label, exact: true }).click();
      expect(await page.evaluate(() => localStorage.getItem('matboard.trainingSkin.v1'))).toBe(skin);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Timer skins' })).toHaveCount(0);

      const clock = page.locator('button.clock-btn--control');
      await expectRunsThenPauses(page, clock, 'controller clock');
      const start = page.locator('.training-control__actions').getByRole('button');
      await tap(page, start, 'Start button');
      await expect(start).toHaveText('Pause');
      await tap(page, start, 'Pause button');
      await expect(start).toHaveText('Start');

      const cues = page.getByRole('radiogroup', { name: 'Training end cue' });
      for (const cue of ['Bell', 'PAROU! ("STOP!")', 'Buzzer']) {
        await tap(page, cues.getByRole('radio', { name: cue }), `${cue} cue`);
        await expect(cues.getByRole('radio', { name: cue })).toHaveAttribute('aria-checked', 'true');
      }
      await page.getByRole('button', { name: 'Endless', exact: true }).click();
      await expect(page.locator('.training-control__phase')).toContainText('Endless');
      await page.getByRole('button', { name: 'Counted', exact: true }).click();
      await expect(page.locator('.training-control__phase')).toContainText('Round 1 / 5');

      // Rounds chip: on a phone it opens the timer fullscreen here, painted in the picked skin.
      await tap(page, page.locator('.chrome__right').getByRole('button', { name: 'Rounds', exact: true }), 'Rounds chip');
      await expect(page).toHaveURL(/\/training$/);
      await expect(page.locator('main.training')).toHaveClass(/play--fs/);
      if (!['classic', 'themed'].includes(skin)) await expect(page.locator(`.skin-root[data-skin="${skin}"]`)).toBeVisible();
      await page.context().close();
    });
  }

  for (const [skin, label, suite] of BOARD_SKINS) {
    const q = suite ? '?from=suite' : '';
    test(`scoreboard display · ${label} · ${vpName}: score tiles add and subtract, clock and status toggle, links open the Controller`, async ({ browser }) => {
      const page = await phone(browser, viewport, { 'matboard.match.v1': JSON.stringify(matchState(skin)) });
      await page.goto(`/match${q}`);
      const polished = !['MOCK_TOURNAMENT', 'OLD_SCHOOL', 'QUICK_RESULT'].includes(skin);
      if (polished) await expect(page.locator('.skin-root:not(.skin-root--loading)')).toBeVisible();
      await page.waitForTimeout(300);
      const match = () => saved<Match>(page, 'matboard.match.v1');

      for (const side of ['blue', 'white'] as const) {
        const region = page.getByRole('region', { name: `${side === 'blue' ? 'Blue' : 'White'} competitor` });
        for (const [kind, short] of [
          ['points', 'Points'],
          ['advantages', 'Adv'],
          ['disadvantages', 'Pen'],
        ] as const) {
          const tile = region.getByRole('button', { name: new RegExp(`^${short} \\d+\\.`) });
          // Up to 4 (covers a 2-, 3- and 4-point score), then a hold takes one off.
          for (let n = 1; n <= (kind === 'points' ? 4 : 2); n++) {
            await tap(page, tile, `${side} ${short} tile`);
            await expect.poll(async () => (await match())[side][kind], { message: `${side} ${kind} tap ${n}` }).toBe(n);
            await expect(tile).toHaveAccessibleName(new RegExp(`^${short} ${n}\\.`));
          }
          const top = kind === 'points' ? 4 : 2;
          await hold(page, tile, `${side} ${short} tile (hold)`);
          await expect.poll(async () => (await match())[side][kind], { message: `${side} ${kind} hold subtracts` }).toBe(top - 1);
        }
      }
      expect(page.url(), 'no score tap leaked to the board and opened the Controller').toContain('/match');
      expect(page.url()).not.toContain('/control');

      const clock = page.getByRole('button', { name: 'Start or pause match clock' });
      await expectRunsThenPauses(page, clock, 'match clock', async () => (await match()).running);
      const status = page.getByRole('button', { name: /^(Start|Pause|Restart) match clock$/ });
      await tap(page, status, 'clock status (start)');
      await expect.poll(async () => (await match()).running).toBe(true);
      await tap(page, status, 'clock status (pause)');
      await expect.poll(async () => (await match()).running).toBe(false);

      // The Skins popup on the display still opens (the chrome is hidden in phone landscape).
      if (viewport === PORTRAIT) {
        await tap(page, page.getByRole('button', { name: /^Scoreboard skins/ }), 'Skins button');
        await expect(page.getByRole('dialog', { name: 'Scoreboard skins' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Scoreboard skins' })).toHaveCount(0);
      }

      // Name link opens the Controller on that field.
      await tap(page, page.getByRole('link', { name: 'Edit Blue name on Controller' }), 'Blue name link');
      await expect(page).toHaveURL(/\/match\/control/);
      await page.context().close();
    });

    test(`scoreboard controller · ${label} · ${vpName}: pick the skin, +1/−1 for both athletes, clock, nudges, resets, presets, sounds`, async ({ browser }) => {
      const page = await phone(browser, viewport, {
        'matboard.match.v1': JSON.stringify(matchState(skin === 'MOCK_TOURNAMENT' ? 'KEYNOTE' : 'MOCK_TOURNAMENT')),
      });
      await page.goto(`/match/control${q}`);
      await page.getByRole('button', { name: /^Scoreboard skins/ }).first().click();
      await page.getByRole('dialog', { name: 'Scoreboard skins' }).getByRole('radio', { name: label, exact: true }).click();
      await page.keyboard.press('Escape');
      const match = () => saved<Match>(page, 'matboard.match.v1');
      await expect.poll(async () => (await match() as unknown as { skin: string }).skin).toBe(skin);

      for (const side of ['blue', 'white'] as const) {
        const pad = page.locator(`section.pad--${side}`);
        for (const kind of ['points', 'advantages', 'disadvantages'] as const) {
          const box = pad.locator(`.fat-score--${kind}`);
          for (let n = 1; n <= 4; n++) {
            await tap(page, box.getByRole('button', { name: '+1' }), `${side} ${kind} +1`);
            await expect.poll(async () => (await match())[side][kind]).toBe(n);
          }
          await expect(box.locator('strong')).toHaveText('4');
          await tap(page, box.getByRole('button', { name: '−1' }), `${side} ${kind} −1`);
          await expect.poll(async () => (await match())[side][kind]).toBe(3);
        }
      }

      const clock = page.locator('button.clock-btn--control');
      await expectRunsThenPauses(page, clock, 'controller match clock', async () => (await match()).running);
      const startBtn = page.locator('.controller__clock-actions').getByRole('button').first();
      await tap(page, startBtn, 'Start button');
      await expect.poll(async () => (await match()).running).toBe(true);
      await tap(page, startBtn, 'Pause button');
      await expect.poll(async () => (await match()).running).toBe(false);

      await tap(page, page.getByRole('button', { name: 'Reset clock' }), 'Reset clock');
      await expect(clock).toHaveText('05:00');
      await tap(page, page.getByRole('button', { name: /^Subtract \d+ seconds$/ }).first(), 'clock nudge −');
      await expect(clock).not.toHaveText('05:00');
      await tap(page, page.getByRole('button', { name: 'Reset clock' }), 'Reset clock');
      await tap(page, page.getByRole('button', { name: 'Reset scores' }), 'Reset scores');
      await expect.poll(async () => {
        const m = await match();
        return [m.blue.points, m.blue.advantages, m.blue.disadvantages, m.white.points, m.white.advantages, m.white.disadvantages];
      }).toEqual([0, 0, 0, 0, 0, 0]);

      const presets = page.getByRole('group', { name: 'Match length presets' }).getByRole('button', { name: / minutes$/ });
      await tap(page, presets.first(), 'match length preset');
      await expect.poll(async () => (await match()).durationMs).not.toBe(300000);

      const cues = page.getByRole('radiogroup', { name: 'Match end cue' });
      for (const [cue, id] of [['Bell', 'bell'], ['PAROU! ("STOP!")', 'parou'], ['Buzzer', 'buzzer']] as const) {
        await tap(page, cues.getByRole('radio', { name: cue }), `${cue} cue`);
        await expect.poll(async () => (await match()).endCue).toBe(id);
      }
      const loud = page.getByRole('checkbox', { name: 'Extra loud (for rooms with music)' });
      await loud.click();
      await expect(loud).toBeChecked();
      await page.context().close();
    });
  }
}
