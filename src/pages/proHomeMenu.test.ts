import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pro = readFileSync(new URL('./Pro.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./proHomeMenu.css', import.meta.url), 'utf8');
const paint = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const ladder = readFileSync(new URL('../lib/editionLadder.ts', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('./ProPlusCloud.tsx', import.meta.url), 'utf8');

test('the Pro home labels the first four hubs and keeps their destinations', () => {
  const belt = pro.indexOf('<BeltHeader');
  const sheet = pro.indexOf('<GymCharacterSheet />');
  const white = pro.indexOf('to="/white"');
  const student = pro.indexOf('to="/student"');
  const hubs = pro.indexOf('<ProToolboxCard');
  assert.ok(belt > -1 && sheet > belt && white > sheet && student > white && hubs > student);
  assert.match(pro, /<span>Advantage White<\/span>/);
  assert.match(pro, /<span>Advantage Student Edition<\/span>/);
  assert.match(pro, /title: 'Advantage Media Edition'/);
  assert.match(pro, /hub\.title === MEDIA_CONSOLE_NAME/);
  assert.match(pro, /hub\.to === '\/slideshow\?folder=gallery'/);
  assert.doesNotMatch(pro, /[Jj]ournal/);
  assert.doesNotMatch(pro, /pro-hub__sub/);
  assert.doesNotMatch(pro, /preview\//);
  assert.match(ladder, /white:\s*'\/white'/);
  assert.match(ladder, /student:\s*'\/student'/);
  const names = readFileSync(new URL('../lib/productNames.ts', import.meta.url), 'utf8');
  assert.match(names, /MEDIA_CONSOLE_NAME = 'Media Console'/);
  assert.match(names, /PRO_INSTRUCTOR_HUB_LABEL = 'Advantage Instructor Edition'/);
  assert.match(names, /to: '\/slideshow\?folder=gallery'/);
  assert.match(names, /to: COACH_UNLIMITED_PATH, belt: 'brown'/);
});

test('the Pro home header clearance is page-local and the hub tiles stay cream', () => {
  assert.match(css, /\.home--pro-menu\.home--pro \.home__inner \{[^}]*padding-top:\s*calc\(0\.5rem \+ var\(--safe-t\)\)/);
  assert.match(css, /\.home--pro-menu \.pro-hub \{[^}]*background:\s*#efebe3/);
  assert.match(css, /\.home--pro-menu \.pro-hub \{[^}]*color:\s*#14161c/);
  assert.match(css, /\.home--pro-menu \.pro-hub > span \{[^}]*font-size:\s*clamp\(1\.05rem, 2\.7vw, 1\.28rem\)/);
  assert.doesNotMatch(css, /pro-hub__sub/);
  assert.match(paint, /\.pro-hub,[\s\S]*background:\s*#0c2344/);
  assert.doesNotMatch(cloud, /home--pro-menu/);
  assert.match(cloud, /<GymCharacterSheet \/>/);
  const cloudSheet = cloud.indexOf('<GymCharacterSheet />');
  const cloudBelt = cloud.indexOf('<BeltHeader');
  assert.ok(cloudSheet > -1 && cloudBelt > cloudSheet);
});
