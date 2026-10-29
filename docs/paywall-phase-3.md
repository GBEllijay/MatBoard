# Paywall phase 3

Failed payments, the 7-day grace, the lock screen, refunds of one-time purchases, and server-side instructor seats. Stripe products and prices are unchanged. Stripe Tax stays off. Unlock codes, Drive, and OneDrive are unchanged.

## What changed

- `invoice.payment_failed` sets `subscriptions.past_due_since` the first time a billing cycle fails. A later retry does not move that timestamp.
- `invoice.paid` clears `past_due_since` when Stripe shows the subscription `active` or `trialing`, and Pro opens again on the next token.
- Every subscription webhook fetches the subscription by id. The event id is stored in `stripe_events`. A replay does nothing. A late `invoice.paid` after cancellation does not restore Pro.
- Period end is read from `current_period_end` on the subscription when the account's pinned Stripe API version still sends it, and from the subscription item when it does not.
- Pro is recognized by this set of price ids: `price_1UPWlhARhGonKqrOttvZ4VNS` ($5.99/month), `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_MONTHLY_DISCOUNT` (the legacy $2.99 price), and `STRIPE_PRICE_PRO` (the one-time line). A subscription that is already stored stays Pro even if its price id is not in that set.
- Grace is 7 days from `past_due_since`. The token's `subs.lock_at` is that instant plus 7 days. `subs.state` is `active`, `grace`, or `locked`. `subs.ends_at` is the period end while a cancellation is scheduled.
- `paused`, `unpaid`, `canceled`, `incomplete`, and `incomplete_expired` are locked. Cancel-at-period-end stays open until the period end.
- The lock screen is `/pro/paused`. It offers Update payment, I've paid refresh, Restore, and Export my data. A seat sees "Ask your gym owner to check billing" and does not get the billing portal.
- `POST /api/billing/portal` opens the Stripe Customer Portal for the Pro token.
- Token refresh re-reads Stripe when the stored subscription is older than 24 hours, or when it is in grace or locked.
- A full `charge.refunded` or a `charge.dispute.closed` with status `lost` revokes that one-time grant. A partial refund does not. A Pro subscription grant is not revoked by those events.
- Instructor seats are rows in D1. An invite is signed. The cap is 10 open seats (pending or claimed). A seat follows the owner's payment status. The email is a label, not a login. One device can claim a seat. `POST /api/seats/reset` clears that device and signs a new invite.
- Seats already stored on a device can be registered with `POST /api/seats/sync`, using the existing invite token as the seat id. Unsigned seats keep working until `2026-12-28T00:00:00.000Z` (60 days after 2026-10-29) once the app has loaded `/api/config`. After that they need the registration.

Photos, logos, journals, Drive, and OneDrive keys are not deleted or rewritten by the lock screen, the export, or the seat registration.

## Owner setup

Do these for Production and Preview. Do not prefix them with `VITE_`. Do not commit the values.

1. Phase 2 must already be applied: D1 database `advantage-entitlements`, binding `ENTITLEMENTS_DB`, and `migrations/0001_entitlements.sql`.
2. Apply `migrations/0002_seats.sql` once. It only adds columns to `seats`. In the Cloudflare dashboard open Workers & Pages → D1 → `advantage-entitlements` → Console, paste the raw SQL below, and run it. Or from a machine that is logged into Wrangler:

```bash
npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0002_seats.sql
```

Raw SQL:

```sql
ALTER TABLE seats ADD COLUMN email_label TEXT;
ALTER TABLE seats ADD COLUMN invite_expires_at TEXT;
ALTER TABLE seats ADD COLUMN claimed_at TEXT;
ALTER TABLE seats ADD COLUMN legacy INTEGER NOT NULL DEFAULT 0;
ALTER TABLE seats ADD COLUMN sunset_at TEXT;
ALTER TABLE seats ADD COLUMN invite_nonce TEXT;
```

3. Stripe → Developers → Webhooks. Add these events to the existing endpoint if they are not already selected: `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Keep the events from Phase 1 and Phase 2.
4. Stripe → Settings → Billing → Customer portal. Allow updating the payment method and canceling at the end of the period. Leave plan switching off. Do not enable Stripe Tax.
5. Stripe → Settings → Billing → Revenue recovery. Keep Smart Retries. Set the end state after retries to mark the subscription unpaid, so paying the open invoice restores it. Turn on the customer email for a failed payment.
6. Optional `STRIPE_PRICE_PRO_MONTHLY_DISCOUNT` if you still have subscribers on the legacy $2.99 price. Checkout does not send this price. It is only used so those subscribers stay entitled.
7. Optional `SEAT_SUNSET_ENDS_AT` (ISO timestamp) if you want a different sunset than `2026-12-28T00:00:00.000Z`.
8. No new secret is required. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `ENTITLEMENT_SIGNING_KEY` are the ones this phase calls.

The dunning timeline in unit tests uses a clock. It does not call Stripe test clocks. To walk a live test clock, create one in the Stripe dashboard with the test secret and point a test subscription at `price_1UPWlhARhGonKqrOttvZ4VNS`. Do not put the secret in the repo.
