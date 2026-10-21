# Student Profile Phase 4

Implemented: `/students/[id]`, school-verified profile GET, profile view/edit,
directory link, expanded status compatibility, paginated history and limited
creator display. Existing PUT remains authoritative for validation, capacity,
authorization and transactional automatic history.

## Deliberately incomplete: remark persistence

The remark form is a local draft with saving disabled. Nothing is saved.
The POST remarks preflight validates payloads and active school access, checks
the student in the same school, and returns 501 for valid OWNER/ADMIN requests.
Teachers and other roles receive 403. There is no history write path.

The current schema cannot persist a category. Proposed future schema addition,
requiring review and a separate migration:

```prisma
enum RemarkCategory {
  POSITIVE
  NEEDS_IMPROVEMENT
  GENERAL
}

// Add to StudentHistory:
// remarkCategory RemarkCategory?
```

Keep this nullable for existing events; require it in the server service for
ACADEMIC_REMARK only. Do not backfill guessed categories or encode them in text.

Teacher has no verified link to the authenticated User/SchoolMember. Before
enabling TEACHER writes, approve an explicit nullable same-school Teacher-to-
SchoolMember composite relation using schoolId and User.id, with school/user
uniqueness and an authorized linking workflow. Do not infer identity from email,
name, client teacherId, or the TEACHER role alone.

After those approvals: implement transactional remark writes using the verified
actor and student/class snapshots, recheck assignment inside the transaction,
add durable idempotency for repeated submissions, enable saving and refresh the
timeline after success. Positive teacher-assignment and persistence tests remain
blocked until these prerequisites exist.

Creator name and role displayed by history are current membership metadata;
the original class, status and student snapshots remain immutable. Creator
email, phone and Clerk ID are not returned.

## Changed files for this phase

- `src/app/students/[id]/page.tsx`
- `src/app/api/students/[id]/route.ts` (GET added; PUT/DELETE unchanged)
- `src/app/api/students/[id]/history/route.ts`
- `src/app/api/students/[id]/remarks/route.ts`
- `src/components/student-profile-page.tsx`
- `src/components/student-profile-form.tsx`
- `src/components/student-history-timeline.tsx`
- `src/components/management.tsx`
- `src/components/record-form.tsx`
- `src/components/students-workspace.tsx`
- `src/components/ui.tsx`
- `src/lib/student-profile-client.ts`
- `src/lib/student-profile-fields.ts`
- `src/lib/student-remarks.ts`
- `src/lib/student-status.ts`
- `src/lib/students-client.ts`
- `src/lib/attendance-client.ts` (accept expanded status values only)
- `src/lib/demo.ts` (Student status type only; demo data unchanged)
- `src/app/globals.css`
- `tests/tenant-security.test.mjs`
- `tests/management-ui.test.mjs`
- `docs/student-profile-phase4.md`

## Browser review

1. Sign in; open Students → View profile. Check name, admission number, class,
   status, initials/photo and account/school navigation.
2. Check all five tabs on a phone-sized viewport and desktop. Use Tab and arrow
   keys in the tab list. Check long values wrap.
3. OWNER/ADMIN: open Edit profile, inspect all fields, test invalid values, then
   cancel. Any save changes real data; use an approved test student if testing
   persistence. Other read roles must not see Edit.
4. History: inspect snapshots/actor, empty state and Load older events when
   enough records exist. Retry failures after restoring connectivity.
5. Add Remark opens the draft and explains why saving is unavailable. Cancel
   asks to discard changed text. No remark can be persisted in this phase.

Automated tests use mocked Clerk/Prisma/fetch and do not contact Neon. Live
browser editing and visual device testing have not been performed.
