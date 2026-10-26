import { expect, test, type Page } from '@playwright/test';
import { ALPHA_REQUEST_SUBJECT, SITE_FEEDBACK_EMAIL } from '../src/lib/siteFooter.ts';
import { FULL_OWNER_UNLOCK_CODE } from '../src/lib/proUnlock.ts';

const LANDSCAPES = [
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
] as const;

const HOME_LANDSCAPES = [
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 667, height: 375 },
  { width: 740, height: 360 },
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
] as const;

const HOME_PORTRAITS = [
  { width: 390, height: 844 },
  { width: 360, height: 780 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
] as const;

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: true });
}

test('public homepage sells Advantage White and links coming soon to the edition picker', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Win by Advantage.', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Your gym's scoreboard and timer/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Run it from your phone/ })).toBeVisible();
  await expect(page.getByText('05:00', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buy Advantage White — $9.99' })).toHaveAttribute('href', '/buy');
  await expect(page.getByRole('heading', { name: 'Round timer', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Points', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Advantages', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Penalties', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Belt progression/i })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Scoreboard' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Round timer' })).toBeVisible();

  const shots = page.locator('.sf-print img');
  await expect(shots).toHaveCount(2);
  await expect(shots.nth(0)).toHaveAttribute(
    'alt',
    'Woodblock-style illustration of kids rolling at the gym while the Advantage scoreboard runs on the wall TV',
  );
  await expect(shots.nth(1)).toHaveAttribute(
    'alt',
    'Woodblock-style illustration of kids rolling at the gym while the Advantage round timer runs on the wall TV',
  );
  const sources = page.locator('.sf-print source');
  await expect(sources.nth(0)).toHaveAttribute('type', 'image/webp');
  await expect(sources.nth(0)).toHaveAttribute('srcset', '/homepage/woodblock-scoreboard.webp');
  await expect(sources.nth(1)).toHaveAttribute('srcset', '/homepage/woodblock-timer.webp');
  for (const image of await shots.all()) {
    await expect(image).toBeVisible();
    const loaded = await image.evaluate((img) => img instanceof HTMLImageElement && img.naturalWidth > 40);
    expect(loaded).toBe(true);
    await expect(image).toHaveAttribute('width', '1280');
    await expect(image).toHaveAttribute('height', '720');
  }
  await expect(page.locator('img[src*="hero-still"], img[src*="hero-poster"]')).toHaveCount(0);

  const progress = page.getByRole('region', { name: 'Start with White. Grow into Pro.' });
  await expect(progress.getByText('Progression', { exact: true })).toBeVisible();
  await expect(progress.getByRole('heading', { name: 'Advantage White', exact: true })).toBeVisible();
  const student = progress.locator('a.sf-step--student');
  const coach = progress.locator('a.sf-step--coach');
  const pro = progress.locator('a.sf-step--pro');
  await expect(student).toContainText('Advantage – Student Edition');
  await expect(student).toContainText('personal BJJ training journal');
  await expect(student).toContainText('Coming soon');
  await expect(coach).toContainText('Advantage Coach');
  await expect(coach).toContainText('Coming soon');
  await expect(pro).toContainText('Advantage Pro');
  await expect(pro).toContainText('$99.99 + $5.99/mo');
  await expect(pro).toContainText('Coming soon');
  await expect(progress).toContainText('are in alpha testing');

  const mail = page.getByRole('link', { name: 'Request to join alpha' });
  await expect(mail).toHaveAttribute(
    'href',
    `mailto:${SITE_FEEDBACK_EMAIL}?subject=${encodeURIComponent(ALPHA_REQUEST_SUBJECT)}`,
  );
  await progress.scrollIntoViewIfNeeded();
  await progress.screenshot({ path: '/opt/cursor/artifacts/coming-soon.png' });
  await shot(page, 'storefront-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Scoreboard' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Round timer' })).toBeVisible();
  await shot(page, 'storefront-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await coach.click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('button', { name: 'Advantage Coach, coming soon' })).toBeVisible();
});

test('White card opens checkout; Student, Coach, Pro, and the heading open the picker', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const buy = page.getByRole('link', { name: 'Buy Advantage White — $9.99' });
  const heading = page.getByRole('link', { name: 'Start with White. Grow into Pro.', exact: true });
  const white = page.locator('a.sf-step--white');
  const student = page.locator('a.sf-step--student');
  const coach = page.locator('a.sf-step--coach');
  const pro = page.locator('a.sf-step--pro');
  await expect(buy).toHaveAttribute('href', '/buy');
  await expect(white).toHaveAttribute('href', '/buy');
  await expect(heading).toHaveAttribute('href', '/products');
  await expect(student).toHaveAttribute('href', '/products');
  await expect(coach).toHaveAttribute('href', '/products');
  await expect(pro).toHaveAttribute('href', '/products');
  for (const link of [heading, student, coach, pro]) {
    const href = await link.getAttribute('href');
    expect(href).not.toBe('/buy');
    expect(href).not.toBe('/student');
    expect(href).not.toBe('/coming-soon');
    expect(href ?? '').not.toMatch(/^#/);
  }

  await white.click();
  await expect(page).toHaveURL(/\/buy$/);
  await page.goto('/');
  await heading.click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('heading', { name: 'Advantage', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Advantage White' })).toHaveAttribute('href', '/buy');
});

test('legacy student and owner-code home links still open the edition picker', async ({ page }) => {
  await page.goto('/?student=1');
  await expect(page).toHaveURL(/\/products\?student=1$/);
  await expect(page.getByRole('link', { name: 'Open Student Edition', exact: true })).toBeVisible();

  await page.goto(`/editions?pro=${FULL_OWNER_UNLOCK_CODE}`);
  await expect(page).toHaveURL(/\/products/);
  await expect(page).not.toHaveURL(new RegExp(FULL_OWNER_UNLOCK_CODE, 'i'));
  await expect(page.getByRole('link', { name: 'Open Student Edition', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coach', exact: true })).toBeVisible();
});

test('buy page shows an unlock or promo code field without printing launch codes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/buy');
  const field = page.getByRole('textbox', { name: 'Unlock or promo code' });
  await expect(field).toBeVisible();
  const box = await field.boundingBox();
  expect(box && box.y).toBeLessThan(900);
  await expect(page.getByRole('button', { name: 'Continue to checkout — $9.99' })).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/WHITE499|WHITE099|WHITEFREE|WINBYADV/i);
  await shot(page, 'buy-code-field');
});

test('Coach Unlimited landscape keeps the corner back off the center Home logo', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
  });
  for (const size of LANDSCAPES) {
    await page.setViewportSize(size);
    await page.goto('/coach-unlimited');
    const back = page.getByRole('link', { name: 'Back. Hold for Home.', exact: true });
    const home = page.getByRole('link', { name: 'Home', exact: true });
    await expect(back).toHaveAttribute('href', '/pro');
    await expect(home).toHaveAttribute('href', '/products');
    const overlap = await page.evaluate(() => {
      const backImg = document.querySelector('.play-exit img');
      const homeImg = document.querySelector('.home__logo');
      if (!(backImg instanceof HTMLElement) || !(homeImg instanceof HTMLElement)) return true;
      const a = backImg.getBoundingClientRect();
      const b = homeImg.getBoundingClientRect();
      return a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    });
    expect(overlap, `${size.width}x${size.height}`).toBe(false);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await shot(page, 'coach-unlimited-landscape');
});

test('landscape headline stays off the scoreboard and prices stay on their cards', async ({ page }) => {
  for (const size of HOME_LANDSCAPES) {
    await page.setViewportSize(size);
    await page.goto('/');
    const overlap = await page.evaluate(() => {
      const box = (el: Element | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      const intersects = (a: NonNullable<ReturnType<typeof box>>, b: NonNullable<ReturnType<typeof box>>) =>
        a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      const copy = box(document.querySelector('.sf-copy'));
      const board = box(document.querySelector('.sf-sb'));
      const image = box(document.querySelector('.sf-print img'));
      const prices = [...document.querySelectorAll('.sf-price-now, .sf-price-soon')].map((el) => {
        const price = box(el);
        const card = box(el.closest('.sf-step'));
        const inside =
          price != null &&
          card != null &&
          price.left >= card.left - 1 &&
          price.right <= card.right + 1 &&
          price.top >= card.top - 1 &&
          price.bottom <= card.bottom + 1;
        return { text: el.textContent?.trim() ?? '', inside };
      });
      return {
        copyOnBoard: copy != null && board != null && intersects(copy, board),
        copyOnImage: copy != null && image != null && intersects(copy, image),
        prices,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    expect(overlap.copyOnBoard, `${size.width}x${size.height} headline covers the scoreboard`).toBe(false);
    expect(overlap.copyOnImage, `${size.width}x${size.height} headline covers the woodblock`).toBe(false);
    expect(overlap.scrollWidth, `${size.width}x${size.height}`).toBeLessThanOrEqual(size.width + 1);
    expect(overlap.prices, `${size.width}x${size.height}`).toEqual([
      { text: '$9.99 one-time', inside: true },
      { text: '$19.99 one-time', inside: true },
      { text: '$29.99 one-time', inside: true },
      { text: '$99.99 + $5.99/mo', inside: true },
    ]);
  }
});

test('portrait stacks the logo, wordmark, and link bar above Competitor 1', async ({ page }) => {
  for (const size of HOME_PORTRAITS) {
    await page.setViewportSize(size);
    await page.goto('/');
    const stack = await page.evaluate(() => {
      const box = (el: Element | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const logo = box(document.querySelector('.sf-portrait-brand img'));
      const word = box(document.querySelector('.sf-portrait-word'));
      const bar = box(document.querySelector('.sf-topbar'));
      const comp = box(document.querySelector('.sf-nm1'));
      const board = box(document.querySelector('.sf-sb'));
      return { logo, word, bar, comp, board };
    });
    expect(stack.logo, `${size.width}x${size.height} logo`).not.toBeNull();
    expect(stack.word, `${size.width}x${size.height} wordmark`).not.toBeNull();
    expect(stack.bar, `${size.width}x${size.height} link bar`).not.toBeNull();
    expect(stack.comp, `${size.width}x${size.height} competitor`).not.toBeNull();
    expect(stack.board, `${size.width}x${size.height} scoreboard`).not.toBeNull();
    const logo = stack.logo!;
    const word = stack.word!;
    const bar = stack.bar!;
    const comp = stack.comp!;
    const board = stack.board!;
    expect(logo.bottom, `${size.width}x${size.height} logo above word`).toBeLessThanOrEqual(word.top + 1);
    expect(word.bottom, `${size.width}x${size.height} word above link bar`).toBeLessThanOrEqual(bar.top + 1);
    expect(word.bottom, `${size.width}x${size.height} word above the blue board`).toBeLessThanOrEqual(board.top + 1);
    expect(logo.bottom, `${size.width}x${size.height} logo above the blue board`).toBeLessThanOrEqual(board.top + 1);
    expect(comp.left - board.left, `${size.width}x${size.height} Competitor 1 left`).toBeLessThan(board.width * 0.35);
    expect(comp.left, `${size.width}x${size.height} Competitor 1 not on the right`).toBeLessThan(board.left + board.width * 0.45);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const desktop = await page.evaluate(() => {
    const brand = getComputedStyle(document.querySelector('.sf-portrait-brand')!).display;
    const mark = getComputedStyle(document.querySelector('.sf-hero-brand')!).display;
    const copy = document.querySelector('.sf-copy')!.getBoundingClientRect();
    const board = document.querySelector('.sf-sb')!.getBoundingClientRect();
    const logo = document.querySelector('.sf-portrait-brand img')!.getBoundingClientRect();
    const word = document.querySelector('.sf-portrait-word')!.getBoundingClientRect();
    const hits =
      copy.left < board.right - 1 && copy.right > board.left + 1 && copy.top < board.bottom - 1 && copy.bottom > board.top + 1;
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    return {
      brand,
      mark,
      hits,
      logoAboveWord: logo.bottom <= word.top + 1,
      wordAboveBoard: word.bottom <= board.top + 1,
      logoHitsBoard: overlaps(logo, board),
      wordHitsBoard: overlaps(word, board),
    };
  });
  expect(desktop.brand).not.toBe('none');
  expect(desktop.mark).toBe('none');
  expect(desktop.logoAboveWord).toBe(true);
  expect(desktop.wordAboveBoard).toBe(true);
  expect(desktop.logoHitsBoard).toBe(false);
  expect(desktop.wordHitsBoard).toBe(false);
  expect(desktop.hits).toBe(false);
});

test('desktop homepage text and buttons stay off the scoreboard', async ({ page }) => {
  for (const size of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const result = await page.evaluate(() => {
      const boardEl = document.querySelector('.sf-sb');
      if (!(boardEl instanceof HTMLElement)) return { offenders: ['missing board'], barWidth: 0, centered: false, barBelowWord: false };
      const board = boardEl.getBoundingClientRect();
      const overlaps = (a: DOMRect, b: DOMRect) =>
        a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      const offenders: string[] = [];
      for (const el of document.querySelectorAll('h1, h2, h3, p, a, button')) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.closest('.sf-sb')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (!overlaps(r, board)) continue;
        offenders.push((el.innerText || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 80));
      }
      const bar = document.querySelector('.sf-topbar')!.getBoundingClientRect();
      const word = document.querySelector('.sf-portrait-word')!.getBoundingClientRect();
      const links = document.querySelector('.sf-nav-links')!.getBoundingClientRect();
      const wordMid = (word.left + word.right) / 2;
      const linksMid = (links.left + links.right) / 2;
      return {
        offenders,
        barWidth: bar.width,
        centered: Math.abs(linksMid - wordMid) < 24,
        barBelowWord: bar.top >= word.bottom - 1,
      };
    });
    expect(result.offenders, `${size.width}x${size.height}`).toEqual([]);
    expect(result.barWidth, `${size.width} bar width`).toBeGreaterThan(size.width - 2);
    expect(result.barBelowWord, `${size.width} bar under Advantage`).toBe(true);
    expect(result.centered, `${size.width} links centered`).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const pin = await page.evaluate(() => {
    const header = document.querySelector('.sf-pin')!.getBoundingClientRect();
    const logo = document.querySelector('.sf-portrait-brand img')!.getBoundingClientRect();
    return { height: header.height, logo: logo.width };
  });
  expect(pin.logo).toBeGreaterThanOrEqual(112);
  expect(pin.height).toBeLessThan(200);
});

test('homepage header scrolls out of view and stays off the scoreboard', async ({ page }) => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const logo = page.locator('.sf-portrait-brand img');
    await expect(logo).toBeVisible();
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/');
    const nav = page.getByRole('navigation', { name: 'On this page' });
    await expect(nav.getByRole('link', { name: 'Scoreboard', exact: true })).toHaveAttribute('href', '#scoreboard');
    await expect(nav.getByRole('link', { name: 'Round timer', exact: true })).toHaveAttribute('href', '#round-timer');
    const read = () =>
      page.evaluate(() => {
        const rect = (el: Element | null) => {
          if (!(el instanceof HTMLElement)) return null;
          const r = el.getBoundingClientRect();
          return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };
        const overlaps = (
          a: { left: number; right: number; top: number; bottom: number } | null,
          b: { left: number; right: number; top: number; bottom: number } | null,
        ) => Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
        const logoBox = rect(document.querySelector('.sf-portrait-brand img'));
        const word = rect(document.querySelector('.sf-portrait-word'));
        const bar = rect(document.querySelector('.sf-topbar'));
        const board = rect(document.querySelector('.sf-sb'));
        const header = document.querySelector('.sf-pin');
        const scroller = document.querySelector('.sf-scroll');
        const main = document.querySelector('main.home--store');
        const pinStyle = header instanceof HTMLElement ? getComputedStyle(header) : null;
        const barEl = document.querySelector('.sf-topbar');
        const barStyle = barEl instanceof HTMLElement ? getComputedStyle(barEl) : null;
        const mainStyle = main instanceof HTMLElement ? getComputedStyle(main) : null;
        const scrollStyle = scroller instanceof HTMLElement ? getComputedStyle(scroller) : null;
        const backSize = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mark-back'));
        const offenders: string[] = [];
        if (board) {
          for (const el of document.querySelectorAll('h1, h2, h3, p, a, button, img')) {
            if (!(el instanceof HTMLElement)) continue;
            if (el.closest('.sf-sb')) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
            if (!overlaps(r, board)) continue;
            offenders.push((el.innerText || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 80));
          }
          for (const el of document.querySelectorAll('body *')) {
            if (!(el instanceof HTMLElement)) continue;
            if (el.closest('.sf-sb')) continue;
            const style = getComputedStyle(el);
            if (style.position !== 'fixed' && style.position !== 'sticky') continue;
            if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity) === 0) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            if (!overlaps(r, board)) continue;
            offenders.push(`pinned ${el.className || el.tagName}`.slice(0, 80));
          }
        }
        const headerTopGap =
          header instanceof HTMLElement && scroller instanceof HTMLElement
            ? header.getBoundingClientRect().top - scroller.getBoundingClientRect().top
            : 999;
        return {
          logo: logoBox,
          word,
          bar,
          board,
          pinPosition: pinStyle?.position ?? '',
          barPosition: barStyle?.position ?? '',
          mainPaddingTop: mainStyle?.paddingTop ?? '',
          mainBorderTop: mainStyle?.borderTopWidth ?? '',
          scrollPaddingTop: scrollStyle?.paddingTop ?? '',
          headerTopGap,
          backSize,
          offenders,
          logoAboveWord: logoBox != null && word != null && logoBox.bottom <= word.top + 1,
          wordAboveBar: word != null && bar != null && word.bottom <= bar.top + 1,
          barAboveBoard: bar != null && board != null && bar.bottom <= board.top + 1,
        };
      });
    const before = await read();
    expect(before.pinPosition, `${size.width} header position`).toBe('static');
    expect(before.barPosition, `${size.width} bar position`).toBe('static');
    expect(before.mainPaddingTop, `${size.width} reserved padding`).toBe('0px');
    expect(before.mainBorderTop, `${size.width} reserved border`).toBe('0px');
    expect(before.scrollPaddingTop, `${size.width} scroll padding`).toBe('0px');
    expect(Math.abs(before.headerTopGap), `${size.width} header starts at the top`).toBeLessThan(2);
    expect(before.logoAboveWord, `${size.width} logo above Advantage`).toBe(true);
    expect(before.wordAboveBar, `${size.width} Advantage above the bar`).toBe(true);
    expect(before.barAboveBoard, `${size.width} bar above the scoreboard`).toBe(true);
    expect(before.logo && before.logo.width >= 112, `${size.width} logo size`).toBe(true);
    expect(before.logo && before.backSize > 0 && before.logo.width >= before.backSize * 1.6, `${size.width} logo vs back`).toBe(true);
    expect(before.offenders, `${size.width} overlap before scroll`).toEqual([]);
    const moved = await page.evaluate(() => {
      const scroller = document.querySelector('.sf-scroll');
      const header = document.querySelector('.sf-pin');
      if (!(scroller instanceof HTMLElement) || !(header instanceof HTMLElement)) return 0;
      scroller.scrollTop = Math.ceil(header.getBoundingClientRect().height) + 8;
      return scroller.scrollTop;
    });
    expect(moved, `${size.width} scrolls`).toBeGreaterThan(40);
    const after = await read();
    expect(after.logo && after.logo.bottom <= 1, `${size.width} logo scrolled away`).toBe(true);
    expect(after.word && after.word.bottom <= 1, `${size.width} Advantage scrolled away`).toBe(true);
    expect(after.bar && after.bar.bottom <= 1, `${size.width} bar scrolled away`).toBe(true);
    expect(after.board && after.board.top <= 16, `${size.width} scoreboard reaches the top`).toBe(true);
    expect(after.board && after.board.bottom > 40, `${size.width} scoreboard still on screen`).toBe(true);
    expect(after.offenders, `${size.width} overlap after scroll`).toEqual([]);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.sf-portrait-brand img')).toBeVisible();
  await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Scoreboard', exact: true }).click();
  await expect(page.locator('#scoreboard')).toBeInViewport();
  await page.evaluate(() => {
    const scroller = document.querySelector('.sf-scroll');
    if (scroller instanceof HTMLElement) scroller.scrollTop = 0;
  });
  await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Round timer', exact: true }).click();
  await expect(page.locator('#round-timer')).toBeInViewport();
});

test('a focused field is not pulled back after the person scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/buy');
  const field = page.getByRole('textbox', { name: 'Unlock or promo code' });
  await field.focus();
  const readScroll = () =>
    page.evaluate(() => {
      const active = document.activeElement;
      let node = active instanceof HTMLElement ? active.parentElement : null;
      while (node) {
        const style = getComputedStyle(node);
        if (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          node.scrollHeight > node.clientHeight + 8
        ) {
          return node.scrollTop;
        }
        node = node.parentElement;
      }
      return window.scrollY;
    });
  const before = await readScroll();
  await field.hover();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(250);
  const afterWheel = await readScroll();
  expect(afterWheel).toBeGreaterThan(before + 40);
  await page.waitForTimeout(800);
  const settled = await readScroll();
  expect(Math.abs(settled - afterWheel)).toBeLessThan(30);
});
