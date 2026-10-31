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

test('belt ladder is white, blue, purple, brown, black in rank order', () => {
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.belt),
    ['white', 'blue', 'purple', 'brown', 'black'],
  );
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.id),
    ['white', 'student', 'academy', 'coach', 'pro'],
  );
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.rank),
    ['01', '02', '03', '04', '05'],
  );
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.title),
    [
      'Advantage White',
      'Advantage – Student Edition',
      'Advantage Media Edition',
      'Advantage Instructor Edition',
      'Advantage Pro',
    ],
  );
  assert.match(tsx, /STOREFRONT_BELT_LADDER\.map/);
  assert.doesNotMatch(tsx, /STOREFRONT_STEPS\.map/);
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
  assert.match(tsx, /beltsVariantOf\(params\.get\('belts'\)\)/);
  assert.match(tsx, /journal=\{step\.id === 'student' && belts === 'a'\}/);
  assert.match(tsx, />\s*JOURNAL\s*</);
  assert.match(tsx, /className="sf-embroidery-mark"/);
  // Leather journal art is gone from the homepage tile.
  assert.doesNotMatch(tsx, /StudentBinder|sf-leather/);
  assert.doesNotMatch(css, /sf-leather/);
  // ?belts= never sends / to the app home.
  assert.equal(preservesAppHomeQuery(new URLSearchParams('belts=a')), false);
  assert.equal(preservesAppHomeQuery(new URLSearchParams('belts=b')), false);
});

test('all five belts share one box, weave, stitch and rank bar', () => {
  assert.match(tsx, /<div className="sf-belt-box">\s*<Belt color=\{step\.belt\}/);
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
  // $49.99 is display only on this tile; the Coach product copy (and Stripe) still says $29.99.
  assert.equal(rung.cardPrice, '$49.99 one-time');
  assert.equal(coach.cardPrice, '$29.99 one-time');
  assert.equal(rung.to, '/products');
  assert.equal(rung.status, 'Coming soon');
  for (const r of STOREFRONT_BELT_LADDER) {
    assert.doesNotMatch(`${r.title} ${r.rankLabel} ${r.blurb} ${r.detail ?? ''}`, /Coach/);
  }
  assert.doesNotMatch(STOREFRONT_LADDER_NOTE, /Coach/);
  assert.match(STOREFRONT_LADDER_NOTE, /Instructor/);
  // The code name is unchanged.
  assert.equal(coach.title, 'Advantage Coach');
});

test('every tier except Pro is priced one-time; Pro is $99.99 + $5.99/mo', () => {
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.cardPrice),
    ['$9.99 one-time', '$19.99 one-time', '$29.99 one-time', '$49.99 one-time', '$99.99 + $5.99/mo'],
  );
  assert.deepEqual(
    STOREFRONT_BELT_LADDER.map((r) => r.detail ?? null),
    [null, null, null, null, null],
  );
});

test('White is unchanged; Pro keeps its title, price, belt and link with the owner one-line copy', () => {
  const [white, , , , pro] = STOREFRONT_BELT_LADDER;
  assert.equal(white.detail, undefined);
  assert.deepEqual(
    { title: white.title, rankLabel: white.rankLabel, blurb: white.blurb, cardPrice: white.cardPrice, status: white.status, to: white.to },
    { title: 'Advantage White', rankLabel: 'WHITE', blurb: 'BJJ scoreboard and round timer.', cardPrice: '$9.99 one-time', status: 'Available now', to: STOREFRONT_BUY_PATH },
  );
  assert.equal(white.to, '/buy');
  const proStep = STOREFRONT_STEPS.find((s) => s.id === 'pro');
  assert.ok(proStep);
  assert.deepEqual(
    { title: pro.title, rankLabel: pro.rankLabel, cardPrice: pro.cardPrice, status: pro.status, to: pro.to },
    { title: proStep.title, rankLabel: proStep.rankLabel, cardPrice: proStep.cardPrice, status: proStep.status, to: proStep.to },
  );
  // Owner copy: one line replaces both earlier Pro lines.
  assert.equal(
    pro.blurb,
    'Academy Enhancement Software for Gym Owners and Jiu-Jitsu Professionals.',
  );
  assert.doesNotMatch(pro.blurb, /Management Console|giftable codes|instructor seats|Includes Instructor/);
  assert.equal(pro.detail, undefined);
  assert.doesNotMatch(pro.blurb, /Includes/);
  // The shared product copy (and its code name) is untouched.
  assert.match(proStep.blurb, /Includes Coach\.$/);
  assert.equal(pro.cardPrice, '$99.99 + $5.99/mo');
  assert.equal(pro.to, '/products');
  // Black keeps the white / red / white bar class; White keeps the live card.
  assert.match(tsx, /color === 'black' \? 'pro' : color/);
  assert.match(tsx, /step\.id === 'white' \? ' sf-step--live' : ''/);
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
  assert.equal(STOREFRONT_LADDER_NOTE, 'Student, Media, Instructor and Pro are in alpha testing.');
  assert.doesNotMatch(STOREFRONT_LADDER_NOTE, /Academy Enhancement/);
  // Display only: no Academy product exists in Stripe.
  assert.equal(academy.cardPrice, '$29.99 one-time');
  assert.equal(academy.status, 'Coming soon');
  assert.equal(academy.to, '/media-edition');
  // The mail-link branch stays for any future rung without a page.
  assert.match(tsx, /if \(step\.to === null\)[\s\S]*?href=\{alphaRequestMailto\(\)\}/);
  // The section keeps its heading and the alpha button.
  assert.equal(STOREFRONT_PROGRESS_HEADING, 'Start with White. Grow into Pro.');
  assert.match(tsx, /Request to join alpha/);
  assert.match(tsx, /<section className="sf-prog" id="progression"/);
  // The second line is plain text, not a link.
  assert.match(tsx, /\{step\.detail \? <p className="sf-step-detail">\{step\.detail\}<\/p> : null\}/);
});
