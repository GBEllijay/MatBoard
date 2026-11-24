import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { STOREFRONT_BUY_PATH, STOREFRONT_PROGRESS_HEADING, STOREFRONT_STEPS } from './storefront.ts';
import {
  BELTS_VARIANTS,
  DEFAULT_BELTS_VARIANT,
  STOREFRONT_BELT_LADDER,
  STOREFRONT_LADDER_NOTE,
  beltsVariantOf,
} from './storefrontBelts.ts';
import { preservesAppHomeQuery } from './submenuNav.ts';

const tsx = readFileSync(new URL('../pages/Storefront.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../pages/storefront.css', import.meta.url), 'utf8');

test('belt ladder is white, blue, purple, brown, black, black in rank order', () => {
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.belt),
    ['white', 'blue', 'purple', 'brown', 'black', 'black'],
  );
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.id),
    ['white', 'student', 'academy', 'coach', 'pro', 'pro-cloud'],
  );
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.rank),
    ['01', '02', '03', '04', '05', '06'],
  );
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.title),
    [
      'Advantage BJJ Scoreboard',
      'Advantage – Student Edition',
      'Advantage Media Edition',
      'Advantage Instructor Edition',
      'Advantage Pro',
      'Advantage Pro + Cloud',
    ],
  );
  assert.doesNotMatch(tsx, /STOREFRONT_BELT_LADDER/);
  assert.doesNotMatch(tsx, /STOREFRONT_STEPS\.map/);
  assert.doesNotMatch(tsx, /id="progression"/);
});

test('?belts=a embroiders JOURNAL on the blue belt, ?belts=b is the plain blue belt', () => {
  assert.deepEqual([...BELTS_VARIANTS], ['a', 'b']);
  // Owner approved B (plain blue belt) as the default; ?belts=a stays reachable.
  assert.equal(DEFAULT_BELTS_VARIANT, 'b');
  assert.equal(beltsVariantOf(''), 'b');
  assert.equal(beltsVariantOf('a'), 'a');
  assert.equal(beltsVariantOf(' B '), 'b');
  assert.equal(beltsVariantOf(null), 'b');
  assert.equal(beltsVariantOf('z'), 'b');
  assert.equal(beltsVariantOf(' A '), 'a');
  const student = STOREFRONT_BELT_LADDER.find((r) => r.id === 'student');
  assert.equal(student?.blurb, 'Personal BJJ Training Journal and More.');
  assert.doesNotMatch(student?.blurb ?? '', /^A personal BJJ training journal\.$/);
  assert.equal(student?.cardPrice, '$19.99 one-time');
  // The belt ladder (and its ?belts= journal embroidery) no longer renders on the public homepage.
  assert.doesNotMatch(tsx, /beltsVariantOf/);
  assert.doesNotMatch(tsx, /StudentBinder|sf-leather/);
  assert.doesNotMatch(css, /sf-leather/);
  // ?belts= never sends / to the app home.
  assert.equal(preservesAppHomeQuery(new URLSearchParams('belts=a')), false);
  assert.equal(preservesAppHomeQuery(new URLSearchParams('belts=b')), false);
});

test('all five belts share one box, weave, stitch and rank bar', () => {
  assert.doesNotMatch(tsx, /sf-belt-box/);
  assert.match(css, /--sf-belt-purple: #6b2d91;/);
  assert.match(css, /--sf-belt-brown: #6b3a1f;/);
  assert.match(css, /\.sf-belt--purple \{\s*--sf-fill: var\(--sf-belt-purple\);\s*\}/);
  assert.match(css, /\.sf-belt--brown \{\s*--sf-fill: var\(--sf-belt-brown\);\s*\}/);
  assert.match(css, /\.sf-belt--blue \{\s*--sf-fill: var\(--sf-belt-blue\);\s*\}/);
});

test('Coach reads Instructor in this section, with the same code name, id and route', () => {
  const coach = STOREFRONT_STEPS.find((s) => s.id === 'coach');
  const rung = STOREFRONT_BELT_LADDER.find((r) => r.id === 'coach');
  assert.ok(coach && rung);
  assert.equal(rung.title, 'Advantage Instructor Edition');
  assert.equal(rung.rankLabel, 'INSTRUCTOR');
  assert.equal(rung.blurb, 'Daily lesson plans, videos, and enhanced training tools.');
  assert.equal(rung.cardPrice, '$49.99 one-time');
  assert.equal(coach.cardPrice, '$49.99 one-time');
  assert.equal(rung.to, '/editions/instructor');
  assert.equal(coach.to, '/products');
  assert.equal(rung.status, 'This product is in alpha');
  for (const r of STOREFRONT_BELT_LADDER) {
    assert.doesNotMatch(`${r.title} ${r.rankLabel} ${r.blurb} ${r.detail ?? ''}`, /Coach/);
  }
  assert.doesNotMatch(STOREFRONT_LADDER_NOTE, /Coach/);
  assert.match(STOREFRONT_LADDER_NOTE, /Instructor/);
  // The code name is unchanged.
  assert.equal(coach.title, 'Advantage Instructor Edition');
});

test('every tier except Pro and Pro Plus Cloud is priced one-time; Pro is $99.99 + $5.99/mo; Cloud is $5.99/month', () => {
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.cardPrice),
    ['$19.99 one-time', '$19.99 one-time', '$29.99 one-time', '$49.99 one-time', '$99.99 one-time', '$5.99/month'],
  );
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.detail ?? null),
    [
      null,
      null,
      null,
      'Requires gym setup with a third-party drive (Google Drive or OneDrive). Advantage does not host it.',
      'Requires your own Google Drive or OneDrive. Advantage does not host it.',
      null,
    ],
  );
});

test('White is unchanged; Pro keeps its title, price, belt and link with the owner one-line copy', () => {
  const [white, , , , pro] = STOREFRONT_BELT_LADDER;
  assert.equal(white.detail, undefined);
  assert.deepEqual(
    { title: white.title, rankLabel: white.rankLabel, blurb: white.blurb, cardPrice: white.cardPrice, status: white.status, to: white.to },
    { title: 'Advantage BJJ Scoreboard', rankLabel: 'WHITE', blurb: 'BJJ scoreboard and round timer.', cardPrice: '$19.99 one-time', status: 'Available now', to: STOREFRONT_BUY_PATH },
  );
  assert.equal(white.to, '/buy');
  const proStep = STOREFRONT_STEPS.find((s) => s.id === 'pro');
  assert.ok(proStep);
  assert.deepEqual(
    { title: pro.title, rankLabel: pro.rankLabel, cardPrice: pro.cardPrice, status: pro.status },
    { title: proStep.title, rankLabel: proStep.rankLabel, cardPrice: proStep.cardPrice, status: proStep.status },
  );
  // The ladder card opens the Pro buy page; the picker step still links to /products.
  assert.equal(pro.to, '/editions/pro');
  assert.equal(proStep.to, '/products');
  // Owner copy: one line replaces both earlier Pro lines.
  assert.equal(
    pro.blurb,
    'Academy Enhancement Software for Gym Owners and Jiu-Jitsu Professionals.',
  );
  assert.doesNotMatch(pro.blurb, /Management Console|giftable codes|instructor seats|Includes Instructor/);
  assert.equal(pro.detail, 'Requires your own Google Drive or OneDrive. Advantage does not host it.');
  assert.equal(pro.bar, 'red');
  assert.doesNotMatch(pro.blurb, /Includes/);
  // The shared product copy (and its code name) is untouched.
  assert.match(proStep.blurb, /Includes Instructor Edition\.$/);
  assert.equal(pro.cardPrice, '$99.99 one-time');
  assert.equal(pro.to, '/editions/pro');
  // Pro is the plain red bar. Pro Plus Cloud keeps white | red | white.
  assert.match(css, /\.sf-belt--red-bar/);
  assert.match(css, /\.sf-belt--striped/);
  const cloud = STOREFRONT_BELT_LADDER.find((r) => r.id === 'pro-cloud');
  assert.ok(cloud);
  assert.equal(cloud.bar, 'striped');
  assert.equal(cloud.cardPrice, '$5.99/month');
  assert.equal(cloud.status, 'This product is in alpha');
  assert.equal(cloud.to, '/editions/pro-cloud');
  assert.equal(cloud.blurb, 'Advantage hosted cross-platform communication. Easiest way to use Advantage.');
  assert.doesNotMatch(`${cloud.title} ${cloud.blurb}`, /Cloudflare|checkout|Stripe/i);
});

test('Media Edition (purple) has no product: display price only, no checkout, the tile opens the Media Edition page', () => {
  const academy = STOREFRONT_BELT_LADDER.find((r) => r.id === 'academy');
  assert.ok(academy);
  assert.equal(academy.blurb, 'Scoreboard, round timer, and media console.');
  assert.equal(academy.detail, undefined);
  assert.equal(academy.title, 'Advantage Media Edition');
  assert.equal(academy.rankLabel, 'MEDIA');
  assert.equal(academy.belt, 'purple');
  for (const r of STOREFRONT_BELT_LADDER) {
    assert.doesNotMatch(`${r.title} ${r.rankLabel}`, /Academy Enhancement Edition|ACADEMY/);
  }
  assert.equal(STOREFRONT_LADDER_NOTE, 'Student, Media, Instructor, Pro and Advantage Pro + Cloud are in alpha testing.');
  const media = STOREFRONT_BELT_LADDER.find((r) => r.id === 'academy');
  assert.equal(media?.learnLabel, 'Learn more about Media Edition');
  assert.doesNotMatch(tsx, /className="sf-learn"/);
  assert.doesNotMatch(STOREFRONT_LADDER_NOTE, /Academy Enhancement/);
  // Display only: no Academy product exists in Stripe.
  assert.equal(academy.cardPrice, '$29.99 one-time');
  assert.equal(academy.status, 'This product is in alpha');
  assert.equal(academy.to, '/media');
  // The heading copy is unchanged; the public homepage no longer shows the ladder or alpha button.
  assert.equal(STOREFRONT_PROGRESS_HEADING, 'Start with White. Grow into Pro.');
  assert.doesNotMatch(tsx, /Request to join alpha/);
  assert.doesNotMatch(tsx, /id="progression"/);
  assert.doesNotMatch(tsx, /sf-step-detail/);
});
