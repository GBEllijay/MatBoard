/**
 * Render checks for the tier buy pages (feat/tier-buy-pages): big belt, name,
 * price, checkout or alpha line, Restore, then only the higher tiers.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BuyInstructorEditionPage, BuyProEditionPage, BuyStudentEditionPage } from './BuyEdition.tsx';
import { BuyWhitePage } from './BuyWhite.tsx';
import { BuyCoachPage, BuyMediaPage, BuyProPage, BuyStudentPage } from './BuyTier.tsx';
import { EXPECTED_ONE_TIME_CENTS } from '../server/stripeCheckout.ts';
import { CLOUD_ADDON_CHECKBOX, INSTRUCTOR_LIST_PRICE_CENTS, STUDENT_STORAGE_LINE, WHITE_STORAGE_LINE } from '../lib/productPrices.ts';
import { INSTRUCTOR_DISPLAY_PRICE_CENTS } from '../lib/tierBuyPages.ts';
import { formatUsdFromCents } from '../lib/whitePurchase.ts';

const dom = new Window({ url: 'http://localhost/buy' });
const view = dom as unknown as Window & typeof globalThis;
function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('sessionStorage', view.sessionStorage);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('navigator', view.navigator);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(entry: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/buy" element={<BuyWhitePage />} />
          <Route path="/editions/student" element={<BuyStudentEditionPage />} />
          <Route path="/editions/instructor" element={<BuyInstructorEditionPage />} />
          <Route path="/editions/pro" element={<BuyProEditionPage />} />
          <Route path="/buy/student" element={<BuyStudentPage />} />
          <Route path="/buy/media" element={<BuyMediaPage />} />
          <Route path="/buy/coach" element={<BuyCoachPage />} />
          <Route path="/buy/pro" element={<BuyProPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return {
    host,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const higher = (host: HTMLElement) =>
  [...host.querySelectorAll('[data-higher-tiers] [data-tier]')].map((n) => n.getAttribute('data-tier'));
const ALPHA = /In alpha testing\. Email advantageappLLC@gmail\.com for a free alpha code\./;

test('/buy: White checkout stays; other products are Student, Media, Instructor, Pro in ladder colors', () => {
  const m = mount('/buy');
  assert.deepEqual(higher(m.host), ['student', 'media', 'instructor', 'pro']);
  const belts = [...m.host.querySelectorAll('[data-higher-tiers] [data-tier] .belt-tip')].map((n) => n.getAttribute('data-belt'));
  assert.deepEqual(belts, ['blue', 'purple', 'brown', 'black']);
  const text = [...m.host.querySelectorAll('[data-higher-tiers] [data-tier]')].map((n) => n.textContent ?? '');
  assert.match(text[0], /\$19\.99/);
  assert.match(text[1], /Advantage Media Edition[\s\S]*\$29\.99/);
  assert.match(text[2], /Advantage Instructor Edition[\s\S]*\$49\.99/);
  assert.match(text[3], /Advantage Pro[\s\S]*\$99\.99/);
  assert.doesNotMatch(text[3], /\$99\.99 \+ \$5\.99/);
  assert.doesNotMatch(m.host.textContent ?? '', /Advantage Coach/);
  const links = [...m.host.querySelectorAll('[data-higher-tiers] a.buy__more')].map((a) => a.getAttribute('href'));
  assert.deepEqual(links, ['/editions/student', '/media', '/editions/instructor', '/editions/pro']);
  const cloud = m.host.querySelector('[data-tier="pro-cloud"]');
  assert.equal(cloud?.querySelector('.buy__kicker')?.textContent, 'This product is in alpha');
  assert.match(cloud?.textContent ?? '', /Advantage Pro \+ Cloud/);
  assert.equal(cloud?.querySelector('a.buy__more')?.getAttribute('href'), '/editions/pro-cloud');
  assert.equal(m.host.querySelector('[data-higher-tiers] [data-tier="pro-cloud"]'), null);
  assert.equal(cloud?.querySelector('form, button'), null);
  // White checkout stays. Restore is still a button to /restore. The email sits with the code.
  assert.ok([...m.host.querySelectorAll('button')].some((b) => /checkout/i.test(b.textContent ?? '')));
  const restore = m.host.querySelector('.buy__restore');
  assert.ok(restore);
  assert.equal(restore.querySelector('input'), null);
  assert.equal([...restore.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Restore'), true);
  assert.match(restore.textContent ?? '', /Already purchased\? Enter the email from checkout\./);
  const email = m.host.querySelector('form.alpha-code__form input[type="email"]');
  assert.equal(email?.getAttribute('aria-label'), 'Email');
  assert.ok(m.host.querySelector('a[href^="mailto:advantageappllc@gmail.com"]'));
  assert.ok([...m.host.querySelectorAll('form.alpha-code__form button')].some((b) => b.textContent === 'Unlock'));
  m.done();
});

test('/editions/student: blue belt, $19.99, no checkout unless entitled, demo, restore, higher tiers', () => {
  localStorage.clear();
  const m = mount('/editions/student');
  const header = m.host.querySelector('header.buy__card--tier');
  assert.ok(header?.querySelector('.belt-tip.buy__belt[data-belt="blue"]'));
  assert.match(header?.textContent ?? '', /\$19\.99/);
  assert.equal(m.host.querySelector('header.buy__card--tier .buy__kicker')?.textContent, 'Alpha');
  assert.doesNotMatch(m.host.querySelector('header.buy__card--tier')?.textContent ?? '', /Coming soon/);
  assert.equal(m.host.querySelector('section.buy__checkout form:not(.alpha-code__form)'), null);
  assert.ok(m.host.querySelector('form.alpha-code__form input[name="code"]'));
  assert.ok(m.host.querySelector('section.buy__checkout a[href^="mailto:"]'));
  assert.ok(m.host.querySelector('a[href="/student?student=1"]'));
  assert.ok(m.host.querySelector('.buy__restore'));
  assert.deepEqual(higher(m.host), ['media', 'instructor', 'pro']);
  m.done();
});

test('/editions/instructor: brown belt, $49.99, optional Cloud, alpha line, only Pro above', () => {
  const m = mount('/editions/instructor');
  const header = m.host.querySelector('header.buy__card--tier');
  assert.ok(header?.querySelector('.belt-tip.buy__belt[data-belt="brown"]'));
  assert.equal(header?.querySelector('h2')?.textContent, 'Advantage Instructor Edition');
  assert.match(header?.textContent ?? '', /\$49\.99/);
  assert.match(header?.textContent ?? '', /Pair it with Advantage Cloud or your own Google Drive or OneDrive to share with your staff and students/);
  assert.match(header?.textContent ?? '', /Without one, everything still works on this device/);
  assert.match(m.host.querySelector('section.buy__checkout')?.textContent ?? '', ALPHA);
  assert.ok(m.host.querySelector('input[name="advantageCloud"]'));
  assert.ok(m.host.querySelector('form.alpha-code__form input[name="code"]'));
  assert.ok(m.host.querySelector('a[href^="mailto:advantageappllc@gmail.com"]'));
  assert.match(m.host.textContent ?? '', /Requires gym setup with a third-party drive/);
  assert.ok(m.host.querySelector('.buy__restore'));
  assert.deepEqual(higher(m.host), ['pro']);
  m.done();
});

test('/editions/pro: black belt, $99.99 one-time, optional Cloud checkbox, alpha line, no higher tiers', () => {
  const m = mount('/editions/pro');
  const header = m.host.querySelector('header.buy__card--tier');
  assert.ok(header?.querySelector('.belt-tip.buy__belt[data-belt="black"]'));
  assert.match(header?.textContent ?? '', /\$99\.99/);
  assert.doesNotMatch(header?.textContent ?? '', /\$99\.99 \+ \$5\.99/);
  assert.match(header?.textContent ?? '', /\+ optional Advantage Cloud \$5\.99\/month/);
  assert.match(header?.textContent ?? '', /Includes all Advantage products\./);
  assert.match(m.host.querySelector('section.buy__checkout')?.textContent ?? '', ALPHA);
  assert.ok(m.host.querySelector('input[name="advantageCloud"]'));
  assert.ok(m.host.querySelector('form.alpha-code__form input[name="code"]'));
  assert.ok(m.host.querySelector('a[href^="mailto:advantageappllc@gmail.com"]'));
  assert.ok(m.host.querySelector('.buy__restore'));
  assert.equal(m.host.querySelector('[data-higher-tiers]'), null);
  m.done();
});

// Regression (owner report 2026-10-31): the Instructor Edition buy page showed Advantage Coach,
// a blue belt, and an "Open Coach" link. The internal key stays coach; only display changes.
test('/editions/instructor is its own Instructor page: Daily Lesson Plan first, includes Media/Student/White, no Coach copy', () => {
  const m = mount('/editions/instructor');
  const text = m.host.textContent ?? '';
  assert.doesNotMatch(text, /Advantage Coach|basic Coach|Open Coach/);
  assert.doesNotMatch(text, /Includes everything in Advantage White\./);
  assert.match(text, /Includes everything in Media, Student and White\./);
  const features = [...m.host.querySelectorAll('.buy__features li strong')].map((n) => n.textContent);
  assert.equal(features[0], 'Daily Lesson Plan');
  assert.match(m.host.querySelector('.buy__features li')?.textContent ?? '', /Download/);
  assert.ok(m.host.querySelector('.belt-tip[data-belt="brown"]'));
  assert.equal(m.host.querySelector('.belt-tip--blue'), null);
  // Only Pro above it; never a lower tier.
  const links = [...m.host.querySelectorAll('[data-higher-tiers] a.buy__more')].map((a) => a.getAttribute('href'));
  assert.deepEqual(links, ['/editions/pro']);
  m.done();
});

test('/buy/coach (Stripe return + gated checkout) shows Instructor Edition, brown belt, $49.99 checkout', () => {
  localStorage.clear();
  const m = mount('/buy/coach');
  const text = m.host.textContent ?? '';
  assert.equal(m.host.querySelector('header h2')?.textContent, 'Advantage Instructor Edition');
  assert.doesNotMatch(text, /Advantage Coach|Open Coach/);
  assert.ok(m.host.querySelector('header .belt-tip--brown'));
  assert.equal(m.host.querySelector('.belt-tip--blue'), null);
  // Checkout button shows the Instructor price (STRIPE_PRICE_INSTRUCTOR), never the old $29.99.
  assert.ok([...m.host.querySelectorAll('button')].some((b) => /Continue to checkout — \$49\.99/.test(b.textContent ?? '')));
  assert.doesNotMatch(text, /\$29\.99/);
  // Owner 2026-11-01: Open link targets Coach Unlimited; visible label stays Instructor Edition.
  const open = [...m.host.querySelectorAll('a')].find((a) => a.textContent === 'Open Instructor Edition');
  assert.equal(open?.getAttribute('href'), '/coach-unlimited');
  assert.equal(m.host.querySelector('a[href="/coach"]'), null);
  assert.doesNotMatch(m.host.querySelector('header')?.textContent ?? '', /Coach Unlimited|Advantage Coach/);
  assert.ok(m.host.querySelector('a[href="/editions/instructor"]'));
  m.done();
});

test('/editions/instructor brown header reads "Advantage Instructor Edition", never Coach Unlimited or Advantage Coach', () => {
  localStorage.clear();
  const m = mount('/editions/instructor');
  const header = m.host.querySelector('header.buy__card--tier-brown');
  assert.ok(header, 'brown belt header');
  assert.equal(header?.querySelector('h2')?.textContent, 'Advantage Instructor Edition');
  assert.doesNotMatch(header?.textContent ?? '', /Coach Unlimited|Advantage Coach/);
  // Locked: no open link.
  assert.equal(m.host.querySelector('[data-instructor-open]'), null);
  m.done();
});

test('/editions/instructor open link targets /coach-unlimited once Instructor (coach) is unlocked', () => {
  localStorage.clear();
  localStorage.setItem('advantage.coachUnlocked', '1');
  const m = mount('/editions/instructor');
  const open = m.host.querySelector('[data-instructor-open]');
  assert.equal(open?.getAttribute('href'), '/coach-unlimited');
  assert.equal(open?.textContent, 'Open Advantage Instructor Edition');
  assert.equal(m.host.querySelector('h2')?.textContent, 'Advantage Instructor Edition');
  m.done();
  localStorage.clear();
});

test('each buy page states where the work is stored, and only Media, Instructor, and Pro offer Cloud', () => {
  const cloud = CLOUD_ADDON_CHECKBOX;
  const white = mount('/buy');
  assert.match(white.host.textContent ?? '', new RegExp(WHITE_STORAGE_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(white.host.querySelector('input[name="advantageCloud"]'), null);
  white.done();

  for (const path of ['/buy/student', '/editions/student']) {
    const student = mount(path);
    assert.match(student.host.textContent ?? '', new RegExp(STUDENT_STORAGE_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(student.host.querySelector('input[name="advantageCloud"]'), null);
    student.done();
  }

  for (const path of ['/buy/media', '/buy/coach', '/buy/pro', '/editions/instructor', '/editions/pro']) {
    const page = mount(path);
    const label = page.host.querySelector('label.buy__cloud')?.textContent ?? '';
    assert.equal(label, cloud, path);
    page.done();
  }
});

test('/buy/coach displayed price equals the Instructor price coach Checkout charges', () => {
  localStorage.clear();
  const m = mount('/buy/coach');
  const shown = formatUsdFromCents(INSTRUCTOR_LIST_PRICE_CENTS);
  assert.equal(shown, '$49.99');
  assert.equal(INSTRUCTOR_DISPLAY_PRICE_CENTS, INSTRUCTOR_LIST_PRICE_CENTS);
  // The server refuses coach Checkout unless STRIPE_PRICE_INSTRUCTOR's unit_amount is this amount.
  assert.equal(EXPECTED_ONE_TIME_CENTS.coach, INSTRUCTOR_LIST_PRICE_CENTS);
  const header = m.host.querySelector('header')?.textContent ?? '';
  assert.ok(header.includes(shown), header);
  const button = [...m.host.querySelectorAll('button')].find((b) => /Continue to checkout/.test(b.textContent ?? ''));
  assert.ok(button?.textContent?.includes(shown));
  m.done();
});

test('tier restore card sends people to /restore and can carry the typed email', () => {
  const m = mount('/editions/student');
  const restore = m.host.querySelector('.buy__restore');
  assert.ok(restore);
  assert.equal(restore?.tagName, 'SECTION');
  assert.equal(restore?.querySelector('form'), null);
  const link = restore?.querySelector('a[href^="/restore"]');
  assert.equal(link?.getAttribute('href'), '/restore');
  assert.match(link?.textContent ?? '', /Restore purchase/);
  const input = restore?.querySelector('input[name="email"]') as HTMLInputElement;
  assert.ok(input);
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    setter?.call(input, 'marty@gym.test');
    input.dispatchEvent(new view.Event('input', { bubbles: true }));
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: { target: HTMLInputElement }) => void }>)[key] : null;
    props?.onChange?.({ target: input });
  });
  assert.equal(restore?.querySelector('a[href^="/restore"]')?.getAttribute('href'), '/restore?email=marty%40gym.test');
  m.done();
});
