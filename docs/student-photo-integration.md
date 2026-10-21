# Phase 5 Step 3 — photo integration

Choose/replace/remove/reset now participate in Save Profile. The picker passes
the actual File or a remove intent; no blob URL enters a request payload.
The ordinary Student PUT always omits imageUrl. Zod validation and class checks
still precede saving. Conflicting actions are disabled during a save.

The existing photo GET gains an authorized `?metadata=1` mode returning the
reference and version without a redirect or Cloudinary download. This is needed
because browser manual redirects conceal ETag headers on legacy image responses.
Managed display uses GET with school headers, checks the returned ETag and WebP
type, then creates a revocable object URL. Legacy HTTPS photos keep their existing
external access policy. No private Cloudinary URL or credential is exposed.

Save order: profile details, then photo PUT/DELETE. PUT carries the selected File
as raw bytes, its Content-Type and If-Match. DELETE has If-Match and no body.
The form closes only after both operations are confirmed. The confirmed photo
reference updates the profile. Cleanup-pending success is shown separately.

On photo failure, saved details are reported explicitly, fields and selection
remain available, and retry skips an identical already-confirmed profile PUT.
Editing those fields causes a new validated profile PUT. Conflicts, permission
changes and uncertain network/server outcomes require reviewing current photo
state before retry. Review preserves the local selection and shows the current
saved photo separately. Reset abandons only the photo intent. Closing cannot undo
already-saved details; the parent reloads server state on close.

Limits: profile and photo saves are separate requests, not one atomic transaction.
An uncertain response may mean the operation committed; reviewing server state is
required. No automatic photo overwrite/retry occurs after a version conflict.
Cloudinary cleanup reconciliation remains as documented in student-photo-backend.md.

## Manual verification (approved test student only)

1. Sign in as OWNER/ADMIN. Students → View profile → Edit profile. Confirm the
   existing photo (legacy or managed) loads and other profile fields still edit.
2. Choose a JPEG, PNG or WebP <=2 MB. Check preview. Reset: saved photo returns
   and no photo request is made. Choose again, Save Profile, then refresh the page.
3. Replace the photo. Verify the replacement after refresh. Remove and save;
   refresh and confirm initials/no photo. Cancel before saving must preserve it.
4. Use a file >2 MB or unsupported type: expect local validation. A corrupt image
   with a supported MIME type must be rejected by the existing server validation.
5. In browser request blocking, block photo PUT while allowing Student PUT.
   Save a field and photo together: expect partial-success text, an open dialog
   and retained selection. Unblock, Review current photo, then Save Profile.
6. Open two edit dialogs in separate tabs. Save a photo in one, then save the
   stale photo in the other. Expect a conflict and explicit review before retry.
7. With a read-only role, verify no Edit action; direct mutations remain denied.
8. Check phone-sized layout, keyboard controls, disabled controls during saving,
   preview/reset/removal and image-load retry. History should show profile changes.

No live uploads/deletions or database writes were performed during implementation.
Browser persistence/visual checks are manual; automated tests use mocked requests.

## Files changed in Step 3

- src/components/student-photo-picker.tsx
- src/components/student-profile-form.tsx
- src/components/student-profile-page.tsx
- src/components/use-student-photo.ts (new)
- src/lib/student-profile-client.ts
- src/lib/student-photo-client.ts (new)
- src/app/api/students/[id]/photo/route.ts
- tests/student-photo-picker.test.mjs
- tests/tenant-security.test.mjs
- tests/student-photo-client.test.mjs (new)
- tests/student-photo-delivery.test.mjs (new)
- docs/student-photo-backend.md
- docs/student-photo-integration.md (new)

Validation: npx tsc --noEmit passed; targeted ESLint passed; all 107 Node tests
passed; git diff --check passed (only Windows line-ending conversion notices).
