# Student API and automatic history — Phase 3

## Files changed

- `src/lib/management-validation.ts`: optional profile fields, expanded statuses,
  strict operation-intent object, date/email/URL/field validation.
- `src/lib/student-history.ts`: server-only select, mapping, actor recheck,
  meaningful-change detection and transactional history append helpers.
- `src/app/api/students/route.ts`: additive GET fields and transactional ADMISSION.
- `src/app/api/students/[id]/route.ts`: compatible PUT with history and no-op detection.
- `src/app/api/students/[id]/history/route.ts`: new read-only history endpoint.
- `tests/tenant-security.test.mjs`: transactional mocked history and authorization tests.
- `tests/management-ui.test.mjs`: phone fixtures aligned with the existing Indian
  mobile validation rule; no Teacher application behavior changed.
- `docs/student-history-phase-3.md`: this report.

## Input/output compatibility

Existing required name, internal classId, guardian name/phone and status rules
remain. Create defaults status to ACTIVE; update requires status. The existing
guardianEmail omission-clears behavior is retained.

Optional additions: firstName, middleName, lastName, gender, dateOfBirth,
bloodGroup, imageUrl, admissionDate, rollNumber, academicYear, guardianRelation,
alternateGuardianPhone, addressLine1, addressLine2, city, state, pincode, country.
Omitted new fields are preserved on PUT. Null clears them; optional free-text/date/
alternate-phone fields also accept empty strings as null. Gender and bloodGroup
use explicit enum values or null. Dates accept real YYYY-MM-DD calendar days,
persist at UTC midnight and return YYYY-MM-DD or null.

Image URLs must be HTTPS without credentials; no image is fetched by these APIs.
Academic years must be consecutive YYYY-YYYY values. Phone validation remains the
existing Indian mobile rule. No fields are backfilled or inferred from names.
New statuses are GRADUATED, SUSPENDED and TRANSFERRED.

Responses retain `{ students: [...] }` and `{ student: ... }`, with additive
profile fields and the same related class projection. Existing public IDs stay
immutable and globally allocated. Unknown top-level fields are stripped as
before; schoolId, createdById, raw history and snapshots cannot override server
values. Submitted id/studentId are rejected.

## Explicit operation intent

PUT may include:

```json
{
  "operation": {
    "type": "PROMOTION",
    "fromClassId": "current-internal-class-id"
  }
}
```

This accompanies the normal full PUT payload. Types are PROMOTION, SECTION_CHANGE
or TRANSFER. POST does not accept operation intent. The server checks the source
against the stored Student, the destination against the active School, capacity,
and OWNER/ADMIN authority. PROMOTION/SECTION_CHANGE require different classes and
cannot simultaneously graduate or transfer the student.

The schema has no authoritative grade/section ordering metadata. An authorized
administrator's explicit intent attests the academic meaning; the server verifies
the actual scoped transition, but cannot independently prove grade advancement
or same-grade section membership. Names/codes are never parsed to infer it.
Without explicit intent, a changed class produces CLASS_CHANGED.

TRANSFER requires a new transition to TRANSFERRED. When classId remains unchanged,
the event has a null destination class; Student keeps its required classId.
This is not a cross-school record move and does not free capacity automatically.
A plain status change to TRANSFERRED without intent produces STATUS_CHANGE.

## Atomic history

- New student: ADMISSION.
- Changed class: explicit PROMOTION/SECTION_CHANGE, otherwise CLASS_CHANGED.
- Changed status: STATUS_CHANGE (explicit transfer records TRANSFER instead).
- Other meaningful field changes: PROFILE_UPDATED.
- Combined changes may create multiple entries in the same transaction.
- Unchanged normalized PUT: returns existing Student, no update or history.

Clerk identity is resolved by the existing access wrapper to internal User.id.
Active same-school membership, active school and OWNER/ADMIN role are checked
again inside the transaction. The mutation and all events use the same
Serializable transaction; existing capacity checks, allocation retries and
unique-conflict protections remain. A history failure aborts the Student write;
a serialization retry does not retain events from the failed attempt.

Snapshots use verified database Student/Class records before and after mutation.
History academicYear is the persisted Student academicYear, possibly null; no
default current year is fabricated. Description lists changed field names without
copying sensitive old/new profile values. Titles, actor, type and timestamps are
server-controlled. No history update/delete endpoint is exposed.

Existing Student DELETE protection remains: history or attendance FK conflicts
return 409. Newly admitted students have history, so hard deletion is consequently
restricted by the already-migrated schema.

## Read-only history

`GET /api/students/[internal-id]/history?limit=20&cursor=<history-id>`

- Requires the existing management-read permission and verified School context.
- Default limit 20; allowed range 1–100.
- Response: `{ history: [...], limit: 20, nextCursor: string | null }`.
- Ordered `createdAt DESC, id DESC`; cursor is validated within the same
  School and Student. Keyset pagination uses a RepeatableRead transaction.
- Missing/foreign Student: 404. Invalid pagination/foreign cursor: 400.
- Auth: existing 401/403. Temporary database failures: safe 503; unexpected: 500.
- Responses are dynamic and no-store. No Clerk or membership profile is included.

## Verification

Passed:

```sh
npx tsc --noEmit
npx eslint src/lib/management-validation.ts src/lib/student-history.ts src/app/api/students/route.ts src/app/api/students/[id]/route.ts src/app/api/students/[id]/history/route.ts tests/tenant-security.test.mjs tests/management-ui.test.mjs
node --test --test-reporter=spec tests/tenant-security.test.mjs tests/management-ui.test.mjs
```

68 tests passed. The harness loads actual handlers/helpers with real Zod, mocked
Clerk/Prisma and in-memory transaction snapshots. No live database calls occur.
Coverage includes authorization and foreign IDs, actor revocation, profile
validation, old payloads, dates, clearing, no-op writes, all requested events,
multiple events, rollback on later history failure, retry, capacity, immutable
IDs/snapshots, safe errors and cursor isolation.

Existing tests had US phone examples incompatible with the current workspace's
Indian-mobile validation. Only test fixtures were corrected; the phone rule and
Teacher APIs were not changed. A rollback-test snapshot aliasing issue was fixed.
Final checks pass. No production build or live browser/Neon CRUD was attempted.

## Deferred work

Student UI and Attendance UI/client status guards still support only ACTIVE and
INACTIVE. The API is ready for expanded statuses, but those clients must be
updated in the next phase before using expanded statuses in the existing UI.
Attendance roster and capacity semantics have not been changed.

No automatic history for legacy records, independent remarks/fees endpoints,
login linkage, cross-school transfer, grade metadata, request idempotency keys or
database-level append-only triggers are introduced. Retry atomicity is tested
with mocks, not a live PostgreSQL concurrency run.

No schema, migration, seed, environment, credentials or UI files were modified.
No database reset, write, delete, backfill, commit or push was executed.
