# Sprint 01 implementation and verification

## Implemented

The Server Component resolves one active school through Clerk and the existing
membership helper. Signed-out visitors redirect to `/sign-in`. Missing, inactive,
ambiguous (multiple) memberships, and non-management roles fail closed. No school
is hardcoded or selected arbitrarily. A school-keyed client tree resets workspace
state if the server-selected context changes.

Every existing method on Dashboard, Students, Classes, Teachers, Attendance and
Notices uses the same access boundary before reading input or academic records.
Clients pass the verified page context explicitly in `X-School-Id`; the API treats
that header only as a selector and verifies Clerk identity, membership, active
school, and role independently on each request. Request-body roles and school IDs
cannot change the server's verified scope.

Server policy:

| Operation | Roles |
| --- | --- |
| Management reads and Dashboard | OWNER, ADMIN, TEACHER, ACCOUNTANT, STAFF |
| Create, update, delete and attendance save | OWNER, ADMIN |
| Student/parent self-service | Not implemented; no management access |

School predicates apply to entity reads, updates, deletes, class/teacher choices,
relationship counts, Dashboard aggregates, and attendance session/roster access.
Foreign resource IDs and class/teacher references return 404 without disclosing
other-school records. Class capacity checks and serializable transaction retries
remain. Existing saved attendance rosters remain authoritative, with additional
same-school integrity checks. Optional class teacher projections remain nullable.

Successful response shapes remain unchanged. Safe access errors use 400/401/403;
missing resources use 404; capacity, uniqueness, related records and exhausted
serialization conflicts use 409; recognized connection/session failures use 503;
unexpected failures use generic 500. Responses are no-store. Cross-origin browser
mutations are rejected. No new dynamic GET methods were added where none existed.

The Students form still displays class names/codes, maps choices to internal
Class IDs, includes zero-student classes, and preserves search, pagination,
filtering, status mapping, error feedback and add/edit/delete flows.

The development seed now requires an explicit `SEED_SCHOOL_ID` referencing an
active school. Scoped upserts cannot transfer fixtures from another school;
global uniqueness conflicts roll back instead. Verification counts are scoped
to the selected school. The seed was NOT executed.

## Exact project files changed in this task

Existing files modified:

- `prisma/seed.ts`
- `prisma/SEED.md`
- `src/app/page.tsx`
- `src/app/api/dashboard/route.ts`
- `src/app/api/students/route.ts`
- `src/app/api/students/[id]/route.ts`
- `src/app/api/classes/route.ts`
- `src/app/api/classes/[id]/route.ts`
- `src/app/api/teachers/route.ts`
- `src/app/api/teachers/[id]/route.ts`
- `src/app/api/attendance/route.ts`
- `src/app/api/notices/route.ts`
- `src/app/api/notices/[id]/route.ts`
- `src/components/schooldesk-client.tsx`
- `src/components/dashboard-workspace.tsx`
- `src/components/students-workspace.tsx`
- `src/components/classes-workspace.tsx`
- `src/components/teachers-workspace.tsx`
- `src/components/attendance-workspace.tsx`
- `src/components/attendance.tsx`
- `src/components/notices-workspace.tsx`
- `src/lib/dashboard-client.ts`
- `src/lib/students-client.ts`
- `src/lib/classes-client.ts`
- `src/lib/teachers-client.ts`
- `src/lib/attendance-client.ts`
- `src/lib/notices-client.ts`

New files:

- `src/lib/school-api.ts`
- `src/lib/school-policy.ts`
- `src/lib/school-fetch.ts`
- `tests/tenant-security.test.mjs`
- `docs/sprint-01.md`

The pre-existing changes to package files, schema, migrations, layout, auth
helpers, proxy and sign-in/user-sync files were preserved, not authored by this
task. No dependency installation, environment/config changes, generated Prisma
edits, commits or pushes were made. Temporary editing scripts outside the project
were removed.

## Validation

- `npx tsc --noEmit`: PASS. All ten previously reported TypeScript errors are
  resolved, with no type suppression or Prisma type weakening.
- Targeted ESLint: PASS (command below). An initial test-harness variable-name
  lint error was corrected before the passing run.
- `node --test tests/tenant-security.test.mjs`: PASS, 38 tests. Also repeated with
  `node --test --test-reporter=dot tests/tenant-security.test.mjs`.
- No pre-existing automated test suite or test script was found in the project.
  The new tests use installed TypeScript and Node's built-in test runner; no
  testing dependencies were added.
- `npm run build`: BLOCKED before compilation while loading `next.config.ts`.
  Windows SWC could not canonicalize the project base directory: `Access is
  denied. (os error 5)`. This environment failure does not establish a successful
  production build. Re-run the command in the normal local terminal.
- `git diff --check`: found pre-existing trailing whitespace in the untouched
  schema. Whitespace introduced in two client files was corrected.

Targeted lint command (run from the project root):

```sh
npx eslint src/app/api/students src/app/api/classes src/app/api/teachers src/app/api/attendance src/app/api/notices src/app/api/dashboard src/app/page.tsx src/components/schooldesk-client.tsx src/components/students-workspace.tsx src/components/classes-workspace.tsx src/components/teachers-workspace.tsx src/components/attendance-workspace.tsx src/components/attendance.tsx src/components/notices-workspace.tsx src/components/dashboard-workspace.tsx src/lib/students-client.ts src/lib/classes-client.ts src/lib/teachers-client.ts src/lib/attendance-client.ts src/lib/notices-client.ts src/lib/dashboard-client.ts src/lib/school-api.ts src/lib/school-policy.ts src/lib/school-fetch.ts prisma/seed.ts tests/tenant-security.test.mjs
```

Tests execute actual route/helper/client source in an allowlisted VM with mocked
Clerk and Prisma. No real database/provider modules, environment or network are
available. Tests cover authentication, inactive/missing membership and schools,
wrong school IDs, role restrictions, foreign resource IDs/assignments, global ID
allocation, student-ID preservation, transaction retries, capacity/relationship
conflicts, Dashboard scoping, historical-roster integrity and client headers.
These are not real PostgreSQL concurrency or browser end-to-end tests.

## Remaining limitations and browser verification

- Existing schema uniqueness remains global for studentId, teacherId, class code
  and teacher email. Student/teacher allocation therefore reads only a global
  numeric maximum inside the existing serializable transaction; record queries
  are school-scoped. The maximum is not returned as an API field. Independent
  school numbering or reuse of class codes/emails needs a separately reviewed
  schema/migration change. None was made here.
- No school switcher is introduced. The home page safely rejects multiple active
  memberships; API requests with an explicit school still verify that membership.
- Management mutations are deliberately OWNER/ADMIN-only. Read-only management
  roles may still see existing edit controls, but the server rejects their writes.
  More granular staff/teacher workflows need an explicit product permission policy.
- The existing Dashboard attendance date (2026-09-22) and session label remain
  unchanged. This sprint does not invent a new date policy or redesign the UI.
- No live endpoints or browser flows were tested, and no production records were
  created, modified or deleted. No migrations, resets or seeds were run.

Next: run `npm run dev`, open the displayed local URL signed out and verify the
sign-in redirect. Sign in with the existing OWNER account, then verify Dashboard,
Students and class choices load; check search, filters, pagination and refresh.
In DevTools, confirm the requests include `X-School-Id` and respond with no-store.
Test creation, edits, deletion, additional roles and multiple schools only against
an isolated non-production test database. Run `npm run build` locally before
deployment; the sandbox build did not complete.
