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
import { BuyCoachPage } from './BuyTier.tsx';

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
          <Route path="/buy/coach" element={<BuyCoachPage />} />
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
  assert.match(text[3], /Advantage Pro[\s\S]*\$99\.99 \+ \$5\.99\/mo/);
  assert.doesNotMatch(m.host.textContent ?? '', /Advantage Coach/);
  const links = [...m.host.querySelectorAll('[data-higher-tiers] a.buy__more')].map((a) => a.getAttribute('href'));
  assert.deepEqual(links, ['/editions/student', '/media', '/editions/instructor', '/editions/pro']);
  // White checkout and restore are still on /buy.
  assert.ok([...m.host.querySelectorAll('button')].some((b) => /checkout/i.test(b.textContent ?? '')));
  assert.ok(m.host.querySelector('input[type="email"]') && m.host.querySelector('a[href="/restore"]'));
  m.done();
});

test('/editions/student: blue belt, $19.99, no checkout unless entitled, demo, restore, higher tiers', () => {
  localStorage.clear();
  const m = mount('/editions/student');
  const header = m.host.querySelector('header.buy__card--tier');
  assert.ok(header?.querySelector('.belt-tip.buy__belt[data-belt="blue"]'));
  assert.match(header?.textContent ?? '', /\$19\.99/);
  assert.equal(m.host.querySelector('section.buy__checkout form'), null);
  assert.ok(m.host.querySelector('section.buy__checkout a[href^="mailto:"]'));
  assert.ok(m.host.querySelector('a[href="/student?student=1"]'));
  assert.ok(m.host.querySelector('form.buy__restore'));
  assert.deepEqual(higher(m.host), ['media', 'instructor', 'pro']);
  m.done();
});

test('/editions/instructor: brown belt, $49.99, alpha line, no checkout, only Pro above', () => {
  const m = mount('/editions/instructor');
  const header = m.host.querySelector('header.buy__card--tier');
  assert.ok(header?.querySelector('.belt-tip.buy__belt[data-belt="brown"]'));
  assert.equal(header?.querySelector('h2')?.textContent, 'Advantage Instructor Edition');
  assert.match(header?.textContent ?? '', /\$49\.99/);
  assert.match(m.host.querySelector('section.buy__checkout')?.textContent ?? '', ALPHA);
  assert.equal(m.host.querySelector('section.buy__checkout form'), null);
  assert.ok(m.host.querySelector('form.buy__restore'));
  assert.deepEqual(higher(m.host), ['pro']);
  m.done();
});

test('/editions/pro: black belt, $99.99 + $5.99/mo, includes all, alpha line, no higher tiers', () => {
  const m = mount('/editions/pro');
  const header = m.host.querySelector('header.buy__card--tier');
  assert.ok(header?.querySelector('.belt-tip.buy__belt[data-belt="black"]'));
  assert.match(header?.textContent ?? '', /\$99\.99 \+ \$5\.99\/mo/);
  assert.match(header?.textContent ?? '', /Includes all Advantage products\./);
  assert.match(m.host.querySelector('section.buy__checkout')?.textContent ?? '', ALPHA);
  assert.equal(m.host.querySelector('section.buy__checkout form'), null);
  assert.ok(m.host.querySelector('form.buy__restore'));
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

test('/buy/coach (Stripe return + gated checkout) shows Instructor Edition, brown belt; checkout unchanged', () => {
  localStorage.clear();
  const m = mount('/buy/coach');
  const text = m.host.textContent ?? '';
  assert.equal(m.host.querySelector('header h2')?.textContent, 'Advantage Instructor Edition');
  assert.doesNotMatch(text, /Advantage Coach|Open Coach/);
  assert.ok(m.host.querySelector('header .belt-tip--brown'));
  assert.equal(m.host.querySelector('.belt-tip--blue'), null);
  // Checkout button still there and still the Coach Stripe price (no Stripe change in this PR).
  assert.ok([...m.host.querySelectorAll('button')].some((b) => /Continue to checkout — \$29\.99/.test(b.textContent ?? '')));
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
