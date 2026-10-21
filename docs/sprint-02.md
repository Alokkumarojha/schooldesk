# Sprint 02 — School Settings and existing-school onboarding

The resumed implementation retained the existing working-tree changes. Inspection
covered the Settings API, shared Zod schemas, client, workspace, server identity,
page props, navigation, Dashboard labels, styling, dependency lock and tests.
No schema changes were needed: School already supports all requested fields,
including phone and email. The resumed pass tightened phone validation to require
at least six digits, added security regression tests, and completed this report.

## Behavior

- Settings is available at `/#settings` in desktop and mobile navigation.
- GET/PATCH `/api/school/settings` verify Clerk identity and active school
  membership using the existing access wrapper. `X-School-Id` is an untrusted
  selector; membership verification determines the permitted target. URL and
  body school IDs cannot override it.
- OWNER/ADMIN can edit. Existing management readers (TEACHER, STAFF, ACCOUNTANT)
  can view but cannot save. STUDENT/PARENT management access remains denied.
- PATCH rechecks active membership, school status and OWNER/ADMIN role in the
  atomic update predicate. It accepts only name, code, logoUrl, addressLine, city,
  state, pincode, board, academicYear, phone and email. Other fields are rejected.
- Zod trims text, validates enums/lengths/email/phone/HTTPS logo URLs and rejects
  mass assignment. Optional empty strings become null. Name cannot be cleared.
  Academic years use consecutive four-digit years, such as `2026-2027`.
- Only changed fields are submitted. Loading, saving, field errors, retry,
  duplicate-code conflicts, success feedback and discard are implemented.
  Unsaved drafts survive workspace switches; reload warns about unsaved changes.
- The onboarding checklist reflects saved identity, academics, contact and
  address fields. Logo is optional. Continue setup focuses the next incomplete
  field. No new School or membership is created.
- Dashboard, page-header and desktop/mobile navigation session labels use the
  persisted academicYear. Missing values show `Not configured`. Successful saves
  update the visible school name/session immediately; reload obtains server data.
  Attendance dates, historical records and existing module API contracts are
  unchanged. Clerk account identity and Sign Out remain in the shared navbar.

## Sprint 02 file scope

Existing files updated during Sprint 02:

- `package.json`
- `package-lock.json`
- `src/app/page.tsx`
- `src/app/globals.css`
- `src/lib/dashboard-identity.ts`
- `src/lib/demo.ts` (navigation section only; demo records unchanged)
- `src/components/schooldesk-client.tsx`
- `src/components/navigation.tsx`
- `src/components/dashboard.tsx`
- `src/components/dashboard-workspace.tsx`
- `src/components/icon.tsx`
- `tests/tenant-security.test.mjs`

New Sprint 02 files:

- `src/app/api/school/settings/route.ts`
- `src/lib/school-settings.ts`
- `src/lib/school-settings-client.ts`
- `src/components/school-settings-workspace.tsx`
- `docs/sprint-02.md`

The broader Git status also contains changes from earlier tasks; they were not
rewritten. This resumed pass changed only the shared settings phone validator,
the test file and this report. Zod 4.6.7 was already installed in the preceding
Sprint 02 work with lifecycle scripts disabled; no dependency reinstall occurred.

## Validation

Run from the SchoolDesk project root:

```sh
npx tsc --noEmit
npx eslint src/app/page.tsx src/app/api/school/settings/route.ts src/lib/school-settings.ts src/lib/school-settings-client.ts src/lib/dashboard-identity.ts src/lib/demo.ts src/components/schooldesk-client.tsx src/components/school-settings-workspace.tsx src/components/dashboard.tsx src/components/dashboard-workspace.tsx src/components/navigation.tsx src/components/icon.tsx tests/tenant-security.test.mjs
node --test --test-reporter=spec tests/tenant-security.test.mjs
npm run build
```

TypeScript and targeted ESLint passed (exit code 0). The complete mocked suite passed: 52 tests, including all
existing module security tests. Settings coverage includes unauthenticated,
inactive/missing memberships, wrong schools, role restrictions, GET/PATCH scoping,
all supported fields, invalid and malformed bodies, unknown fields, mass
assignment, academic-year validation, optional clearing, duplicate codes,
provider errors, cross-origin requests, client school-ID mismatch and onboarding.
Mocks execute actual source with real Zod and no live Clerk/Prisma/network access.

Build remains blocked before compilation: Windows SWC fails to canonicalize
`jsc.baseUrl` while loading `next.config.ts`, reporting `Access is denied.
(os error 5)`. This is an environment-specific failure, not a successful build.
Re-run locally before deployment. Browser interactions and live database writes
were not tested in this task.

## Browser verification

1. Run `npm run dev` and open the displayed local URL. Signed-out access should
   redirect to Clerk sign-in. Sign in as the existing OWNER.
2. Open Settings (`/#settings`). Verify the active school's saved values, loading
   behavior, checklist, contact fields and optional logo. Confirm the sidebar and
   Dashboard show the persisted academic year or `Not configured`.
3. At desktop, tablet and mobile widths, check the form, navigation drawer and
   Clerk avatar menu. Check keyboard focus and Continue setup links.
4. Against an isolated test database only, edit a name and academic year, save,
   verify the sidebar/Dashboard update, then reload to confirm persistence.
5. In that test environment, try blank name, malformed email, `1-----` phone,
   invalid year (`2026-2028`) and an HTTP logo URL. Expect field errors and no
   saved invalid values. Test Discard and drafts across workspace switches.
6. With an existing authorized read-only test account, verify fields are read-only
   and no Save control appears. Do not create or alter production memberships for
   this test. Security denial paths are already covered by mocks.
7. Navigate through Dashboard, Students, Teachers, Classes, Attendance and Notices;
   confirm existing reads and Clerk Sign Out. Run `npm run build` in the normal
   local terminal before deployment.

## Limitations / next milestone

Logo input is an HTTPS URL, not an upload service. Checklist completion is derived
from profile fields and is not a separate persisted onboarding flag. Concurrent
edits of the same field are last-write-wins; partial PATCH avoids overwriting
unmodified fields. No live browser persistence or real database concurrency test
was performed under the production-write restriction.

New-school creation, invitations and public registration are intentionally absent.
A future milestone must define who can provision a school, ownership assignment,
duplicate prevention and invitation acceptance rules before adding endpoints.
No fallback school, automatic OWNER grant or membership creation is implemented.

No production records, schema, migrations, seeds, environment files, credentials
or generated Prisma files were modified. No reset, migration, seed, commit or push
was executed.
