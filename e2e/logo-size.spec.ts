import { expect, test, type Page } from '@playwright/test';

/**
 * Sub-menus keep a small corner back logo and a larger center Home logo.
 * The center mark used to copy the back mark's 44px size, and short landscape
 * clamps pulled .home__logo down beside it. Both widths are measured here.
 */
const ROUTES = [
  '/coaching-tools',
  '/coach-unlimited',
  '/instructors',
  '/suite',
  '/competitors',
  '/white/roster',
  '/roster?from=students',
  '/game-plan',
  '/student/journal?student=1',
  '/student/rank?student=1',
] as const;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
] as const;

const MIN_RATIO = 1.6;

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
  });
}

test('center Home logo stays larger than the corner back logo', async ({ page }) => {
  await unlock(page);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const route of ROUTES) {
      await page.goto(route);
      const back = page.locator('.play-exit img');
      const home = page.locator('.tier-home img, .home__logo');
      await expect(back, route).toBeVisible();
      await expect(home, route).toBeVisible();
      const ratio = await page.evaluate(() => {
        const backImg = document.querySelector('.play-exit img');
        const homeImg = document.querySelector('.tier-home img') ?? document.querySelector('.home__logo');
        if (!(backImg instanceof HTMLElement) || !(homeImg instanceof HTMLElement)) return 0;
        const backWidth = backImg.getBoundingClientRect().width;
        const homeWidth = homeImg.getBoundingClientRect().width;
        if (backWidth < 1) return 0;
        return homeWidth / backWidth;
      });
      expect(ratio, `${route} at ${viewport.width}px`).toBeGreaterThanOrEqual(MIN_RATIO);
    }
  }
});

const PIN_ROUTES = ['/coaching-tools', '/white/roster', '/student/journal?student=1', '/roster?from=students'] as const;

const PIN_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;

async function readMarks(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!(el instanceof HTMLElement)) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const paddingBox = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        top: r.top + Number.parseFloat(s.borderTopWidth),
        left: r.left + Number.parseFloat(s.borderLeftWidth),
        right: r.right - Number.parseFloat(s.borderRightWidth),
        bottom: r.bottom - Number.parseFloat(s.borderBottomWidth),
      };
    };
    const visible = (el: Element | null) => {
      const r = box(el);
      if (!r || r.width < 1 || r.height < 1) return null;
      let top = 0;
      let left = 0;
      let right = window.innerWidth;
      let bottom = window.innerHeight;
      let node = el.parentElement;
      while (node && node !== document.documentElement) {
        const style = getComputedStyle(node);
        const oy = style.overflowY;
        if (oy === 'auto' || oy === 'scroll' || oy === 'hidden' || oy === 'clip') {
          const c = paddingBox(node);
          top = Math.max(top, c.top);
          bottom = Math.min(bottom, c.bottom);
          left = Math.max(left, c.left);
          right = Math.min(right, c.right);
        }
        node = node.parentElement;
      }
      const next = {
        top: Math.max(r.top, top),
        bottom: Math.min(r.bottom, bottom),
        left: Math.max(r.left, left),
        right: Math.min(r.right, right),
      };
      if (next.bottom - next.top < 1 || next.right - next.left < 1) return null;
      return next;
    };
    const hits = (
      a: { left: number; right: number; top: number; bottom: number } | null,
      b: { left: number; right: number; top: number; bottom: number } | null,
    ) => Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
    const home = document.querySelector('.tier-home img') ?? document.querySelector('.home__logo');
    const back = document.querySelector('.play-exit img');
    const homeBox = box(home);
    const backBox = box(back);
    const onMark = (rect: { left: number; top: number; width: number; height: number } | null, mark: Element | null) => {
      if (!rect || !mark) return false;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 22));
      return hit instanceof Node && mark.contains(hit);
    };
    return {
      home: homeBox,
      back: backBox,
      homeOverTitle: hits(homeBox, visible(document.querySelector('h1'))),
      homeOverBoard: hits(homeBox, visible(document.querySelector('.sf-sb'))),
      backOverTitle: hits(backBox, visible(document.querySelector('h1'))),
      homeOnTop: onMark(homeBox, home?.closest('a') ?? home?.parentElement ?? null),
      backOnTop: onMark(backBox, back?.closest('a') ?? null),
    };
  });
}

test('pinned Home and back marks stay put after scroll and hover', async ({ page }) => {
  await unlock(page);
  for (const viewport of PIN_VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const route of PIN_ROUTES) {
      await page.goto(route);
      const home = page.locator('.tier-home img, .home__logo').first();
      const back = page.locator('.play-exit img');
      await expect(home, route).toBeVisible();
      await expect(back, route).toBeVisible();
      const before = await readMarks(page);
      await home.hover();
      const card = page.locator('.mode-card, .roster__list, .student-sheet, h1').first();
      if (await card.count()) await card.hover();
      const hovered = await readMarks(page);
      expect(Math.abs((hovered.home?.top ?? 0) - (before.home?.top ?? 0)), `${route} home hover`).toBeLessThan(1);
      expect(Math.abs((hovered.home?.left ?? 0) - (before.home?.left ?? 0)), `${route} home hover`).toBeLessThan(1);
      expect(Math.abs((hovered.back?.top ?? 0) - (before.back?.top ?? 0)), `${route} back hover`).toBeLessThan(1);
      expect(Math.abs((hovered.back?.left ?? 0) - (before.back?.left ?? 0)), `${route} back hover`).toBeLessThan(1);

      const scrolled = await page.evaluate(() => {
        let moved = 0;
        for (const node of document.querySelectorAll('main, .student-paper, .arena-scroll')) {
          if (!(node instanceof HTMLElement)) continue;
          const room = node.scrollHeight - node.clientHeight;
          if (room > 40) {
            node.scrollTop = Math.min(520, room);
            moved = Math.max(moved, node.scrollTop);
          }
        }
        return moved;
      });
      const after = await readMarks(page);
      expect(after.home && after.home.top >= -1 && after.home.bottom <= viewport.height + 1, `${route} home in view`).toBe(true);
      expect(after.back && after.back.top >= -1 && after.back.bottom <= viewport.height + 1, `${route} back in view`).toBe(true);
      expect(Math.abs((after.home?.top ?? 0) - (before.home?.top ?? 0)), `${route} home scrolled`).toBeLessThan(1);
      expect(Math.abs((after.home?.left ?? 0) - (before.home?.left ?? 0)), `${route} home scrolled`).toBeLessThan(1);
      expect(Math.abs((after.back?.top ?? 0) - (before.back?.top ?? 0)), `${route} back scrolled`).toBeLessThan(1);
      expect(Math.abs((after.back?.left ?? 0) - (before.back?.left ?? 0)), `${route} back scrolled`).toBeLessThan(1);
      expect(after.homeOverTitle, `${route} logo covers the title`).toBe(false);
      expect(after.homeOverBoard, `${route} logo covers the scoreboard`).toBe(false);
      expect(after.backOverTitle, `${route} back covers the title`).toBe(false);
      expect(after.homeOnTop, `${route} logo stays on top`).toBe(true);
      expect(after.backOnTop, `${route} back stays on top`).toBe(true);
      const mustScroll = route.startsWith('/student/journal') || (route === '/coaching-tools' && viewport.width === 390);
      if (mustScroll) expect(scrolled, `${route} at ${viewport.width}px scrolls`).toBeGreaterThan(40);
    }
  }
});
