# Advantage Cloud bindings

The app keeps working when these are missing. Gallery playback then uses Google Drive, OneDrive, or the phone.

Do not create a second D1 database. Seats and licenses already use `advantage-entitlements`, bound as `ENTITLEMENTS_DB`.

## Dashboard steps

1. Cloudflare dashboard → R2 → Create bucket. Name: `advantage-gym-media`. Leave it private. Do not turn on public access or an r2.dev URL.
2. Workers & Pages → the Advantage Pages project → Settings → Bindings → Add → R2 bucket. Variable name: `GYM_MEDIA`. Bucket: `advantage-gym-media`.
3. D1 → `advantage-entitlements` is already the entitlements database. Apply `migrations/0003_pro_bundle.sql` when that file is on main (`npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0003_pro_bundle.sql`). Do not create a new database.
4. Confirm the existing D1 binding name is `ENTITLEMENTS_DB`.

`wrangler.toml` in this repo names the R2 binding. It does not contain the D1 database id. Copy that id from the existing D1 database if you add this project to Wrangler locally.

No Stripe product, price, or coupon is created here.

## Safety steps for the owner

1. Turn on Cloudflare's CSAM Scanning Tool for the zone `advantagebjjtimer.com`. Gallery images are served from `/api/gym/media` on that zone, not from a public bucket URL.
2. Set the Cloudflare account abuse contact to a monitored address. Cloudflare expects a reply to abuse reports within 24 hours.
3. The in-app report address is `advantageappllc@gmail.com`.
4. Have an attorney review `docs/legal/plus-cloud-terms-DRAFT.md` before Cloud launch. The file is marked for attorney review.
5. Register a DMCA designated agent with the US Copyright Office.
