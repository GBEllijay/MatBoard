# Paywall phase 4

Pro Console, Media Console, Lesson Cloud, and Coach Unlimited are loaded as separate JavaScript chunks. A Pages Function releases a chunk only after it verifies the signed entitlement token and the grant for that screen. The rest of the app is unchanged. Unlock codes, Stripe, Drive, OneDrive, and the grant rules that issue tokens are unchanged.

No new secret. The Function uses `ENTITLEMENT_SIGNING_KEY` from Phase 2.

## What is protected

| Screen | Routes | Chunk |
|---|---|---|
| Pro Console | `/pro` | `pro-console` |
| Media Console | `/slideshow`, `/screensaver`, `/schedule`, and the folder redirects that land on the slideshow | `media-console` |
| Lesson Cloud | `/class-history` | `lesson-cloud` |
| Coach Unlimited | `/coach-unlimited`, `/coach-unlimited/academy`, `/review` | `coach-unlimited` |

`/media`, `/console`, and `/media-console` still redirect into the Pro hub. They do not carry their own chunk.

A patched client can still change a check inside a file it already has. It cannot download one of these chunks unless a valid token for that screen was presented to `GET /paid/*`. Modules the free screens also import stay in the public bundle.

## How a request is allowed

The browser asks for `/paid/<file>.js` with the token in the `Authorization: Bearer` header or the `advantage_paid` cookie (`Path=/paid`). The cookie exists so a normal `import()` can carry the token. The token is not accepted in the query string.

The Function verifies the ES256 signature with `ENTITLEMENT_SIGNING_KEY`. It then applies the same doors the app already uses:

- Pro, including a full owner code, opens all four while the subscription is `active` or `grace`.
- Grace stays open until `subs.lock_at`. Cancel-at-period-end stays open until `subs.ends_at`.
- `locked` closes Pro, Media Console, and Coach Unlimited for the owner. One-time White, Student, and Coach purchases do not open these screens.
- A seat follows the owner's Pro status. A Program Director seat (`program-director`) still receives Pro Console and Media Console when Pro is locked. A lesson seat (`coach`, `assistant-coach`) still receives Lesson Cloud when Pro is locked, and receives Coach Unlimited only while Pro is open. An `instructors` seat receives both of those.
- A seat token with no preset is a custom binder. The server never stored that binder's toggles, so the seat screens stay available. Named presets stay strict.
- The Function itself requires a token that is still inside `nbf` and `exp`. Offline grace is not applied here. After `exp`, an offline browser may open a copy it already saved. That is the client-side token check from decision D10.

Legacy flags still open the other doors until the amnesty date. These four screens need a token, because the server cannot see a local flag and a patched client could claim one. A reload checks the saved token before it decides. Until that check finishes, the screen stays on Loading. If the check finishes with no token during amnesty, it shows confirm-your-access, with Restore and Enter a code. After one confirmation the chunk loads, and later visits can be offline. An owner-test seat pass has no product door. It still receives a seat token for the instructors preview, so Media Console and Lesson Cloud load.

## Offline and lock

The service worker does not precache `/paid/**`. After an authorized response it stores the file in the `paid-chunks` cache. Accepting a token, including a refresh, prefetches every file that token may open.

`clearEntitlementToken` (revoked grant, signed-out device) deletes that cache. A locked token deletes it and then fetches again only the screens the seat may still open. Lock Pro on this browser deletes the cache too. Photos, journals, and Drive or OneDrive keys are not touched.

If the chunk cannot load, the screen shows a status line and three actions: Try again, Refresh access, and Restore access. It also links to Enter a code. The page is not left blank.

## Spike

Confirmed from the current Cloudflare Pages docs, from the unit tests, and from a local `wrangler pages dev dist` session against this build:

- `_routes.json` `include` lists `/paid/*`, so Pages invokes a Function for that path instead of serving the static file.
- `functions/paid/[[path]].ts` matches `/paid` and anything under it.
- `env.ASSETS.fetch` reads the built file. The handler calls it only after the signature and the grant succeed.
- On the local Pages server: no token returned `401 Access token required.` A Pro token returned `200` with `content-type: text/javascript` and the chunk source. A Coach-only token returned `403`. A locked Program Director seat token received the Media Console chunk and was refused Coach Unlimited and Lesson Cloud. The same Pro token in the `advantage_paid` cookie also received the file. `/paid/manifest.json` stayed `404`. `/` and `/assets/*` stayed public.
- The production build writes those chunks under `dist/paid/`. The precache list in `dist/sw.js` has no `paid/` URL, and the screen strings are absent from `dist/assets`. OneDrive sign-in stays in the public bundle.

This environment cannot publish the owner's Cloudflare project, so the production preview URL was not exercised here.

## Owner setup

Do these for Production and Preview. Do not prefix them with `VITE_`. Do not commit the values.

1. Phase 2 must already be applied: D1 database `advantage-entitlements`, binding `ENTITLEMENTS_DB`, and `ENTITLEMENT_SIGNING_KEY`. No new secret and no new migration.
2. Deploy this build as usual. `public/_routes.json` already includes `/paid/*`. Leave that path on the Function. Do not add `/paid/*` to an exclude list.
3. Cloudflare dashboard → Workers & Pages → this project → Settings → Runtime → Fail open / closed. Set **Fail closed** for Production and Preview. Fail open would serve the files in `dist/paid/` as static assets when the daily Functions allowance runs out, which skips the token check. Fail closed returns an error instead. The app then shows the "could not be loaded" screen, with Try again and Restore.
4. Nothing to change in Stripe, the webhook, the Customer Portal, or the unlock codes.
