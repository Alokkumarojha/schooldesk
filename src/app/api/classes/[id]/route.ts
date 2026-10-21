import { classUpdateSchema, validationFields } from '@/lib/management-validation';
import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import { getPrisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'no-store' };
class ClassRequestError extends Error {
  constructor(message: string, readonly status: 404 | 409) { super(message); }
}

async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getPrisma().$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 4) continue;
      throw error;
    }
  }
}

function failure(error: unknown, action: 'update' | 'delete') {
  if (error instanceof ClassRequestError) return Response.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') return Response.json({ error: 'Class not found.' }, { status: 404, headers });
    if (error.code === 'P2003' && action === 'update') return Response.json({ error: 'Teacher is no longer available.' }, { status: 404, headers });
    if (['P2002', 'P2003', 'P2034'].includes(error.code)) {
      return Response.json({ error: 'This change conflicts with an existing class code, teacher assignment, or related record. Refresh and try again.' }, { status: 409, headers });
    }
  }
  const databaseError = databaseFailure(error);
  if (databaseError) return databaseError;
  console.error(`Class ${action} failed.`);
  return Response.json({ error: `Unable to ${action} class. Please try again later.` }, { status: 500, headers });
}

export async function PUT(request: Request, context: Context) {
  return withSchoolAccess(request, 'manage', async ({ schoolId }) => {
    let body: unknown;
    try { body = await request.json(); } catch {
      return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers });
    }
    const parsed = classUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid class input.', fields: validationFields(parsed.error) }, { status: 400, headers });
    }
    const { code, name, room, capacity, classTeacherId } = parsed.data;

    try {
      const { id } = await context.params;
      const record = await transaction(async tx => {
        const existing = await tx.class.findUnique({ where: { id, schoolId }, select: { _count: { select: { students: { where: { schoolId } } } } } });
        if (!existing) throw new ClassRequestError('Class not found.', 404);
        if (capacity < existing._count.students) throw new ClassRequestError('Capacity cannot be lower than the current number of students in this class.', 409);
        const duplicate = await tx.class.findUnique({ where: { code, schoolId }, select: { id: true } });
        if (duplicate && duplicate.id !== id) throw new ClassRequestError('A class with this code already exists.', 409);
        if (classTeacherId) {
          const teacher = await tx.teacher.findUnique({ where: { id: classTeacherId, schoolId }, select: { class: { where: { schoolId }, select: { id: true } } } });
          if (!teacher) throw new ClassRequestError('Teacher not found.', 404);
          if (teacher.class && teacher.class.id !== id) throw new ClassRequestError('This teacher is already assigned to another class.', 409);
        }
        return tx.class.update({ where: { id, schoolId }, data: { schoolId, code, name, room, capacity, classTeacherId }, select: {
          id: true, code: true, name: true, room: true, capacity: true,
          classTeacher: { where: { schoolId }, select: { id: true, teacherId: true, name: true, subject: true, email: true, phone: true } },
          _count: { select: { students: { where: { schoolId } } } },
        } });
      });
      const { _count, ...group } = record;
      return Response.json({ class: { ...group, studentCount: _count.students } }, { status: 200, headers });
    } catch (error) { return failure(error, 'update'); }
  });
}

export async function DELETE(request: Request, context: Context) {
  return withSchoolAccess(request, 'manage', async ({ schoolId }) => {
    try {
      const { id } = await context.params;
      await transaction(async tx => {
        const group = await tx.class.findUnique({ where: { id, schoolId }, select: { _count: { select: { students: { where: { schoolId } }, attendanceSessions: { where: { schoolId } } } } } });
        if (!group) throw new ClassRequestError('Class not found.', 404);
        if (group._count.students || group._count.attendanceSessions) throw new ClassRequestError('This class cannot be deleted while it contains students or attendance sessions.', 409);
        // The assignment is stored on Class; deleting this row releases it without deleting the teacher.
        // Foreign keys also prevent deletion if academic records are added concurrently.
        await tx.class.delete({ where: { id, schoolId }, select: { id: true } });
      });
      return new Response(null, { status: 204, headers });
    } catch (error) { return failure(error, 'delete'); }
  });
}
