# Advantage Cloud: approve, then display

One lane model for class photos and daily videos (`src/lib/approvalLanes.ts`).

```
upload ──► pending ──► approved   shown in Gallery, on the TV, in daily videos
                  └──► rejected   kept, never shown
```

* **Who lands where.** Owner uploads are approved. Coach, Instructors, and program
  director seats land in pending while the license approval switch
  (`gallery_approval`, Gallery approval switch) is on, which is the default.
  With the switch off, seat uploads are approved as sent.
* **Who decides.** The owner or an Instructors seat, in Review Inbox.

## Class photos (`gallery/`)

Unchanged layout: `gallery/{pending|approved|rejected}/{date}/{file}`. Approve copies
pending → approved, then deletes pending. Files over 16 MB copy in 8 MB ranged parts
into a multipart upload (`copyGymObject`), so a big clip never sits in Worker memory.

## Daily videos (`videos/daily/`)

The video stays at `videos/daily/{date}/{file}`: the only copy, never moved.
The lane is a tiny marker the server writes beside it:

* `pending/daily/pending/{date}/{file}`: written by `start` before any bytes.
* `pending/daily/rejected/{date}/{file}`: written by Reject.
* No marker: approved. Every daily video uploaded before lanes has no marker,
  so it keeps showing.

Approve deletes the pending marker (no bytes copied). Markers are built only on the
server; `cloudObjectKey` refuses them, so a browser cannot write one with `op=put`.
A seat's `op=put` / `complete` for a daily key is refused unless `start` left the
pending marker, and a pending upload may not reuse a name that is already showing.

Lists of daily videos return approved rows only. Approvers can add `lanes=all`.
`op=file` on a pending or rejected daily video is 404 for anyone but an approver.

## API

* `GET op=list&purpose=approved-media`: approved gallery + approved daily videos, all days.
* `GET op=list&purpose=daily-review`: pending daily videos (approvers only).
* `POST {action: 'daily-approve' | 'daily-reject', key}`.
* `op=file` serves approved gallery paths to any Cloud reader, including the program
  director's camera window.

## Google Drive / OneDrive

`ApprovalLaneStore` is the plug-in point. `folderLanePath` documents the folder layout
(`gallery/{lane}/{date}`, `videos/daily-{lane}/{date}` beside `videos/daily/{date}`);
deciding is a parent-folder move. `folderLaneStoreStub` is the placeholder until built.
