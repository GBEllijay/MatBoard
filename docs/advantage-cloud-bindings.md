# Advantage Cloud bindings

The app keeps working when these are missing. Gallery playback then uses Google Drive, OneDrive, or the phone.

Do not create a second D1 database. Seats and licenses already use `advantage-entitlements`, bound as `ENTITLEMENTS_DB`.

## Dashboard steps

1. Cloudflare dashboard → R2 → Create bucket. Name: `advantage-gym-media`. Leave it private. Do not turn on public access or an r2.dev URL.
2. Workers & Pages → the Advantage Pages project → Settings → Bindings → Add → R2 bucket. Variable name: `GYM_MEDIA`. Bucket: `advantage-gym-media`.
3. D1 → `advantage-entitlements` is already the entitlements database. Apply `migrations/0003_pro_bundle.sql` when that file is on main (`npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0003_pro_bundle.sql`). Do not create a new database.
4. Confirm the existing D1 binding name is `ENTITLEMENTS_DB`.

`wrangler.toml` in this repo names the R2 binding. It does not contain the D1 database id. Copy that id from the existing D1 database if you add this project to Wrangler locally.

Daily videos and lesson-plan media upload through `/api/gym/cloud`. The browser does not get a public bucket URL. Set these Pages variables if you want a cap other than the default:

- `GYM_MEDIA_CAP_BYTES` — total bytes in the bucket before an upload is refused. Default `8000000000` (8 GB).
- `GYM_MEDIA_MAX_UPLOAD_BYTES` — largest one file. Default `512000000` (512 MB).

Videos larger than 8 MB are sent in parts. Each part except the last is 8 MB.

No Stripe product, price, or coupon is created here.

## Student inbox

Rank updates use the same private `GYM_MEDIA` bucket. The object key is `groups/<license>/students/<studentId>/inbox/<updateId>.json`. `GET /api/gym/inbox?probe=1` returns unbound when the bucket is missing, and the coach saves a file instead. Only the gym owner, or a Coach or Instructors seat, can write. A student inbox code can read and clear only that student's folder.

## Gallery photos and clips

Class photos and short clips use the same private `GYM_MEDIA` bucket. The object key is:

`groups/<license>/gallery/<lane>/<YYYY-MM-DD>/<file>`

- `<lane>` is `pending`, `approved`, or `rejected` (`GALLERY_KEY` in `src/lib/advantageCloudMedia.ts`).
- The server picks the lane on upload by role, not by the switch on a device (`galleryUploadLane`). The gym owner's uploads go to `approved`. Coach and Instructors seat uploads go to `pending`. Assistant coach and program director seats do not upload class photos.
- Approve or reject (`POST /api/gym/cloud`, `gallery-approve` / `gallery-reject`, in `src/server/gymCloud.ts`) copies the file from `pending` to `approved` or `rejected` under the same date and name, then deletes the `pending` copy. Only the owner or an Instructors seat can decide (`galleryDecisionAllowed`).
- The slideshow and Media Console play only `approved`.
- Review Inbox (`/review`) lists `pending` in the gallery review queue (`src/components/GalleryReviewQueue.tsx`). The owner's Gallery approval section on `/pro-plus-cloud` links there as "Pending photos (N)".
- The "Require approval" switch is saved per device (`matboard.gym.galleryApproval.v1`). It decides the lane only for the phone and Google Drive/OneDrive gallery. For an Advantage Pro Plus Cloud owner who never saved a choice, it starts on. A saved choice, on or off, is kept.
- Tests: `src/server/gymCloudGallery.test.ts`. There is no separate `gymCloudGallery` server module. The handler lives in `src/server/gymCloud.ts`.

## Safety steps for the owner

1. Turn on Cloudflare's CSAM Scanning Tool for the zone `advantagebjjtimer.com`. Gallery images are served from `/api/gym/media` on that zone, not from a public bucket URL.
2. Set the Cloudflare account abuse contact to a monitored address. Cloudflare expects a reply to abuse reports within 24 hours.
3. The in-app report address is `advantageappllc@gmail.com`.
4. Have an attorney review `docs/legal/plus-cloud-terms-DRAFT.md` before Cloud launch. The file is marked for attorney review.
5. DMCA designated agent: registered with the US Copyright Office on 2026-11-02. Renew by 2029-11-02.
