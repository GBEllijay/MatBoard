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
