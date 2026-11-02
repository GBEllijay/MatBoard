import { expect, test, type Browser, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tv', width: 1920, height: 1080 },
] as const;

const MASTERS = ['classic', 'a', 'b', 'c', 'd'] as const;

function pointsMatch(points: number, extra?: { advantages?: number; disadvantages?: number; remainingMs?: number }) {
  return {
    blue: {
      name: 'Mia Santos',
      gym: 'Alliance',
      rank: '',
      points,
      advantages: extra?.advantages ?? 1,
      disadvantages: extra?.disadvantages ?? 0,
    },
    white: {
      name: 'Leo Park',
      gym: 'Checkmat',
      rank: '',
      points: 0,
      advantages: 0,
      disadvantages: 1,
    },
    round: 'Final',
    division: 'Kids',
    durationMs: 300000,
    remainingMs: extra?.remainingMs ?? 0,
    running: false,
    startedAt: null,
    startBeep: false,
    warningBeep: false,
    warned: true,
    endBuzzer: false,
    endCue: 'off',
    bracketMatchId: null,
    autoAnnounce: false,
    skin: 'mock-tournament',
    grandmaster: { enabled: true, onWin: false, onPoints: true, pointsThreshold: 1 },
    outcome: null,
    outcomeFlash: null,
    revision: 4,
  };
}

async function seed(page: Page, storage: Record<string, unknown>) {
  await page.addInitScript((bag) => {
    localStorage.setItem('advantage.proUnlocked', '1');
    for (const [key, value] of Object.entries(bag)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, storage);
}

async function bubbleClearOfFace(page: Page) {
  return page.evaluate(() => {
    const face = document.querySelector('.kids-grandmaster__face');
    const bubble = document.querySelector('.kids-grandmaster__bubble');
    if (!(face instanceof HTMLElement) || !(bubble instanceof HTMLElement)) {
      return { shown: false, tiny: false, hits: ['missing face or bubble'] };
    }
    const fr = face.getBoundingClientRect();
    const br = bubble.getBoundingClientRect();
    const hits: string[] = [];
    if (fr.width < 20 || fr.height < 20) hits.push(`face ${Math.round(fr.width)}x${Math.round(fr.height)}`);
    const boxes = [face, ...document.querySelectorAll('.kids-grandmaster__avoid')];
    boxes.forEach((node, index) => {
      if (!(node instanceof HTMLElement)) return;
      const box = node.getBoundingClientRect();
      const ix = Math.min(box.right, br.right) - Math.max(box.left, br.left);
      const iy = Math.min(box.bottom, br.bottom) - Math.max(box.top, br.top);
      if (ix > 1 && iy > 1) {
        hits.push(`bubble overlaps ${index === 0 ? 'face' : 'hand'} by ${Math.round(ix)}x${Math.round(iy)}`);
      }
    });
    const boardCheer = document.querySelector('.kids-grandmaster--board');
    if (boardCheer) {
      const figure = document.querySelector('.kids-grandmaster__figure');
      const blockers = [figure, bubble].filter((node): node is HTMLElement => node instanceof HTMLElement);
      for (const card of document.querySelectorAll('.display .score')) {
        if (!(card instanceof HTMLElement)) continue;
        const box = card.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) continue;
        for (const node of blockers) {
          const cover = node.getBoundingClientRect();
          const ix = Math.min(box.right, cover.right) - Math.max(box.left, cover.left);
          const iy = Math.min(box.bottom, cover.bottom) - Math.max(box.top, cover.top);
          if (ix > 1 && iy > 1) hits.push(`cheer covers ${card.className} by ${Math.round(ix)}x${Math.round(iy)}`);
        }
      }
    }
    const view = { w: window.innerWidth, h: window.innerHeight };
    if (br.left < -1 || br.top < -1 || br.right > view.w + 1 || br.bottom > view.h + 1) {
      hits.push(
        `bubble off screen ${Math.round(br.left)},${Math.round(br.top)} ${Math.round(br.right)}x${Math.round(br.bottom)} in ${view.w}x${view.h}`,
      );
    }
    return { shown: true, tiny: fr.width < 20 || fr.height < 20, hits };
  });
}

async function expectBubbleClear(page: Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss' });
  if (await dismiss.count()) await dismiss.click();
  const report = await bubbleClearOfFace(page);
  expect(report.shown, 'grandmaster face and bubble').toBe(true);
  expect(report.hits, report.hits.join(' | ')).toEqual([]);
}

/** Board cheer under 600px has no bubble. The figure stays in the 100–110px face range. */
async function expectPhoneBoardFigure(page: Page) {
  await expect(page.locator('.kids-grandmaster--board .kids-grandmaster__bubble')).toHaveCount(0);
  const width = await page.locator('.kids-grandmaster__figure').evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThanOrEqual(100);
  expect(width).toBeLessThanOrEqual(110);
}

async function expectFullscreenClear(page: Page) {
  const hits = await page.evaluate(() => {
    const button = document.querySelector('.play-fs');
    if (!(button instanceof HTMLElement)) return [] as string[];
    const fr = button.getBoundingClientRect();
    if (fr.width < 2 || fr.height < 2) return [] as string[];
    const hits: string[] = [];
    for (const node of document.querySelectorAll('.score, .score__label, .score__value')) {
      if (!(node instanceof HTMLElement)) continue;
      const box = node.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const ix = Math.min(fr.right, box.right) - Math.max(fr.left, box.left);
      const iy = Math.min(fr.bottom, box.bottom) - Math.max(fr.top, box.top);
      if (ix <= 1 || iy <= 1) continue;
      const text = (node.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 32);
      hits.push(`${text || node.className} ${Math.round(ix)}x${Math.round(iy)}`);
    }
    return hits;
  });
  expect(hits, hits.join(' | ')).toEqual([]);
}

async function openSeeded(browser: Browser, width: number, height: number, storage: Record<string, unknown>) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, storage);
  return { context, page };
}

test('points-scored cheer keeps text off each grandmaster’s face', async ({ browser }) => {
  const storage = {
    'matboard.match.v1': pointsMatch(4),
    'matboard.kidsScoreboard.v1': { enabled: true, skin: 'dinos', mascot: true },
  };

  for (const master of MASTERS) {
    for (const viewport of VIEWPORTS) {
      const board = await openSeeded(browser, viewport.width, viewport.height, storage);
      await board.page.goto(`/match?from=suite&grandmaster=${master}`);
      await expect(board.page.locator('.kids-grandmaster')).toHaveAttribute('data-grandmaster', master);
      await expect(board.page.locator('.kids-grandmaster__frame').first()).toHaveAttribute(
        'src',
        `/assets/kids/grandmaster-${master}.webp`,
      );
      if (viewport.width <= 599) {
        await expectPhoneBoardFigure(board.page);
      } else {
        await expect(board.page.locator('.kids-grandmaster__score')).toHaveText('4');
        await expect(board.page.locator('.kids-grandmaster__cheer')).toHaveText('Bom trabalho!');
        await expect(board.page.locator('.kids-grandmaster__name')).toHaveText('Mia Santos');
      }
      if (master === 'd') {
        const nod = board.page.locator('.kids-grandmaster__frame--nod');
        await expect(nod).toHaveAttribute('src', '/assets/kids/grandmaster-d-nod.webp');
        await expect(nod).toHaveCSS('opacity', '0');
      } else {
        await expect(board.page.locator('.kids-grandmaster__frame--nod')).toHaveCount(0);
      }
      if (viewport.width > 599) await expectBubbleClear(board.page);
      await expectFullscreenClear(board.page);
      await board.context.close();

      const kids = await openSeeded(browser, viewport.width, viewport.height, storage);
      await kids.page.goto(`/match?from=suite&kids=dinos&grandmaster=${master}`);
      await expect(kids.page.locator('.kids-grandmaster__frame').first()).toHaveAttribute(
        'src',
        `/assets/kids/grandmaster-${master}.webp`,
      );
      await expect(kids.page.locator('.display')).toHaveClass(/kids-board--dinos/);
      if (viewport.width <= 599) {
        await expectPhoneBoardFigure(kids.page);
      } else {
        await expect(kids.page.locator('.kids-grandmaster__score')).toHaveText('4');
        await expectBubbleClear(kids.page);
      }
      await expectFullscreenClear(kids.page);
      await kids.context.close();
    }
  }
});

test('2-point and 3-point cheers use the same points trigger', async ({ browser }) => {
  for (const points of [2, 3]) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1920, height: 1080 },
    ]) {
      const opened = await openSeeded(browser, viewport.width, viewport.height, {
        'matboard.match.v1': pointsMatch(points),
      });
      await opened.page.goto('/match?from=suite');
      if (viewport.width <= 599) {
        await expectPhoneBoardFigure(opened.page);
      } else {
        await expect(opened.page.locator('.kids-grandmaster__score')).toHaveText(String(points));
        await expectBubbleClear(opened.page);
      }
      await opened.context.close();
    }
  }
});

test('advantages and penalties do not bring the grandmaster out', async ({ browser }) => {
  const opened = await openSeeded(browser, 1280, 800, {
    'matboard.match.v1': pointsMatch(0, { advantages: 4, disadvantages: 3 }),
  });
  await opened.page.goto('/match?from=suite');
  await expect(opened.page.locator('.score--advantages .score__value').first()).toHaveText('4');
  await expect(opened.page.locator('.score--disadvantages .score__value').first()).toHaveText('3');
  await expect(opened.page.locator('.kids-grandmaster')).toHaveCount(0);
  await opened.context.close();
});

test('points over the threshold stay hidden until the match ends', async ({ browser }) => {
  const opened = await openSeeded(browser, 1280, 800, {
    'matboard.match.v1': pointsMatch(4, { remainingMs: 120000 }),
  });
  await opened.page.goto('/match?from=suite');
  await expect(opened.page.locator('.clock-btn')).toHaveText('02:00');
  await expect(opened.page.locator('.kids-grandmaster')).toHaveCount(0);
  await opened.context.close();
});

test('post-champion corner keeps text off each grandmaster’s face', async ({ browser }) => {
  const storage = {
    'matboard.kidsScoreboard.v1': { enabled: true, skin: 'dinos', mascot: true },
    'matboard.match.v1': pointsMatch(0, { remainingMs: 300000 }),
    'matboard.tournament.v1': {
      version: 2,
      activeId: 'bracket-1',
      saved: [
        {
          id: 'bracket-1',
          name: 'Kids Finals',
          updatedAt: 1,
          board: {
            version: 1,
            size: 4,
            placement: 'ibjjf',
            title: 'Kids Finals',
            entries: {
              'sf-0-a': 'Mia Santos',
              'sf-0-b': 'Bea Ortiz',
              'sf-1-a': 'Leo Park',
              'sf-1-b': 'Dee Kim',
              champion: 'Mia Santos',
            },
            results: {
              'sf-0': { winnerSide: 'a', call: 'win', method: 'points' },
              'sf-1': { winnerSide: 'a', call: 'win', method: 'points' },
              'final-0': {
                winnerSide: 'a',
                call: 'win',
                method: 'points',
                points: { winner: 4, loser: 2 },
              },
            },
            lastOutcomeMatchId: 'final-0',
          },
        },
      ],
    },
  };

  for (const master of MASTERS) {
    for (const viewport of VIEWPORTS) {
      const opened = await openSeeded(browser, viewport.width, viewport.height, storage);
      await opened.page.goto(`/tournament?from=suite&grandmaster=${master}`);
      await expect(opened.page.locator('.kids-grandmaster--corner')).toHaveAttribute('data-grandmaster', master);
      await expect(opened.page.locator('.kids-grandmaster__frame').first()).toHaveAttribute(
        'src',
        `/assets/kids/grandmaster-${master}.webp`,
      );
      await expect(opened.page.locator('.kids-grandmaster--corner .kids-grandmaster__cheer')).toHaveText('Bom trabalho!');
      await expect(opened.page.locator('.kids-grandmaster--corner .kids-grandmaster__name')).toHaveText('Mia Santos');
      await expect(opened.page.locator('.kids-grandmaster--corner .kids-grandmaster__score')).toHaveText('4-2');
      if (master === 'd') await expect(opened.page.locator('.kids-grandmaster__frame--nod')).toHaveCSS('opacity', '0');
      await expectBubbleClear(opened.page);
      await opened.context.close();
    }
  }
});

test('board cheer stays off names, gyms, score cards, and Home', async ({ browser }) => {
  const storage = { 'matboard.match.v1': pointsMatch(4) };
  const viewports = [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ];
  for (const master of MASTERS) {
    for (const viewport of viewports) {
      const board = await openSeeded(browser, viewport.width, viewport.height, storage);
      await board.page.goto(`/match?from=suite&grandmaster=${master}`);
      await expect(board.page.locator('.kids-grandmaster')).toHaveAttribute('data-grandmaster', master);
      const hits = await board.page.evaluate(() => {
        const figure = document.querySelector('.kids-grandmaster__figure');
        const bubble = document.querySelector('.kids-grandmaster__bubble');
        if (!(figure instanceof HTMLElement)) return ['missing figure'];
        if (window.innerWidth > 599 && !(bubble instanceof HTMLElement)) return ['missing bubble'];
        const covers = [figure.getBoundingClientRect()];
        if (bubble instanceof HTMLElement && getComputedStyle(bubble).display !== 'none') {
          covers.push(bubble.getBoundingClientRect());
        }
        const hits: string[] = [];
        const blockers = document.querySelectorAll('.bout__who h1, .bout__who p, .display .score, .display__chrome a');
        for (const node of blockers) {
          if (!(node instanceof HTMLElement)) continue;
          const box = node.getBoundingClientRect();
          if (box.width < 2 || box.height < 2) continue;
          const label = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
          for (const cover of covers) {
            const ix = Math.min(cover.right, box.right) - Math.max(cover.left, box.left);
            const iy = Math.min(cover.bottom, box.bottom) - Math.max(cover.top, box.top);
            if (ix > 1 && iy > 1) hits.push(`${label || node.className} ${Math.round(ix)}x${Math.round(iy)}`);
          }
        }
        return hits;
      });
      expect(hits, `${master} ${viewport.width}x${viewport.height}: ${hits.join(' | ')}`).toEqual([]);
      if (viewport.width <= 599) await expectPhoneBoardFigure(board.page);
      else await expectBubbleClear(board.page);
      await board.context.close();
    }
  }
});

const LONG_LINES = ['Winner by submission', 'Winner by referee decision', 'Disqualified — Technical'] as const;

async function beginOutcome(
  page: Page,
  outcome: { call: 'win'; method: 'submission'; side: 'blue' | 'white' },
  holdMs = 0,
) {
  await page.evaluate(
    ({ row, holdMs: hold }) => {
      const at = Date.now() + hold;
      const channel = new BroadcastChannel('matboard-match-v1');
      channel.postMessage({
        type: 'action',
        action: {
          type: 'beginOutcome',
          outcome: { ...row, source: 'manual', at },
          flash: { kind: row.call, side: row.side, at },
        },
      });
      channel.close();
    },
    { row: outcome, holdMs },
  );
}

async function bannerHitsFigure(page: Page) {
  return page.evaluate(() => {
    const figure = document.querySelector('.kids-grandmaster__figure');
    if (!(figure instanceof HTMLElement)) return ['missing figure'];
    const cover = figure.getBoundingClientRect();
    const hits: string[] = [];
    for (const node of document.querySelectorAll('.display-splash__name, .display-splash__line')) {
      if (!(node instanceof HTMLElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const label = (node.textContent || '').replace(/\s+/g, ' ').trim();
      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;
        const ix = Math.min(cover.right, rect.right) - Math.max(cover.left, rect.left);
        const iy = Math.min(cover.bottom, rect.bottom) - Math.max(cover.top, rect.top);
        if (ix > 1 && iy > 1) hits.push(`${label} ${Math.round(ix)}x${Math.round(iy)}`);
      }
    }
    return hits;
  });
}

async function statusWordVisible(page: Page, word: 'Paused' | 'Ended') {
  const report = await page.evaluate((expected) => {
    const hint = document.querySelector('.display__clock-hint');
    if (!(hint instanceof HTMLElement)) return { ok: false, reasons: ['missing status'] };
    const text = (hint.textContent || '').replace(/\s+/g, ' ').trim();
    const reasons: string[] = [];
    if (text !== expected) reasons.push(`text ${text}`);
    const range = document.createRange();
    range.selectNodeContents(hint);
    const rect = range.getBoundingClientRect();
    const host = hint.getBoundingClientRect();
    if (rect.width < 12 || rect.height < 8) reasons.push(`tiny ${Math.round(rect.width)}x${Math.round(rect.height)}`);
    if (rect.left < -1 || rect.right > window.innerWidth + 1 || rect.top < -1 || rect.bottom > window.innerHeight + 1) {
      reasons.push('offscreen');
    }
    if (rect.left < host.left - 1 || rect.right > host.right + 1) reasons.push('clipped');
    const style = getComputedStyle(hint);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.9) {
      reasons.push(`hidden ${style.display} ${style.visibility} ${style.opacity}`);
    }
    if (document.querySelector('.display--band-figure')) reasons.push('gutter still reserved');
    return { ok: reasons.length === 0, reasons };
  }, word);
  expect(report.ok, report.reasons.join(' | ')).toBe(true);
}

test('phone banner stays beside the figure and the status word returns when it leaves', async ({ browser }) => {
  const viewports = [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ] as const;
  const sides = [
    { side: 'blue' as const, word: 'Paused' as const, remainingMs: 120000 },
    { side: 'white' as const, word: 'Ended' as const, remainingMs: 0 },
  ];

  for (const master of MASTERS) {
    for (const viewport of viewports) {
      for (const row of sides) {
        const opened = await openSeeded(browser, viewport.width, viewport.height, {
          'matboard.match.v1': {
            ...pointsMatch(4, { remainingMs: row.remainingMs }),
            white: {
              ...pointsMatch(4).white,
              points: 2,
            },
            grandmaster: { enabled: true, onWin: true, onPoints: true, pointsThreshold: 1 },
          },
        });
        await opened.page.goto(`/match?from=suite&grandmaster=${master}`);
        await expect(opened.page.locator('.clock-btn')).toBeVisible();
        await beginOutcome(opened.page, { call: 'win', method: 'submission', side: row.side }, 30_000);
        const splash = opened.page.locator('.display-splash__line');
        await expect(splash).toHaveText('Winner by submission');
        await expect(opened.page.locator('.kids-grandmaster')).toHaveAttribute('data-grandmaster', master);
        const gold = await splash.evaluate((el) => getComputedStyle(el).color);
        expect(gold, `${master} ${viewport.width}`).toBe('rgb(240, 194, 75)');

        if (viewport.width <= 599) {
          await expectPhoneBoardFigure(opened.page);
          const gutter = await opened.page.locator('.display').evaluate((el) => getComputedStyle(el).getPropertyValue('--band-figure-gutter').trim());
          expect(Number.parseFloat(gutter)).toBeGreaterThanOrEqual(100);
          for (const line of LONG_LINES) {
            await opened.page.evaluate((next) => {
              const node = document.querySelector('.display-splash__line');
              if (node) node.textContent = next;
              window.dispatchEvent(new Event('resize'));
            }, line);
            const hits = await bannerHitsFigure(opened.page);
            expect(hits, `${master} ${row.side} ${line}: ${hits.join(' | ')}`).toEqual([]);
          }
        } else {
          await expect(opened.page.locator('.kids-grandmaster__bubble')).toBeVisible();
          await expect(opened.page.locator('.display--band-figure')).toHaveCount(0);
          const width = await opened.page.locator('.kids-grandmaster__figure').evaluate((el) => el.getBoundingClientRect().width);
          expect(width).toBeGreaterThan(110);
          const padding = await opened.page.locator('.display-splash__card').evaluate((el) => getComputedStyle(el).paddingRight);
          expect(padding).toBe('0px');
        }

        await opened.page.evaluate(() => {
          const channel = new BroadcastChannel('matboard-match-v1');
          channel.postMessage({
            type: 'action',
            action: { type: 'setOutcomeFlash', value: null },
          });
          channel.close();
        });
        await expect(opened.page.locator('.display-splash')).toHaveCount(0);
        await opened.page.evaluate(() => {
          const channel = new BroadcastChannel('matboard-match-v1');
          channel.postMessage({
            type: 'action',
            action: { type: 'setGrandmaster', value: { enabled: false } },
          });
          channel.close();
        });
        await expect(opened.page.locator('.kids-grandmaster')).toHaveCount(0);
        await statusWordVisible(opened.page, row.word);
        await opened.context.close();
      }
    }
  }
});

test('a DQ does not bring the grandmaster out', async ({ browser }) => {
  const match = {
    ...pointsMatch(4),
    grandmaster: { enabled: true, onWin: true, onPoints: true, pointsThreshold: 1 },
    outcome: { call: 'dq', reason: 'technical', side: 'blue', source: 'manual', at: 9 },
  };
  const opened = await openSeeded(browser, 1440, 900, { 'matboard.match.v1': match });
  await opened.page.goto('/match?from=suite');
  await expect(opened.page.locator('.score__value').first()).toHaveText('4');
  await expect(opened.page.locator('.kids-grandmaster')).toHaveCount(0);
  await expect(opened.page.getByText('Bom trabalho!')).toHaveCount(0);
  await opened.context.close();
});
