/**
 * Short coach connect QR (Nov 18): /c/<license>/<id> instead of the ~500-character signed link.
 * The short link only points at the full signed link stored in the gym's Advantage Cloud folder;
 * every check (signature, current key after rotate, signed `via`) is the same code path as before.
 * Memory bucket only: no production R2.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import type { PrivateJwk, PublicJwk } from '../lib/entitlementToken.ts';
import { coachConnectUrl, parseCoachConnectInput } from '../lib/coachConnect.ts';
import { qrDataUrl, qrModuleCount, QR_QUIET_ZONE } from '../lib/qr.ts';
import { handleCoachConnect, handleCoachConnectShortRedirect } from './coachConnect.ts';
import type { InboxBucket } from './studentInbox.ts';
import { issueToken, type IssueInput } from './tokenIssue.ts';

const LICENSE = 'ea5a2bee-90bd-4cf3-9a1b-e2de409f25f2';
const NOW = new Date('2026-11-18T23:00:00.000Z');
const ORIGIN = 'https://advantagebjjtimer.com';

function memoryBucket(): InboxBucket & { objects: Map<string, string> } {
  const objects = new Map<string, string>();
  return {
    objects,
    async get(key) {
      const text = objects.get(key);
      return text == null ? null : { text: async () => text };
    },
    async put(key, value) {
      objects.set(key, value);
    },
    async delete(key) {
      objects.delete(key);
    },
    async list({ prefix }) {
      return { objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}

async function secretKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = (await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk;
  const publicJwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as PublicJwk;
  return JSON.stringify({ kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y, d: privateJwk.d });
}

async function pass(secret: string, extra: Partial<IssueInput> & Pick<IssueInput, 'tier' | 'src' | 'kind'>): Promise<string> {
  const issued = await issueToken(secret, { licenseId: LICENSE, grants: ['white', 'student', 'coach', 'pro'], deviceId: 'device-1', now: NOW, subs: { state: 'active' }, ...extra });
  if (!issued) throw new Error('token was not issued');
  return issued;
}

type Ctx = { secret: string; bucket: ReturnType<typeof memoryBucket> };
const env = (c: Ctx) => ({ ENTITLEMENT_SIGNING_KEY: c.secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: null, GYM_MEDIA: c.bucket });

async function connect(c: Ctx, body: unknown, bearer?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  const response = await handleCoachConnect(new Request('https://advantage.test/api/gym/coach-connect', { method: 'POST', headers, body: JSON.stringify(body) }), env(c), () => NOW);
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function setup(): Promise<Ctx & { owner: string }> {
  const c = { secret: await secretKey(), bucket: memoryBucket() };
  return { ...c, owner: await pass(c.secret, { tier: 'pro', src: 'code', kind: 'pro' }) };
}

test('issue gives a short /c/<license>/<id> link that redirects to the full signed link; same code every time', async () => {
  const c = await setup();
  const first = await connect(c, { action: 'issue', gymName: 'Advantage Brazilian Jiu-Jitsu Ellijay Academy' }, c.owner);
  assert.equal(first.status, 200);
  assert.match(first.body.shortCode, new RegExp(`^${LICENSE}/[A-Za-z0-9_-]{22}$`));
  const again = await connect(c, { action: 'issue' }, c.owner);
  assert.equal(again.body.shortCode, first.body.shortCode, 'showing the QR again is the same short code');
  assert.deepEqual(
    [...c.bucket.objects.keys()].filter((key) => key.includes('/coach-connect/links/')),
    [`groups/${LICENSE}/coach-connect/links/${first.body.shortCode.split('/')[1]}.json`],
    "stored in the gym's own Cloud folder, so gym cleanup removes it",
  );

  const shortLink = coachConnectUrl(first.body.invite, ORIGIN, first.body.shortCode);
  assert.equal(shortLink, `${ORIGIN}/c/${first.body.shortCode}`);
  const longLink = coachConnectUrl(first.body.invite, ORIGIN);
  assert.ok(shortLink.length < 100 && longLink.length > 400, `${shortLink.length} vs ${longLink.length}`);

  const redirect = await handleCoachConnectShortRedirect(new Request(shortLink), env(c), first.body.shortCode);
  assert.equal(redirect.status, 302);
  const target = new URL(redirect.headers.get('location') ?? '');
  assert.equal(target.pathname, '/student/connections');
  // Redirect target is the stored signed link, which the existing accept checks as before.
  const signed = target.searchParams.get('coach') ?? '';
  assert.equal(signed.split('.').length, 3);
  const accepted = await connect(c, { action: 'accept', invite: signed });
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.body, { ok: true, gym: LICENSE, gymName: 'Advantage Brazilian Jiu-Jitsu Ellijay Academy', viaInstructorId: 'owner' }, 'unchanged accept answer');

  const bogus = `${LICENSE}/${'A'.repeat(22)}`;
  assert.equal((await handleCoachConnectShortRedirect(new Request(`${ORIGIN}/c/${bogus}`), env(c), bogus)).status, 404);
  assert.equal((await handleCoachConnectShortRedirect(new Request(`${ORIGIN}/c/x`), env(c), 'x')).status, 404);
  assert.equal((await handleCoachConnectShortRedirect(new Request(shortLink, { method: 'POST' }), env(c), first.body.shortCode)).status, 405);
});

test('a pasted short link goes through the same checks: rotate retires it, a made-up id is refused, via stays signed', async () => {
  const c = await setup();
  const issued = await connect(c, { action: 'issue', gymName: 'Advantage BJJ' }, c.owner);
  const pasted = parseCoachConnectInput(`${ORIGIN}/c/${issued.body.shortCode}`);
  assert.equal(pasted, `cc_${issued.body.shortCode}`);
  assert.equal(parseCoachConnectInput(coachConnectUrl(issued.body.invite, ORIGIN)), issued.body.invite, 'long links still parse');

  const ok = await connect(c, { action: 'accept', invite: pasted });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.gym, LICENSE);
  assert.equal(ok.body.viaInstructorId, 'owner');
  assert.equal(ok.body.invite, issued.body.invite, 'the phone keeps the full signed code as proof');

  assert.equal((await connect(c, { action: 'accept', invite: `cc_${LICENSE}/${'B'.repeat(22)}` })).status, 400);
  assert.equal((await connect(c, { action: 'accept', invite: `cc_someoneelse1/${issued.body.shortCode.split('/')[1]}` })).status, 400, 'id is only valid in its own gym');

  const rotated = await connect(c, { action: 'rotate', gymName: 'Advantage BJJ' }, c.owner);
  assert.notEqual(rotated.body.shortCode, issued.body.shortCode);
  const old = await connect(c, { action: 'accept', invite: pasted });
  assert.equal(old.status, 400, 'rotated short code is rejected');
  assert.match(String(old.body.error), /replaced/);
  assert.equal((await connect(c, { action: 'accept', invite: `cc_${rotated.body.shortCode}` })).status, 200);

  // A Coach seat's own code carries its id (via), and so does its short link.
  const seat = await pass(c.secret, { tier: 'seat', src: 'seat', kind: 'seat', preset: 'coach', gym: LICENSE, sid: 'seat-paige', subs: { state: 'active', cloud: true } });
  const current = await connect(c, { action: 'current' }, seat);
  assert.equal(current.status, 200);
  assert.notEqual(current.body.shortCode, rotated.body.shortCode);
  const viaSeat = await connect(c, { action: 'accept', invite: `cc_${current.body.shortCode}` });
  assert.equal(viaSeat.status, 200);
  assert.equal(viaSeat.body.viaInstructorId, current.body.via);
  assert.ok(viaSeat.body.viaInstructorId && viaSeat.body.viaInstructorId !== 'owner');
});

test('the short coach connect QR is far less dense and decodes to the exact link', async () => {
  const c = await setup();
  const issued = await connect(c, { action: 'issue', gymName: 'Advantage Brazilian Jiu-Jitsu Ellijay Academy' }, c.owner);
  const shortLink = coachConnectUrl(issued.body.invite, ORIGIN, issued.body.shortCode);
  const longLink = coachConnectUrl(issued.body.invite, ORIGIN);
  const shortModules = qrModuleCount(shortLink) - QR_QUIET_ZONE * 2;
  const longModules = qrModuleCount(longLink) - QR_QUIET_ZONE * 2;
  console.log(`coach connect QR: ${longLink.length} chars / ${longModules} modules -> ${shortLink.length} chars / ${shortModules} modules`);
  assert.ok(shortModules <= 45 && longModules >= 2 * shortModules - 10);
  const png = PNG.sync.read(Buffer.from((await qrDataUrl(shortLink)).split(',')[1], 'base64'));
  assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, shortLink);
});
