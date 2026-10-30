# Paywall phase plan

Phase 1 is on main. Phase 2 (signed tokens, D1 purchases, restore) is described in `docs/paywall-phase-2.md`. Grace, seats, and server-served chunks are still later.

## Decisions (owner)

These match `src/server/paywallDecisions.ts`.

| Decision | Value |
| --- | --- |
| Pro price | $99.99 one-time plus $5.99/month. Checkout is unchanged. |
| Failed payment | 7 days of full access, then a full lock. Access ends when Stripe stops retrying. |
| Paused subscription | Locked. |
| Pro token (later) | 7 days, plus 3 days offline. |
| One-time token (later) | 30 days, then fail open up to 90 days if the server cannot be reached. |
| Refund or lost dispute | Revokes a one-time purchase. |
| Devices per Pro license | 5, soft cap. Active means seen in the last 60 days. |
| Devices per instructor seat | 1. Raise `DEVICES_PER_INSTRUCTOR_SEAT` if a gym needs 2. |
| Instructor seats | Up to 10. Hard server enforcement is a later phase. The client cap is already 10. |
| Seat email | A label for the invited person, not a login. |
| Restore mail | Will be sent from `contact@advantagebjjtimer.com` later. That address is receive-only today. This phase does not send email. |
| Amnesty for old browser flags | 45 days, once signed tokens exist. There are no paying customers yet, so this phase does not migrate flags. |
| DNS | Already on Cloudflare. |
| Stripe Tax | Owner action outside this work. |

## What Phase 1 does

- Address-bar shortcuts (`?pro=`, `?coach=`, `?unlock=`, a fake `?checkout=success`) do not grant a tier.
- `?student=1` is a labeled demo with sample journal data. It does not set an entitlement, and its writes do not replace the real journal keys.
- Unlock codes are checked only on `POST /api/codes/redeem`. Storage is a peppered HMAC. Comparison is constant time. The endpoint is rate limited. A wrong code, a retired code, and an expired code return the same sentence.
- Each code is its own record (env catalog and/or a KV key `code:<hash>`), not one shared blob.
- The free White campaign caps are 300 total, 25 per day, 1 per email, 2 per IP per day, and 90 days after redemption. Email may be omitted. Cap misses return a plain sentence.
- `GET /api/entitlement` no longer says whether an email or session has a purchase.
- A checkout return unlocks only after `POST /api/checkout-confirm` reads the Stripe session.
- The owner test unlock is `POST /api/owner-test`. The secret lives only in Cloudflare.

## Owner setup before deploy

Do this in Cloudflare Pages for Production and Preview, and in `.env` for `npm run dev`. None of these are `VITE_` build variables. Do not commit the values.

1. **`CODE_HASH_PEPPER`** — Secret. A long random string. The generator and the server must use the same value. If it is missing, code redeem returns a setup error and does not grant anything.
2. **`OWNER_TEST_SECRET`** — Secret. Another long random string, different from the pepper. If it is missing, the test unlock fails with the same generic sentence as a wrong secret.
3. **`CODE_CATALOG`** — Plain environment variable, not a secret the browser can see, but it holds hashes so treat it as server-only. JSON array. No plaintext codes. Example shape (hashes are samples, not real):

```json
[{"id":"owner","hash":"<64 hex chars>","kind":"owner"}]
```

Kinds: `owner`, `alpha-coach`, `alpha-pro`, `alpha-student`, `free-white`. Omit caps on `free-white` to use 300 / 25 / 1 / 2 and a 90-day grant. A code with any cap needs step 4.
4. **`WHITE_ENTITLEMENTS`** — Existing KV binding. Webhooks still use it. Capped codes use separate keys (`cap:<id>:total`, and so on) in that same namespace when the Durable Object below is not bound.
5. **`CODE_REDEMPTIONS`** — Optional Durable Object binding, class `CodeRedemptionDo` in `functions/codeRedemptionDo.ts`. Bind this before the free White campaign if you want the caps to be strictly atomic. Without it, two redemptions of the same code at the same moment can both pass a cap. Different codes do not collide. The old single-key purchase index had a wider version of that race; purchases are unchanged in this phase.
6. Stripe keys and price ids stay as they are. Webhook signature checking is unchanged.

If the pepper or the catalog is missing, the site still loads. Code entry says the checks are not set up, or that the code did not work when the catalog is empty. Paid checkout still needs the Stripe variables. The owner test button is on the page either way; a missing secret does not unlock.

### Generate and rotate codes

From the repo, with the pepper only in the environment:

```bash
CODE_HASH_PEPPER='your-pepper' node --experimental-strip-types scripts/generate-unlock-codes.ts --kind owner
CODE_HASH_PEPPER='your-pepper' node --experimental-strip-types scripts/generate-unlock-codes.ts --kind alpha-coach
CODE_HASH_PEPPER='your-pepper' node --experimental-strip-types scripts/generate-unlock-codes.ts --kind alpha-pro
CODE_HASH_PEPPER='your-pepper' node --experimental-strip-types scripts/generate-unlock-codes.ts --kind alpha-student
CODE_HASH_PEPPER='your-pepper' node --experimental-strip-types scripts/generate-unlock-codes.ts --kind free-white
```

The script prints the new code once on your machine, a JSON record of the hash, and the same record inside `[ ]`. For one code, paste the `[ ]` line as the whole `CODE_CATALOG` value. For several codes, put every record inside one `[ ]`, separated by commas. The server also reads a single record, records one per line, or a value wrapped in quotes, but the `[ ]` form is the documented one.

Check the value on your machine before you paste it (nothing is sent anywhere):

```bash
node --experimental-strip-types scripts/check-code-catalog.ts catalog.json
CODE_HASH_PEPPER='…' CHECK_CODE='ABCD-…' node --experimental-strip-types scripts/check-code-catalog.ts catalog.json
```

After a deploy, `GET /api/config` shows `codes: { pepperSet, catalogSet, catalogLoaded, entries, rejected, problem }`. These are counts and one reason word only. `problem` is `not-json`, `looks-like-a-plain-code` (the code itself was pasted, not the record), `hash-without-record` (only the hash or the `code:<hash>` KV key was pasted), `bad-kind`, `bad-hash`, or null. If `catalogLoaded` is false or `entries` is lower than the number of codes you made, the pasted value is wrong. If `entries` is right and a code still fails, the pepper you used in the generator is not the one in Cloudflare.

Or write the record to KV:

```bash
npx wrangler kv key put --binding WHITE_ENTITLEMENTS "code:<hash>" '<json record>'
```

Rotate by generating a new code and removing the old hash from the catalog. Browsers that already redeemed keep the local flag until Phase 2 tokens exist. To stop a code immediately, set `"retired": true` on its record. Do not reuse a code that has ever shipped in the site.

### Owner test unlock on a phone or a computer

1. Deploy with `OWNER_TEST_SECRET` set.
2. Open `https://advantagebjjtimer.com/products` (or the preview URL).
3. Tap **Owner test unlock** at the bottom of the product list.
4. Type the secret. It is a password field. It is not put in the address bar.
5. Choose a tier: White, Student Edition, Coach, Pro, Instructor seat, or All tiers.
6. Choose 24 hours, 7 days, or 30 days. Longer values are capped at 30.
7. Tap **Unlock for testing**. Pro also opens Student Edition. The seat choice opens an in-memory instructor seat labeled "Owner test" and does not write the real seat list. If a real seat is already signed in on that browser, sign out of it first to see the test seat.
8. Tap **Clear test unlock** on that same sheet to remove it. Clearing does not need a successful server call; the button drops the grant on this browser. Rotating `OWNER_TEST_SECRET` stops new unlocks. A grant already saved on a phone lasts until you clear it or it expires.

The secret is not in the JavaScript bundle, is not written to logs, and is not accepted from a URL. Demo mode does not turn it on. Putting a JSON blob in `localStorage` does not turn it on; the grant is kept in `sessionStorage` only after the server says yes. Closing the browser may drop it. Enter the secret again. A person who hand-edits `sessionStorage` can still imitate the grant until signed tokens exist. That is the same limit as the other on-device flags in this phase.

### What still works

- Stripe checkout, the half-off allowlist, and Stripe promotion codes typed at checkout.
- Webhook signature checks.
- Drive and OneDrive sign-in.
- Prices on the page, including Pro at $99.99 plus $5.99/month.
- Lock buttons. They only reduce access.
- Instructor invites already on a device.

## Deferred (do not build in Phase 1)

- Signed entitlement tokens and offline verification.
- Device registry and the 5-device soft cap.
- Subscription state machine: grace day 7, paused locked, refund revocation.
- Server-enforced instructor seats and seat inheritance.
- Email restore. `contact@advantagebjjtimer.com` cannot send yet.
- Replacing `GET /api/entitlement` with a magic-code restore.
- Moving the purchase index off the single KV key.
- Turnstile and a Cloudflare WAF rate rule. The app has its own limiter. A WAF rule on `/api/*` is still worth adding in the dashboard because DNS is already on Cloudflare.
- Stripe Tax.

## Cap storage tradeoff

Durable Objects apply each redemption one at a time, so the free White caps hold under a burst. KV counters are one key per counter. Two overlapping requests can both read the old number and both write, so a cap can be exceeded by the size of that overlap. That is much smaller than the old bug, where every purchase rewrote one shared key and could erase another purchase. Bind `CODE_REDEMPTIONS` before advertising the free code. Leave it unset and the KV fallback still counts, with that race documented here. `npm run dev` counts in memory inside the Vite process and resets when that process restarts.
