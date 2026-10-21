# Development seed

Use only a development database. Explicitly set `SEED_SCHOOL_ID` to an existing
active development School ID in the command environment (no default is used).
Never run this script against production. Then run `npm run db:seed` from the project
root. Prisma 7 reads `migrations.seed` in `prisma7.config.ts` and runs
`jiti prisma/seed.ts`. Jiti is a pinned development dependency for executing
the TypeScript seed and generated client. No seed runs automatically.

If a restricted Windows environment blocks Prisma's child-process launch with
`spawn EPERM`, run the exact same seed directly from the project root:
`node node_modules/jiti/lib/jiti-cli.mjs prisma/seed.ts`. This uses the same
installed runner, environment loading, transaction and verification checks.

The Node-only script loads the private root `.env` and connects using
`DATABASE_URL` through the existing Neon adapter. It refuses to run with
`NODE_ENV=production`. Use only a development database.

The source is `src/lib/demo.ts`, imported without modifying that file:

- Classes: demo ID becomes unique `code`; other fields are preserved.
- Students: demo ID becomes unique `studentId`; guardian and email map to
  `guardianName` and `guardianEmail`; class codes resolve to database IDs;
  Active/Inactive maps to ACTIVE/INACTIVE.
- Teachers: demo ID becomes unique `teacherId`; details are preserved and
  each teacher is assigned to the demo class through `classTeacherId`.
- Notices: titles, bodies and audiences are preserved; dates use midnight UTC.
  School-namespaced stable primary keys identify seed notices; legacy seed IDs
  are reused only when they already belong to the selected school.

`DEMO-GUARDIAN-SD001` and `DEMO-TEACHER-T01` (and corresponding IDs) are
intentionally non-dialable, development-only phone placeholders, not contact
numbers. Never use them for messaging or production records.

Writes run in one transaction using upserts on the unique keys above. Reruns
restore seed-owned records to demo values without duplicating them. They do
not delete other records. Conflicting unique teacher assignments/emails cause
the write transaction to roll back rather than removing existing assignments.
Attendance and AttendanceRecord are only counted, never written.

All upserts, class assignments and verification queries are scoped to
`SEED_SCHOOL_ID`. Global fixture ID/code/email conflicts with another school
abort the transaction instead of reassigning any records.

After committing, the script reads selected-school counts and expects Classes=4,
Students=12, Teachers=4, Notices=3, Attendance=0, AttendanceRecords=0. If other
records already exist, it reports the counts and exits unsuccessfully without
deleting them. Console output never includes credentials or raw driver errors.
The script also reads each demo class's teacher relation and checks its
`teacherId` against `initialTeachers` before reporting success.

Prisma configuration reference:
https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference#migrationsseed
