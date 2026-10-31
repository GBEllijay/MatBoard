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
