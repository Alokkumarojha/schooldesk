# Sprint 03 — shared validation and management UX

Implemented against the existing working tree. Earlier Sprint 01/02 changes were retained.
No packages, schema, migrations, seeds, environment files or production records were changed.
No live database calls or CRUD tests were executed. No commit or push was performed.

## Files changed in this sprint

- `src/lib/management-validation.ts` (new)
- `src/lib/teachers-client.ts`
- `src/app/api/students/route.ts`
- `src/app/api/students/[id]/route.ts`
- `src/app/api/teachers/route.ts`
- `src/app/api/teachers/[id]/route.ts`
- `src/app/api/classes/route.ts`
- `src/app/api/classes/[id]/route.ts`
- `src/components/record-form.tsx`
- `src/components/class-form.tsx`
- `src/components/management.tsx`
- `src/app/globals.css`
- `tests/tenant-security.test.mjs`
- `tests/management-ui.test.mjs` (new)
- `docs/sprint-03.md` (new)

## Validation audit and implementation

POST and PUT previously repeated handwritten checks. Forms also had different
minimum name/subject lengths. Shared browser-safe Zod schemas now validate both
server requests and form feedback. Server validation remains authoritative.

- Names/guardian names: trimmed, required, max 80. Teacher subject: max 100.
- Emails: trimmed, max 160, existing reasonable email pattern retained; Teacher
  email is lowercased. Optional guardian email accepts omitted/null/blank and
  clears to null. Student status defaults ACTIVE only on create; PUT requires it.
- Phones: strings, max 40, optional leading +, digits/spaces/parentheses/hyphens,
  minimum six digits. No invented phone values or automatic repairs.
- Class: code max 40, name max 100, room max 80; capacity must be a JSON number,
  integer 1–1000. Only the HTML number field is converted to a number by the form.
- Optional teacher/class assignments accept omission/null. Nonempty references
  are trimmed and limited to 128 characters, then verified against the school.
- Submitted internal/public IDs are rejected. Other unknown fields are stripped,
  preserving the existing allowlisted API behavior. School/role input cannot
  override verified server context. Error envelopes remain `{error, fields}`.

Database checks remain in the original transactions: duplicate email/code,
assignment availability, class capacity, same-class seat retention, membership,
school isolation and OWNER/ADMIN write policy. Forms retain class availability,
duplicate-email feedback and full-class checks; Class edit additionally reports
capacity below current enrolment before submitting.

## UX

Teacher phone was already stored and editable; the row mapper now carries it to
cards. Cards display stored numbers and show Call only for a validated dial URI.
Missing/invalid numbers have no Call action. No external calling service is used.

Existing Class roster navigation already switches to Students using the class
code and increments its revision to reset the destination filter. That flow and
refresh behavior were retained. The Students panel now names the selected class,
shows the matching count and offers Clear class filter without clearing search
or status. Reset filters still clears everything. Roster buttons have explicit
class-specific accessible names and respect disabled state. Call/roster/clear
actions have 44px minimum height; long card text and filter summaries wrap.

## IDs and future schema work

Existing Student SD001 and Teacher T01 formats remain unchanged. Creation reads
the highest valid numeric suffix globally inside a Serializable transaction,
increments with BigInt, and retries unique/write conflicts up to five attempts.
Unique database constraints remain the final guard. Retry exhaustion now returns
a safe 409 instead of a generic 500. Existing IDs are never updated.

Current schema makes public IDs globally unique, not per-school. Class code and
Teacher email are also globally unique. Tenant-specific uniqueness would require
a separately reviewed migration to compound unique constraints and query changes.
MAX-based allocation scans records and can reuse a removed highest ID; a durable
sequence/counter would require a future reviewed migration if non-reuse or higher
write throughput becomes necessary. No such schema change was needed here.

## Validation results

- `npx tsc --noEmit`: passed.
- Targeted ESLint below: passed after renaming a test-local variable prohibited
  by Next's lint rule.
- `node --test --test-reporter=spec tests/tenant-security.test.mjs tests/management-ui.test.mjs`:
  57 tests passed. Actual source is evaluated with mocked Clerk/Prisma/hooks and
  real Zod; tests cannot access Neon. Tests cover invalid create/update inputs,
  normalization, optional fields, ID collisions/retry exhaustion, unauthorized
  writes, inactive membership, cross-school references, capacity protections,
  Call links and roster selection/clearing. UI tests exercise component callbacks
  and rendered JSX trees, not a real browser or dialer.
- `npm run build`: blocked before compilation by Windows SWC resolving
  `jsc.baseUrl`: `Access is denied (os error 5)` while loading `next.config.ts`.
  Production build must be rerun in the normal local environment before deployment.

```sh
npx eslint src/lib/management-validation.ts src/lib/teachers-client.ts src/app/api/students/route.ts src/app/api/students/[id]/route.ts src/app/api/teachers/route.ts src/app/api/teachers/[id]/route.ts src/app/api/classes/route.ts src/app/api/classes/[id]/route.ts src/components/record-form.tsx src/components/class-form.tsx src/components/management.tsx tests/tenant-security.test.mjs tests/management-ui.test.mjs
```

## Exact browser verification

1. Run `npm run dev`, open the displayed localhost URL, sign in and select Classes.
2. Tab to View class roster and press Enter. Confirm Students opens with the
   correct class name/count. Repeat using touch at a narrow mobile width.
3. Search and change status, then Clear class filter: search/status should remain.
   Reset filters should restore all students. Check pagination and repeat roster
   navigation for another class; revisit modules to verify refresh behavior.
4. Open Teachers. Confirm saved phone values appear; a valid Call action should
   open the device's dialer prompt (do not place a test call). Missing/invalid
   numbers must have no Call action. Check long text and keyboard focus.
5. Open Add/Edit dialogs without saving production changes. Try blank names,
   invalid emails, `1-----` as phone, and decimal/zero class capacity. Expect
   field feedback and focus on the first error. Cancel/discard afterward.
6. In an isolated test database only, create/edit records with valid inputs,
   refresh and confirm phone/details persist and IDs remain unchanged on edit.
   Check optional email clearing, unassigned teachers, full classes and duplicate
   conflicts. Do not modify production records for this verification.

Live browser/device and persistence testing remains outstanding. Legacy phone
placeholders that do not meet the new validation must be replaced with a genuine
number before saving edits; this sprint does not alter those records. Phone
validation checks safe syntax, not phone ownership or country-specific validity.
