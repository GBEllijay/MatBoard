# Paywall phase 2

Signed entitlement tokens, per-record purchase storage, and restore by email. Phase 3 (subscription grace, seat enforcement) and Phase 4 (server-served chunks) are not in this change.

## What changed

- The server signs an ES256 token. The browser checks it with the public key from `GET /api/config`. A hand-edited `localStorage` unlock flag stops working after the amnesty instant.
- Purchases are rows in D1. The old KV index is still read by the existing store during migration. Each new purchase is also its own KV key (`purchase:<product>:<session id>`) so two webhooks cannot erase each other.
- Coach checkouts are recorded. They were skipped before.
- `GET /api/entitlement` returns 410. Restore is `POST /api/restore/request` and `POST /api/restore/verify`.
- Checkout sends a nonce hash as Stripe `client_reference_id`. `POST /api/session/redeem` checks that nonce and returns a token.
- Free-code caps stay on the Phase 1 Durable Object `CodeRedemptionDo`. D1 can do an atomic `UPDATE ... WHERE count < cap`, which is equally exact for a single counter, but the object is already the cap counter and this phase does not move those counters.

## Amnesty

`LEGACY_AMNESTY_ENDS_AT` is `2026-12-12T00:00:00.000Z` (45 days after 2026-10-28). Until then, the old unlock flags still open doors. After that, only a verified token does. Set `LEGACY_AMNESTY_ENDS_AT` in Cloudflare to shorten it without a code change.

The notice and the cleanup touch only:

- `advantage.whiteUnlocked`
- `advantage.whiteExpiresAt`
- `advantage.coachUnlocked`
- `advantage.proUnlocked`
- `advantage.studentEditionUnlocked`
- `advantage.studentUnlocked`

They do not clear `localStorage`, they do not open IndexedDB, and they do not read gym logos, rank photos, bracket photos, gallery photos, rosters, journals, or Drive / OneDrive keys. Testing locks (`advantage.studentEditionRelocked` and the new relock keys) only reduce access and are not removed.

## Owner setup before deploy

Do these in order for Production and Preview. Do not prefix them with `VITE_`. Do not commit the values. If a step is skipped, the site still loads and says what is missing. Owner test unlock keeps working from the server secret even when the signing key is missing (it will not be a signed token until step 4).

1. Create the D1 database named `advantage-entitlements`.
2. Apply `migrations/0001_entitlements.sql` to that database.
3. Bind it as `ENTITLEMENTS_DB` (D1).
4. Generate a signing key on your machine and store the private JWK as the secret `ENTITLEMENT_SIGNING_KEY`:

```bash
node --experimental-strip-types scripts/generate-signing-key.ts
```

5. Optional `ENTITLEMENT_KEY_ID` (default `k1`). Change it only when you rotate. Publish the new key from `/api/config` and wait out the longest token (one-time fail-open is 120 days) before you delete the old secret.
6. Keep Phase 1: `CODE_HASH_PEPPER`, `OWNER_TEST_SECRET`, `CODE_CATALOG`, KV `WHITE_ENTITLEMENTS`, and Durable Object `CODE_REDEMPTIONS` (class `CodeRedemptionDo`) if free-code caps must be exact.
7. Export the KV key `advantage-white-entitlements` and migrate it once:

```bash
CODE_HASH_PEPPER='…' node --experimental-strip-types scripts/migrate-kv-entitlements.ts ./index.json > /tmp/migrate.sql
npx wrangler d1 execute advantage-entitlements --remote --file=/tmp/migrate.sql
```

The script prints SQL with email hashes, not emails. Do not commit `index.json`. Coach buyers were never stored. If Stripe shows any, add them by hand.
8. Leave the KV binding in place until you have restored a migrated purchase. New writes no longer depend on rewriting that one index key.
9. Restore mail, when you are ready (until then the page says restore is not available yet):
   - `RESEND_API_KEY` secret
   - `EMAIL_FROM` = `contact@advantagebjjtimer.com` (this is the default)
   - `TURNSTILE_SECRET_KEY` secret and `TURNSTILE_SITE_KEY` (public, not a secret)
10. Optional `MIN_APP_VERSION` (default `2`) and `LEGACY_AMNESTY_ENDS_AT`.

`EMAIL_PROVIDER=dry-run` skips the network and does not log the message. Use it only to see the route respond. Tests inject an in-memory sender and must not set `RESEND_API_KEY`.

Stripe price ids, the webhook secret, and Drive / OneDrive OAuth are unchanged.

## DNS for contact@advantagebjjtimer.com

That address is a Cloudflare Email Routing alias and cannot send today. To send restore mail with Resend:

1. In Resend, add the domain `advantagebjjtimer.com` and copy the DNS records it shows.
2. At the DNS host (already on Cloudflare), add the records Resend gives you. The names are typical, the values are not, so copy them from Resend rather than inventing them:
   - SPF on the apex as a TXT record. If a TXT SPF record already exists, add Resend's include to that one record. Do not create a second SPF record.
   - DKIM as the CNAMEs or TXT records Resend lists, usually under a host such as `resend._domainkey`.
   - DMARC as a TXT record on `_dmarc`. Start with `p=none` and an `rua` mailbox you read, then tighten later.
3. In Cloudflare Email Routing, keep `contact@` receiving mail. Sending is a separate provider. The From address on restore mail is `contact@advantagebjjtimer.com`.
4. Create a Resend API key that can send from that domain. Put it in `RESEND_API_KEY`.
5. Create a Turnstile widget for `advantagebjjtimer.com` and `localhost`. Put the secret in `TURNSTILE_SECRET_KEY` and the site key in `TURNSTILE_SITE_KEY`.

Until steps 9 and this DNS work are done, restore returns "Restore is not available yet." Checkout, codes, and owner test still work.

## Degraded mode

| Missing | What still works |
| --- | --- |
| `ENTITLEMENT_SIGNING_KEY` | Owner test returns the same grant as Phase 1 and says signing is not set up. Checkout redeem can still set the amnesty-era flags after Stripe says the session is paid. |
| `ENTITLEMENTS_DB` | KV purchase records still save. Tokens, if signed, cannot be refreshed into a new term. Config says storage is not set up. |
| `RESEND_API_KEY` or Turnstile | Restore says it is not available yet. The sentence does not depend on the email address. |
| `CODE_HASH_PEPPER` | Codes and restore stay closed. Owner test still compares its own secret. |

## Deferred

- Subscription grace, dunning, paused-as-locked, and refund revocation (Phase 3). The token already has `subs.state` of `active`, `grace`, or `locked`, plus `lock_at` and `ends_at`, but this phase only writes `active` for a paid Pro subscription.
- Server-enforced instructor seats and the 1-device seat cap (the constant is `DEVICES_PER_INSTRUCTOR_SEAT`). Pro's 5-device cap is a soft warning. "Sign out other devices" revokes other device rows so their next refresh fails.
- Server-served paid chunks (Phase 4).
- Stripe Tax.
- Moving free-code counters out of `CodeRedemptionDo`.
