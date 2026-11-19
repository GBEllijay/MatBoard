import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

/**
 * Owner's Nov 18 screenshot: no phone could read the instructor invite QR (a ~400-character
 * signed link, a 1-module quiet zone, rounded corners, 180 px). This shoots the seat card at
 * phone size (390 px, DPR 3) and decodes the screenshot with a real QR decoder.
 */

const SID = '5a1f3c2e-8b4d-4e6f-9a7b-1c2d3e4f5a6b';
const NONCE = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const b64 = (value: string) => Buffer.from(value).toString('base64url');
// The panel only reads the payload to build the link; the server verifies the signature on use.
const INVITE = [
  b64(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'k1' })),
  b64(JSON.stringify({ typ: 'seat-invite', gym: 'b3c4d5e6-f7a8-4b9c-8d0e-1f2a3b4c5d6e', sid: SID, preset: 'program-director', nonce: NONCE, exp: 1900000000, v: 1 })),
  'x'.repeat(86),
].join('.');
const SHORT = `${Buffer.from(SID.replace(/-/g, ''), 'hex').toString('base64url')}${Buffer.from(NONCE.replace(/-/g, ''), 'hex').toString('base64url')}`;

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

test('the instructor invite QR is a short /i/ link a phone can read', async ({ page, baseURL }) => {
  await page.addInitScript(
    ({ sid, invite }) => {
      if (sessionStorage.getItem('iqr-seeded')) return;
      sessionStorage.setItem('iqr-seeded', '1');
      localStorage.setItem('advantage.proUnlocked', '1');
      localStorage.setItem(
        'matboard.pro.instructorSeats.v1',
        JSON.stringify({
          version: 1,
          deviceGymId: 'device-fixture',
          seats: [{ id: sid, gymId: 'device-fixture', email: 'augustus.coach@gmail.com', status: 'invited', issuedAt: Date.now(), presetId: 'program-director', permissions: { galleryUpload: true, eventsAccess: true, proShopAccess: true }, inviteToken: invite }],
        }),
      );
    },
    { sid: SID, invite: INVITE },
  );
  await page.route('**/api/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' }));
  await page.goto('/instructors');
  const qr = page.locator('.seat-card .invite-link__qr').first();
  await qr.scrollIntoViewIfNeeded();
  await expect(qr).toBeVisible();
  const look = await qr.evaluate((img: HTMLImageElement) => ({
    width: img.getBoundingClientRect().width,
    natural: img.naturalWidth,
    radius: getComputedStyle(img).borderRadius,
  }));
  expect(look.width).toBeGreaterThanOrEqual(240);
  expect(look.natural).toBeGreaterThanOrEqual(look.width * 3);
  expect(look.radius).toBe('0px');

  const shot = PNG.sync.read(await page.screenshot());
  const found = jsQR(new Uint8ClampedArray(shot.data), shot.width, shot.height);
  const expected = `${new URL(baseURL ?? page.url()).origin}/i/${SHORT}`;
  expect(found?.data).toBe(expected);

  // The short link opens the account invite screen with the code filled in.
  await page.goto(`/i/${SHORT}`);
  await expect(page).toHaveURL(new RegExp(`/account\\?invite=${SHORT}$`));
  await expect(page.getByText("You've been invited as an instructor.", { exact: false })).toBeVisible();
});
