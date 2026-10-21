import { studentCreateSchema, validationFields } from '@/lib/management-validation';
import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import { getPrisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { AccessError } from '@/lib/auth';
import { appendStudentHistory, studentMutationData, studentResponse, studentSelect, verifyHistoryActor } from '@/lib/student-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
class CapacityConflict extends Error {}

export async function GET(request: Request) {
  return withSchoolAccess(request, 'read', async ({ schoolId }) => {
    try {
      const students = await getPrisma().student.findMany({
        where: { schoolId, class: { schoolId } },
        orderBy: { studentId: 'asc' },
        select: studentSelect,
      });

      return Response.json({ students: students.map(studentResponse) }, { status: 200, headers });
    } catch (error) {
      // Do not log raw Prisma/driver errors: they may contain connection details.
      const databaseError = databaseFailure(error);
      if (databaseError) return databaseError;
      console.error('GET /api/students failed.');
      return Response.json(
        { error: 'Unable to load students. Please try again later.' },
        { status: 500, headers },
      );
    }
  });
}

export async function POST(request: Request) {
  return withSchoolAccess(request, 'manage', async (access) => {
    const { schoolId } = access;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers });
    }
    const parsed = studentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid student input.', fields: validationFields(parsed.error) }, { status: 400, headers });
    }
    const { classId } = parsed.data;
    const data = studentMutationData(parsed.data);

    try {
      const prisma = getPrisma();
      // Retry concurrent allocations; the unique studentId constraint is the
      // final safeguard. Every attempt re-reads the maximum inside a transaction.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const student = await prisma.$transaction(async tx => {
            await verifyHistoryActor(tx, access);
            const group = await tx.class.findUnique({ where: { id: classId, schoolId }, select: { capacity: true } });
            if (!group) return null;
            // All assigned students consume a seat, regardless of status. The
            // serializable transaction retries concurrent admissions/capacity changes.
            const assigned = await tx.student.count({ where: { classId, schoolId } });
            if (assigned >= group.capacity) throw new CapacityConflict();

            // Public IDs are globally unique in the existing schema. Only the
            // numeric allocation watermark is global; all record access is scoped.
            const [allocation] = await tx.$queryRaw<{ highest: string }[]>`
              SELECT COALESCE(MAX(SUBSTRING("studentId" FROM 3)::numeric), 0)::text AS highest
              FROM "Student" WHERE "studentId" ~ '^SD[0-9]+$'
            `;
            const highest = BigInt(allocation.highest);
            const studentId = `SD${(highest + BigInt(1)).toString().padStart(3, '0')}`;

            const created = await tx.student.create({
              data: { ...data, schoolId, studentId },
              select: studentSelect,
            });
            await appendStudentHistory(tx, access, null, created, ['ADMISSION']);
            return created;
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

          return student
            ? Response.json({ student: studentResponse(student) }, { status: 201, headers })
            : Response.json({ error: 'Class not found.' }, { status: 404, headers });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError &&
            (error.code === 'P2002' || error.code === 'P2034') && attempt < 4) continue;
          throw error;
        }
      }
      throw new Error('Student ID allocation retries exhausted.');
    } catch (error) {
      if (error instanceof AccessError) throw error;
      if (error instanceof CapacityConflict) return Response.json({ error: 'The selected class has reached its capacity. Choose another class.', code: 'CLASS_CAPACITY_EXCEEDED' }, { status: 409, headers });
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) return Response.json({ error: 'Student information changed concurrently. Refresh and try again.' }, { status: 409, headers });
      const databaseError = databaseFailure(error);
      if (databaseError) return databaseError;
      console.error('POST /api/students failed.');
      return Response.json(
        { error: 'Unable to create student. Please try again later.' },
        { status: 500, headers },
      );
    }
  });
}
