# Advantage Cloud: approve, then display

One lane model for class photos and daily videos (`src/lib/approvalLanes.ts`).

```
upload ──► pending ──► approved   shown in Gallery, on the TV, in daily videos
                  └──► rejected   deleted from Advantage Cloud
```

* **Who lands where.** Owner uploads are approved. Coach, Instructors, and program
  director seats land in pending while the license approval switch
  (`gallery_approval`, Gallery approval switch) is on, which is the default.
  With the switch off, seat uploads are approved as sent.
* **Who decides.** The owner or an Instructors seat, in Review Inbox.

## Class photos (`gallery/`)

Layout: `gallery/{pending|approved|rejected}/{date}/{file}`. Approve copies
pending → approved, then deletes pending. Reject deletes the pending file
instead of parking a hidden copy in `rejected/`. Files over 16 MB copy in 8 MB ranged parts
into a multipart upload (`copyGymObject`), so a big clip never sits in Worker memory.
Leftover files already in `rejected/` can be removed with Delete or cleanup.

## Daily videos (`videos/daily/`)

The video stays at `videos/daily/{date}/{file}`: the only copy, never moved.
The lane is a tiny marker the server writes beside it:

* `pending/daily/pending/{date}/{file}`: written by `start` before any bytes.
* No marker: approved. Every daily video uploaded before lanes has no marker,
  so it keeps showing.
* Older rejected videos may still have a `pending/daily/rejected/{date}/{file}`
  marker beside a kept copy. Cleanup and Delete remove those leftovers.

Approve deletes the pending marker (no bytes copied). Reject deletes the video
and its pending marker, after a confirm in Review Inbox. Markers are built only on the
server; `cloudObjectKey` refuses them, so a browser cannot write one with `op=put`.
A seat's `op=put` / `complete` for a daily key is refused unless `start` left the
pending marker, and a pending upload may not reuse a name that is already showing.

Lists of daily videos return approved rows only. Approvers can add `lanes=all`.
`op=file` on a pending or rejected daily video is 404 for anyone but an approver.

## API

* `GET op=list&purpose=approved-media`: approved gallery + approved daily videos, all days.
* `GET op=list&purpose=daily-review`: pending daily videos (approvers only).
* `POST {action: 'daily-approve' | 'daily-reject', key}`. Reject deletes the video.
* `POST {action: 'gallery-approve' | 'gallery-reject', key}`. Reject deletes the pending file.
* `POST {action: 'delete-media', keys}` (or `key`): delete approved or leftover photos and
  videos. Owner or Instructors only. Up to 100 paths per request. Each path stays under
  `groups/{licenseId}/`; markers and gallery sibling copies are removed with it. The
  response includes updated `licenseUsedBytes` / `bucketUsedBytes`.
* `GET op=list&purpose=old-videos&days=30|60|90|180`: videos whose class date is on or
  before today minus that many days (UTC calendar date). Default is 90. Includes already
  rejected videos, skips pending Review Inbox rows and still photos. At most 200 rows,
  with `count`, `totalBytes`, and `truncated` when more remain.
* `op=file` serves approved gallery paths to any Cloud reader, including the program
  director's camera window.

## Delete and cleanup

The Advantage Cloud gallery and the daily-video list have a Delete button on each photo
and video, for the owner or an Instructors seat. Every delete asks for confirm first.

A "Clean up old videos" section lists videos older than 30, 60, 90, or 180 days
(default 90), shows the count and total size, and deletes the listed batch after
confirm. After any delete, the storage line and the gallery list refresh.

## Google Drive / OneDrive

`ApprovalLaneStore` is the plug-in point. `folderLanePath` documents the folder layout
(`gallery/{lane}/{date}`, `videos/daily-{lane}/{date}` beside `videos/daily/{date}`);
deciding is a parent-folder move. `folderLaneStoreStub` is the placeholder until built.
