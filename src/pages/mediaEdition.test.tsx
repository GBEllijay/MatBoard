/**
 * /media for a locked visitor renders the marketing page: title, $29.99
 * one-time, purple belt, alpha CTA, then the gallery (no white band).
 * A Pro or owner pass gets the paid console instead. /media-edition redirects.
 * The homepage Media card opens /media.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MediaEditionGate } from '../components/MediaEditionGate.tsx';
import { SuiteMenuLinks } from '../components/SuiteMenuLinks.tsx';
import { COMPETITION_PRO_MENU, MEDIA_EDITION_MENU } from '../lib/productNames.ts';
import { MediaEditionPage } from './MediaEdition.tsx';
import { MediaEditionHubPage } from './MediaEditionHub.tsx';
import { StorefrontPage } from './Storefront.tsx';

const dom = new Window({ url: 'http://localhost/media' });
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

let path = '';
function Where() {
  path = useLocation().pathname;
  return null;
}

function mount(entry: string, open = false) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Where />
        <Routes>
          <Route path="/" element={<StorefrontPage />} />
          <Route
            path="/media"
            element={<MediaEditionGate open={open} paid={<p data-paid-console="">paid console</p>} />}
          />
          <Route path="/media-edition" element={<Navigate to="/media" replace />} />
          <Route path="/suite-menu" element={<SuiteMenuLinks links={COMPETITION_PRO_MENU} label="suite" />} />
          <Route path="/hub" element={<MediaEditionHubPage />} />
          <Route path="/edition-menu" element={<SuiteMenuLinks links={MEDIA_EDITION_MENU} label="edition" />} />
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

test('route renders the Media Edition page with its title, price, belt and CTA', () => {
  const m = mount('/media');
  const { host } = m;
  assert.equal(document.title, 'Advantage Media Edition');
  assert.ok(host.querySelector('main.home--media'));
  assert.equal(host.querySelector('header.buy__card--belt h2')?.textContent, 'Advantage Media Edition');
  const price = host.querySelector('header .buy__price')?.textContent ?? '';
  assert.match(price, /^\$29\.99 USD — one-time/);
  assert.ok(host.querySelector('header .belt-tip.belt-tip--purple'));
  const cta = host.querySelector('a.btn.btn--white') as HTMLAnchorElement | null;
  assert.equal(cta?.textContent, 'Request an alpha code');
  assert.match(cta?.getAttribute('href') ?? '', /^mailto:advantageappllc@gmail\.com/);
  assert.match(host.textContent ?? '', /In alpha testing\. Email advantageappLLC@gmail\.com for a free alpha code\./);
  assert.match(host.textContent ?? '', /Includes everything in Advantage White\./);
  // Not for sale: no checkout form or buy button on the page.
  assert.equal(host.querySelector('form'), null);
  for (const b of host.querySelectorAll('button')) assert.doesNotMatch(b.textContent ?? '', /buy|checkout|pay|purchase/i);
  assert.doesNotMatch(host.innerHTML, /checkout\.stripe|\/api\/.*checkout/i);
  m.done();
});

test('tier template: Restore link, then only the higher tiers (Instructor, Pro)', () => {
  const m = mount('/media');
  const { host } = m;
  const restore = host.querySelector('section.buy__restore a[href="/restore"]');
  assert.ok(restore, 'restore link');
  const higher = host.querySelector('[data-higher-tiers]');
  assert.ok(higher);
  const tiers = [...higher.querySelectorAll('[data-tier]')].map((n) => n.getAttribute('data-tier'));
  assert.deepEqual(tiers, ['instructor', 'pro']);
  const links = [...higher.querySelectorAll('a.buy__more')].map((a) => a.getAttribute('href'));
  assert.deepEqual(links, ['/editions/instructor', '/editions/pro']);
  // Restore comes after the Media card and before the higher tiers.
  const order = [...host.querySelectorAll('section.buy__restore, [data-higher-tiers]')];
  assert.equal(order[0], restore.closest('section'));
  assert.equal(host.querySelector('form'), null);
  m.done();
});

test('header card then gallery, no white band, images in order', () => {
  const m = mount('/media');
  const { host } = m;
  assert.equal(host.querySelector('section.media-band'), null);
  const gallery = host.querySelector('section.media-gallery');
  assert.ok(gallery);
  assert.ok(gallery.previousElementSibling?.querySelector('header.buy__card--belt'));
  const items = [...gallery.querySelectorAll('.media-gallery__grid > li img')];
  assert.deepEqual(
    items.map((i) => i.getAttribute('src')),
    ['/homepage/woodblock-scoreboard.jpg', '/homepage/woodblock-timer.jpg', '/storefront/round-timer-live.png'],
  );
  for (const img of items) assert.ok((img.getAttribute('alt') ?? '').length > 10);
  m.done();
});

test('feature list renders the real Media Console features', () => {
  const m = mount('/media');
  const titles = [...m.host.querySelectorAll('.media-edition__features strong')].map((n) => n.textContent);
  assert.deepEqual(titles, ['Gallery', 'Class Schedule', 'Pro Shop', 'Events', 'Play order and timing', 'Video sound', 'Gym logo', 'Stays on this device']);
  const included = [...m.host.querySelectorAll('.buy__block ul li')].map((n) => n.textContent);
  assert.deepEqual(included, ['Tournament Style BJJ Scoreboard', 'Fully Customizable Round Timer', 'Media Console']);
  m.done();
});

test('homepage Media Edition card links to /media and lands on the page', () => {
  const m = mount('/');
  const links = [...m.host.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/media');
  assert.equal(links.length, 1);
  assert.match(links[0].textContent ?? '', /Advantage Media Edition/);
  act(() => {
    links[0].dispatchEvent(new view.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }) as unknown as Event);
  });
  assert.equal(path, '/media');
  assert.equal(m.host.querySelector('header.buy__card--belt h2')?.textContent, 'Advantage Media Edition');
  m.done();
});

test('/media-edition redirects to /media', () => {
  const m = mount('/media-edition');
  assert.equal(path, '/media');
  assert.equal(m.host.querySelector('header.buy__card--belt h2')?.textContent, 'Advantage Media Edition');
  m.done();
});

test('locked /media shows the marketing page and not the paid console', () => {
  const m = mount('/media', false);
  assert.ok(m.host.querySelector('.home--media'));
  assert.match(m.host.textContent ?? "", /\$29\.99 USD — one-time/);
  assert.equal(m.host.querySelector('[data-paid-console]'), null);
  m.done();
});

test('a Pro or owner pass on /media gets the paid console, not the marketing page', () => {
  const m = mount('/media', true);
  assert.ok(m.host.querySelector('[data-paid-console]'));
  assert.equal(m.host.querySelector('.home--media'), null);
  m.done();
});

test('Media Edition hub buttons render like /suite: stacked pro-hub links in order, with subtitles', () => {
  const read = (entry: string) => {
    const m = mount(entry);
    const links = [...m.host.querySelectorAll('nav.suite__nav > a.pro-hub')].map((a) => ({
      title: a.querySelector('.pro-hub__label > span:first-child')?.textContent ?? a.textContent,
      sub: a.querySelector('.pro-hub__sub')?.textContent ?? null,
      href: a.getAttribute('href'),
      rail: a.querySelector('.belt-rail')?.className,
    }));
    m.done();
    return links;
  };
  const edition = read('/edition-menu');
  const suite = read('/suite-menu');
  assert.deepEqual(
    edition.map((l) => [l.title, l.href]),
    [
      ['Scoreboard', '/match/control?from=suite'],
      ['Round Timer', '/training/control?from=suite'],
      ['Media Console', '/slideshow?folder=gallery'],
    ],
  );
  assert.deepEqual(
    edition.map((l) => l.sub),
    [
      'Live match scoring. Easily cast to your gym TV.',
      'Rounds and rest. Easily cast to your gym TV.',
      'Slideshows, schedule, and events. Easily cast to your gym TV.',
    ],
  );
  // All three hub buttons wear the purple belt rail.
  for (const l of edition) assert.match(l.rail ?? '', /belt-rail--purple/, l.title);
  // Scoreboard and Round Timer: same link and title as on /suite.
  const fromSuite = suite.filter((l) => l.title === 'Scoreboard' || l.title === 'Round Timer');
  assert.deepEqual(
    edition.slice(0, 2).map(({ sub: _s, rail: _r, ...rest }) => rest),
    fromSuite.map(({ sub: _s, rail: _r, ...rest }) => rest),
  );
  // /suite keeps its black Scoreboard and Round Timer rails.
  for (const l of fromSuite) assert.match(l.rail ?? '', /belt-rail--black/, l.title);
  // /suite buttons stay single-line.
  for (const l of suite) assert.equal(l.sub, null, l.title);
});

test('unlocked hub is a clean menu: purple belt title on top, then three buttons, no gallery', () => {
  const m = mount('/hub');
  const { host } = m;
  assert.equal(document.title, 'Advantage Media Edition');
  const belt = host.querySelector('header.belt-header.belt-header--purple h2');
  assert.equal(belt?.textContent, 'Advantage Media Edition');
  const nav = host.querySelector('nav.suite__nav');
  assert.ok(nav);
  // Belt comes before the buttons.
  assert.ok(belt!.compareDocumentPosition(nav!) & 4);
  const titles = [...nav!.querySelectorAll('a.pro-hub .pro-hub__label > span:first-child')].map((n) => n.textContent);
  assert.deepEqual(titles, ['Scoreboard', 'Round Timer', 'Media Console']);
  assert.equal(host.querySelectorAll('a.pro-hub').length, 3);
  // No gallery, folder tiles, marketing price or alpha CTA on the menu.
  assert.equal(host.querySelector('.media-gallery, figure'), null);
  // The only image is the Advantage home mark logo, as on /white and /suite.
  assert.deepEqual([...host.querySelectorAll('img')].map((i) => i.className), ['home__logo']);
  assert.equal(host.querySelector('.buy, .buy__card'), null);
  assert.doesNotMatch(host.textContent ?? '', /\$29\.99|Request an alpha code|Gallery|Pro Shop|Class Schedule/);
  m.done();
});
