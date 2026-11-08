import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pro = readFileSync(new URL('./Pro.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./proHomeMenu.css', import.meta.url), 'utf8');
const paint = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const ladder = readFileSync(new URL('../lib/editionLadder.ts', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('./ProPlusCloud.tsx', import.meta.url), 'utf8');

test('the Pro home puts White and the personal journal above the existing hubs', () => {
  const belt = pro.indexOf('<BeltHeader');
  const sheet = pro.indexOf('<GymCharacterSheet />');
  const white = pro.indexOf('to="/white"');
  const student = pro.indexOf('to="/student"');
  const hubs = pro.indexOf('<ProToolboxCard');
  assert.ok(belt > -1 && sheet > belt && white > sheet && student > white && hubs > student);
  assert.match(pro, /BeltRail kind="white"/);
  assert.match(pro, /BeltRail kind="blue"/);
  assert.match(pro, />\s*White\s*</);
  assert.match(pro, />\s*Student Edition\s*</);
  assert.match(pro, /Personal journal\./);
  assert.match(pro, /Scoreboard and round timer\./);
  assert.doesNotMatch(pro, /preview\//);
  assert.match(ladder, /white:\s*'\/white'/);
  assert.match(ladder, /student:\s*'\/student'/);
});

test('the Pro home header clearance is page-local and the hub tiles stay cream', () => {
  assert.match(css, /\.home--pro-menu\.home--pro \.home__inner \{[^}]*padding-top:\s*calc\(0\.5rem \+ var\(--safe-t\)\)/);
  assert.match(css, /\.home--pro-menu \.pro-hub \{[^}]*background:\s*#efebe3/);
  assert.match(css, /\.home--pro-menu \.pro-hub \{[^}]*color:\s*#14161c/);
  assert.match(paint, /\.pro-hub,[\s\S]*background:\s*#0c2344/);
  assert.doesNotMatch(cloud, /home--pro-menu/);
  assert.match(cloud, /<GymCharacterSheet \/>/);
  const cloudSheet = cloud.indexOf('<GymCharacterSheet />');
  const cloudBelt = cloud.indexOf('<BeltHeader');
  assert.ok(cloudSheet > -1 && cloudBelt > cloudSheet);
});
