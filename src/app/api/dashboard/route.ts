import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import { getPrisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
// Preserve the Dashboard's sample-day semantics until a separate date-policy change.
const attendanceDate = '2026-09-22';

export async function GET(request: Request) {
  return withSchoolAccess(request, 'read', async ({ schoolId }) => {
    try {
      const prisma = getPrisma();
      const [
        total,
        active,
        inactive,
        teachers,
        classes,
        notices,
        enrolment,
        directory,
        recorded,
        board,
      ] = await prisma.$transaction(
        [
          prisma.student.count({ where: { schoolId } }),
          prisma.student.count({ where: { schoolId, status: 'ACTIVE' } }),
          prisma.student.count({ where: { schoolId, status: 'INACTIVE' } }),
          prisma.teacher.count({ where: { schoolId } }),
          prisma.class.count({ where: { schoolId } }),
          prisma.notice.count({ where: { schoolId } }),
          prisma.class.findMany({
            where: { schoolId },
            orderBy: { code: 'asc' },
            select: {
              id: true,
              code: true,
              name: true,
              _count: { select: { students: { where: { schoolId, status: 'ACTIVE' } } } },
            },
          }),
          prisma.student.findMany({
            where: { schoolId, class: { schoolId } },
            orderBy: { studentId: 'asc' },
            take: 4,
            select: {
              id: true,
              studentId: true,
              name: true,
              status: true,
              class: { select: { name: true } },
            },
          }),
          // Count each currently active student once for the displayed date,
          // even if their current class differs from the saved session's class.
          prisma.$queryRaw<{ count: number }[]>`
            SELECT COUNT(*)::int AS count FROM "Student" s
            WHERE s."schoolId" = ${schoolId} AND s."status" = 'ACTIVE' AND EXISTS (
              SELECT 1 FROM "AttendanceRecord" r
              JOIN "Attendance" a ON a."id" = r."attendanceId"
              WHERE r."studentId" = s."id"
                AND a."schoolId" = ${schoolId}
                AND a."date" = CAST(${attendanceDate} AS date)
            )
          `,
          prisma.notice.findMany({
            where: { schoolId },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
            take: 2,
            select: {
              id: true,
              title: true,
              body: true,
              audience: true,
              date: true,
            },
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
      );

      return Response.json(
        {
          students: { total, active, inactive },
          teachers: { total: teachers },
          classes: { total: classes },
          notices: { total: notices },
          enrolment: {
            activeStudents: active,
            sections: classes,
            classes: enrolment.map(({ _count, ...group }) => ({
              ...group,
              activeStudentCount: _count.students,
            })),
          },
          studentDirectory: directory.map(({ class: group, ...student }) => ({
            ...student,
            className: group.name,
          })),
          attendance: {
            date: attendanceDate,
            totalActiveStudents: active,
            recordedActiveStudents: recorded[0]?.count ?? 0,
          },
          noticeBoard: board.map((notice) => ({
            ...notice,
            date: notice.date.toISOString().slice(0, 10),
          })),
        },
        { status: 200, headers }
      );
    } catch (error) {
      const databaseError = databaseFailure(error);
      if (databaseError) return databaseError;
      console.error('GET /api/dashboard failed.');
      return Response.json(
        { error: 'Unable to load dashboard. Please try again later.' },
        { status: 500, headers }
      );
    }
  });
}
