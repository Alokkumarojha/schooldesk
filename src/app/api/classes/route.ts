import { classCreateSchema, validationFields } from '@/lib/management-validation';
import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import { getPrisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

class ClassRequestError extends Error {
  constructor(message: string, readonly status: 404 | 409) { super(message); }
}

export async function POST(request: Request) {
  return withSchoolAccess(request, 'manage', async ({ schoolId }) => {
    let body: unknown;
    try { body = await request.json(); } catch {
      return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers });
    }
    const parsed = classCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid class input.', fields: validationFields(parsed.error) }, { status: 400, headers });
    }
    const { code, name, room, capacity, classTeacherId } = parsed.data;

    try {
      const prisma = getPrisma();
      for (let attempt = 0; ; attempt++) {
        try {
          const record = await prisma.$transaction(async tx => {
            if (await tx.class.findUnique({ where: { code, schoolId }, select: { id: true } })) {
              throw new ClassRequestError('A class with this code already exists.', 409);
            }
            if (classTeacherId) {
              const teacher = await tx.teacher.findUnique({ where: { id: classTeacherId, schoolId }, select: { class: { where: { schoolId }, select: { id: true } } } });
              if (!teacher) throw new ClassRequestError('Teacher not found.', 404);
              if (teacher.class) throw new ClassRequestError('This teacher is already assigned to another class.', 409);
            }
            return tx.class.create({
              data: { schoolId, code, name, room, capacity, classTeacherId },
              select: {
                id: true, code: true, name: true, room: true, capacity: true,
                classTeacher: { where: { schoolId }, select: { id: true, teacherId: true, name: true, subject: true, email: true, phone: true } },
                _count: { select: { students: { where: { schoolId } } } },
              },
            });
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
          const { _count, ...group } = record;
          return Response.json({ class: { ...group, studentCount: _count.students } }, { status: 201, headers });
        } catch (error) {
          // Recheck existence and availability after concurrent writes.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 4) continue;
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof ClassRequestError) return Response.json({ error: error.message }, { status: error.status, headers });
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002' || error.code === 'P2034') {
          return Response.json({ error: 'The class code or teacher assignment conflicts with another class. Refresh and try again.' }, { status: 409, headers });
        }
        if (error.code === 'P2003' && classTeacherId) {
          return Response.json({ error: 'Teacher is no longer available.' }, { status: 404, headers });
        }
      }
      const databaseError = databaseFailure(error);
      if (databaseError) return databaseError;
      console.error('POST /api/classes failed.');
      return Response.json({ error: 'Unable to create class. Please try again later.' }, { status: 500, headers });
    }
  });
}

export async function GET(request: Request) {
  return withSchoolAccess(request, 'read', async ({ schoolId }) => {
    try {
      const records = await getPrisma().class.findMany({
        where: { schoolId },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          room: true,
          capacity: true,
          classTeacher: { where: { schoolId },
            select: { id: true, teacherId: true, name: true, subject: true, email: true, phone: true },
          },
          _count: { select: { students: { where: { schoolId } } } },
        },
      });
      const classes = records.map(({ _count, ...group }) => ({
        ...group,
        studentCount: _count.students,
      }));
      return Response.json({ classes }, { status: 200, headers });
    } catch (error) {
      // Raw Prisma/driver errors may contain private connection details.
      const databaseError = databaseFailure(error);
      if (databaseError) return databaseError;
      console.error('GET /api/classes failed.');
      return Response.json(
        { error: 'Unable to load classes. Please try again later.' },
        { status: 500, headers },
      );
    }
  });
}
