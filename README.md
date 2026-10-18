# SchoolDesk

First interactive design implementation for a single-school management application. **This is a frontend preview, not a production school information system.** All people and records are synthetic. Data exists in React memory and resets on refresh. Do not enter real student data.

## Implemented

- Responsive admin workspace with six sections and hash navigation.
- Dashboard statistics calculated from the current preview records.
- Student create/edit, active/inactive status, guardian details, search, class/status filtering and pagination.
- Teacher create/edit, search, subject and class assignment, duplicate-email validation.
- Class rosters and capacity checks when adding or moving active students.
- Attendance by class and date: present/absent/late, bulk present, completeness validation, save/discard. Drafts survive navigation between sections within the loaded page.
- Notices: create, edit, audience filter, confirmation before removal.
- Native accessible dialogs, keyboard focus indicators, toast feedback, empty states and sample-data disclosure.
- Read-only WebMCP summary with input validation.

## Run locally

Use Node.js 22 LTS or a currently supported compatible runtime.

```sh
npm ci
npm run dev
```

Open the local URL printed by Next.js. The preview needs no database, API keys or account.

```sh
npm run typecheck
npm run build
```

The current build uses Next.js static export (`out/`). It must be served through an HTTP server; opening index.html directly is not supported. `next start` does not serve static export output. The development command remains `npm run dev`.

Next.js 16.3.6 and the compatible React versions provided by its official starter are pinned in package-lock.json. Tailwind CSS 4 and TypeScript 5 are installed. Next uses its programmatic TypeScript API and worker threads to support the constrained build environment; type checking remains enabled.

## Prisma + Neon preparation (Phase 2)

Prisma 7.10.0 and its matching Neon adapter are pinned. The schema contains only
the PostgreSQL datasource and client generator: no school models or migrations.
The frontend still uses the same synthetic records and static export.

1. In Neon, create or select a project and a development branch/database.
2. Copy `.env.example` to `.env` in this directory (beside `package.json`).
3. In Neon's **Connect** dialog, choose that branch, database and role. Put the
   pooled connection string in `DATABASE_URL`; turn pooling off and put the
   direct connection string in `DIRECT_URL`. Keep the provided SSL parameters.
4. Keep `.env` private. It is ignored by Git. Do not use `NEXT_PUBLIC_` names for
   either connection string. Deployment secrets will be configured separately.

The Prisma CLI loads `.env` through dotenv; Next.js loads it automatically.
Use `.env` for these two variables so both tools see the same configuration.
`prisma7.config.ts` uses `DIRECT_URL` for future CLI database operations.
`src/lib/prisma.ts` provides a lazy, server-only `getPrisma()` singleton using
`DATABASE_URL`. Nothing in the demo frontend imports or calls it.

`npm ci` generates the client via `postinstall`. You can also run
`npm run db:generate` explicitly, including after the schema is reviewed and
changed. Client generation requires no credentials and makes no database
connection. Generated files under `src/generated/prisma` are ignored by Git
and ESLint. The schema and configuration remain the source of truth.

Do not run `prisma migrate`, `prisma db push`, or introspection yet. The schema
will be designed and reviewed separately. Initialization and local checks do
not verify a live Neon connection. No authentication or APIs are implemented.

References: [Prisma 7 configuration](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference)
and [PostgreSQL / Neon adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql).

## Production work still required

The agreed production stack is Next.js, Better Auth, PostgreSQL and Prisma. Prisma tooling is prepared, but **database models, a live database connection, Better Auth, server-side authorization, persistent APIs, audit logging, backups and monitoring are not implemented in this preview.** No fake login form or client-side role switch is presented as security.

Before real use:

1. Configure Neon and review the database schema before the first migration. Verify authentication adapter compatibility when that phase starts.
2. Change from static export to server deployment. Keep the current synthetic preview isolated from production.
3. Add Better Auth with admin-created accounts, public signup disabled, secure sessions, reset-email delivery, login throttling and MFA for administrators.
4. Implement server-checked membership and record scope on every read/write. A teacher may only update assigned classes; a parent may only read linked students. Client navigation is not authorization.
5. Add academic-session-aware enrolments, guardian links, teacher assignments and attendance with unique constraints. Attendance should reference the enrolment and date, preserving historical records when classes change.
6. Provide versioned APIs for future Android clients. Validate input server-side; use transactions, optimistic concurrency where needed, and audit writes.
7. Add migration checks, authorization regression tests, integration tests, backup/restore verification, monitoring, staging and production release controls.

Fees, exams, report cards, student/parent dashboards and notifications are later phases. Notices in this preview do not send emails or notifications.

## Verification

- TypeScript check and Next.js production build passed.
- Browser checks: dashboard render; add a synthetic student; search for that student; student count update; attendance bulk marking, an individual absence and saving the correct totals.
- WebMCP valid summary and invalid-input rejection verified in browser.
- Responsive CSS is included; full mobile-device/accessibility testing and remaining CRUD regression coverage are still pending.

## Source

- `src/app/page.tsx`: workspace and preview state.
- `src/components/management.tsx`: forms, directories, class cards, attendance and notices.
- `src/lib/demo.ts`: typed synthetic fixtures.
- `src/app/globals.css`: theme and responsive layouts.
- `.openai/hosting.json`: private preview Site identity; never contains credentials.
