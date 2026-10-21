# Student photo backend — Phase 5, Step 2

Step 3 now connects the picker and Profile Save; see student-photo-integration.md.
No live Cloudinary/Neon calls were made during implementation or testing.

## API contract

All operations use `/api/students/[internal-id]/photo` and `X-School-Id`.
The header is only a selector: Clerk identity, active membership, active School,
role and the Student's school/class ownership are verified server-side.

- GET: existing management readers may read. Managed photos return WebP bytes,
  `Cache-Control: private, no-store`, `nosniff` and an ETag. No Cloudinary signed
  URL is returned to the browser. Missing photos return 404 with an ETag, allowing
  an initial upload. Missing/foreign students return 404 without a photo version.
  `?metadata=1` returns `{ photo: { imageUrl, version } }` under the same access
  checks, including when imageUrl is null. Browser clients use this mode to obtain
  versions without following opaque legacy redirects or downloading image bytes.
- PUT: OWNER/ADMIN only. Send raw image bytes (not multipart or JSON), the image
  Content-Type and `If-Match` containing the current ETag. JPEG, PNG and WebP are
  accepted up to 2,097,152 bytes. The actual format must match the MIME type;
  decode must succeed; animation, dimensions above 4096 on either axis and more
  than 16 million pixels are rejected. Images are rotated, reduced to fit 1600
  pixels, stripped of metadata and re-encoded as WebP before uploading.
- DELETE: OWNER/ADMIN only, `If-Match` required, no request body. Clears only this
  student's photo. Repeated removal of an already empty photo creates no history.

Successful mutations return 200:

```json
{
  "photo": { "imageUrl": "server-generated managed reference or null", "version": "quoted ETag" },
  "cleanupPending": false
}
```

Errors: 400 malformed/corrupt images or invalid dimensions, 401 unauthenticated,
403 inaccessible school/role/origin, 404 absent student/photo, 409 concurrent
change, 413 oversized image, 415 unsupported media type, 428 missing If-Match,
503 storage/database unavailable, generic 500 unexpected failure.

Existing HTTPS photos are unchanged. Authorized photo GET returns a 307 redirect
to their legacy URL; it never fetches arbitrary URLs server-side. Such legacy
external photos retain their existing external host's access policy. Follow-up
UI integration obtains the version via metadata without following this redirect. Missing
or invalid managed references never fall back to external URLs.

## Storage and consistency

Uses the existing `getCloudinary()` helper and its three server-only environment
variables. Cloudinary uploads use `resource_type: image`, `type: authenticated`,
`overwrite: false` and UUID public IDs under a hash of school/student identity.
`Student.imageUrl` stores a `cld-auth:v1:` managed reference, never an expiring
URL. The existing profile schema rejects forged managed references; ordinary
Student PUT cannot clear or replace a managed photo. Omitted imageUrl continues
to preserve the current value. Legacy HTTPS input remains supported.

Each photo change and PROFILE_UPDATED history event commit in the same
serializable Prisma transaction. Membership is rechecked within it. Version
checks occur before upload and again within the transaction. Retries do not
re-upload. Storage calls do not hold database transactions open.

Old files are deleted only after DB success. Known rollback cleans up the new
file. Remote deletion retries three times. Failed cleanup returns
`cleanupPending: true` after a successful mutation and emits a structured
`student-photo-reconciliation-required` log with only the generated public ID.
Upload timeout or uncertain commit emits the same reconciliation log; it does
not guess whether an asset is active and delete it unsafely.

## Operational limitation and reconciliation

Cloudinary and Neon do not share a transaction. Process termination, upload
timeout, lost commit acknowledgement and repeated remote failures can leave
unreferenced private assets. There is no new durable job table or automatic
cleanup worker in this step. Preserve reconciliation logs in deployment logging.

For a separately approved maintenance task: inspect assets tagged
`schooldesk-student-photo-v1`, allow a conservative age/grace period for in-flight
requests, and compare their exact managed references with current Student rows.
Never remove referenced assets. If the database cannot be checked, do nothing.
Only delete verified unreferenced authenticated image assets; retain an audit
record and recheck before deletion. This procedure has NOT been run.

## Validation and scope

Mocked Clerk/Prisma/Cloudinary tests exercise the real handlers and real Sharp
image decoding. They cover tenant/role checks, content/size/dimensions, upload,
delivery, replacement/removal, stale versions, rollback, cleanup failures,
serialization retry and uncertain commit acknowledgement. Network access is
forbidden by the test harness.

`sharp` 0.35.5 was already installed transitively through Next.js and is now
declared directly, with the existing locked artifact retained. No migration,
schema/environment edit is included. The Step 3 UI loads authenticated photo
bytes via school-scoped fetch and displays a local object URL; managed references
are never used directly as image URLs.
