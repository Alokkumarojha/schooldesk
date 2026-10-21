import { teacherCreateSchema, validationFields } from '@/lib/management-validation';
import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import { getPrisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

class TeacherConflict extends Error {
  constructor(message: string, readonly status: 404 | 409) { super(message); }
}

export async function POST(request: Request) {
  return withSchoolAccess(request, 'manage', async ({ schoolId }) => {
    let body: unknown;
    try { body = await request.json(); } catch {
      return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers });
    }
    const parsed = teacherCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid teacher input.', fields: validationFields(parsed.error) }, { status: 400, headers });
    }
    const { name, subject, email, phone, classId } = parsed.data;

    try {
      const prisma = getPrisma();
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const record = await prisma.$transaction(async tx => {
            const existing = await tx.teacher.findFirst({ where: { schoolId, email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
            if (existing) throw new TeacherConflict('A teacher with this email already exists.', 409);
            if (classId) {
              const group = await tx.class.findUnique({ where: { id: classId, schoolId }, select: { classTeacherId: true } });
              if (!group) throw new TeacherConflict('Class not found.', 404);
              if (group.classTeacherId) throw new TeacherConflict('This class already has a class teacher.', 409);
            }
            // Public IDs are globally unique in the existing schema. Only the
            // numeric allocation watermark is global; all record access is scoped.
            const [allocation] = await tx.$queryRaw<{ highest: string }[]>`
              SELECT COALESCE(MAX(SUBSTRING("teacherId" FROM 2)::numeric), 0)::text AS highest
              FROM "Teacher" WHERE "teacherId" ~ '^T[0-9]+$'
            `;
            const highest = BigInt(allocation.highest);
            const teacher = await tx.teacher.create({ data: {
              teacherId: `T${(highest + BigInt(1)).toString().padStart(2, '0')}`,
              schoolId, name, subject, email, phone,
            } });
            if (classId) {
              // Claim only an unassigned class; never overwrite another teacher.
              const claim = await tx.class.updateMany({ where: { id: classId, schoolId, classTeacherId: null }, data: { classTeacherId: teacher.id } });
              if (claim.count !== 1) throw new TeacherConflict('This class already has a class teacher.', 409);
            }
            return tx.teacher.findUniqueOrThrow({ where: { id: teacher.id, schoolId }, select: {
              id: true, teacherId: true, name: true, subject: true, email: true, phone: true,
              class: { where: { schoolId }, select: { id: true, code: true, name: true, room: true, capacity: true } },
            } });
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
          const { class: classTeacherOf, ...teacher } = record;
          return Response.json({ teacher: { ...teacher, classTeacherOf } }, { status: 201, headers });
        } catch (error) {
          // Re-read IDs and conflicts after a concurrent transaction/unique collision.
          if (error instanceof Prisma.PrismaClientKnownRequestError &&
            (error.code === 'P2002' || error.code === 'P2034') && attempt < 4) continue;
          throw error;
        }
      }
      throw new Error('Teacher allocation retries exhausted.');
    } catch (error) {
      if (error instanceof TeacherConflict) return Response.json({ error: error.message }, { status: error.status, headers });
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) return Response.json({ error: 'The email, identifier or class assignment conflicts with another record. Refresh and try again.' }, { status: 409, headers });
      const databaseError = databaseFailure(error);
      if (databaseError) return databaseError;
      console.error('POST /api/teachers failed.');
      return Response.json({ error: 'Unable to create teacher. Please try again later.' }, { status: 500, headers });
    }
  });
}

export async function GET(request: Request) {
  return withSchoolAccess(request, 'read', async ({ schoolId }) => {
    try {
      const records = await getPrisma().teacher.findMany({
        where: { schoolId },
        orderBy: { teacherId: 'asc' },
        select: {
          id: true,
          teacherId: true,
          name: true,
          subject: true,
          email: true,
          phone: true,
          class: {
            where: { schoolId }, select: { id: true, code: true, name: true, room: true, capacity: true },
          },
        },
      });
      const teachers = records.map(({ class: classTeacherOf, ...teacher }) => ({
        ...teacher,
        classTeacherOf,
      }));
      return Response.json({ teachers }, { status: 200, headers });
    } catch (error) {
      // Raw Prisma/driver errors may contain private connection details.
      const databaseError = databaseFailure(error);
      if (databaseError) return databaseError;
      console.error('GET /api/teachers failed.');
      return Response.json(
        { error: 'Unable to load teachers. Please try again later.' },
        { status: 500, headers },
      );
    }
  });
}
