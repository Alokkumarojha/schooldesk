import { teacherUpdateSchema, validationFields } from '@/lib/management-validation';
import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import { getPrisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'no-store' };
class RequestError extends Error {
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
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') return Response.json({ error: 'Teacher not found.' }, { status: 404, headers });
    if (['P2002', 'P2003', 'P2034'].includes(error.code)) {
      return Response.json({ error: 'The change conflicts with an existing email, class assignment, or related record. Refresh and try again.' }, { status: 409, headers });
    }
  }
  const databaseError = databaseFailure(error);
  if (databaseError) return databaseError;
  console.error(`Teacher ${action} failed.`);
  return Response.json({ error: `Unable to ${action} teacher. Please try again later.` }, { status: 500, headers });
}

export async function PUT(request: Request, context: Context) {
  return withSchoolAccess(request, 'manage', async ({ schoolId }) => {
    let body: unknown;
    try { body = await request.json(); } catch {
      return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers });
    }
    const parsed = teacherUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid teacher input.', fields: validationFields(parsed.error) }, { status: 400, headers });
    }
    const { name, subject, email, phone, classId } = parsed.data;

    try {
      const { id } = await context.params;
      const record = await transaction(async tx => {
        if (!await tx.teacher.findUnique({ where: { id, schoolId }, select: { id: true } })) throw new RequestError('Teacher not found.', 404);
        const duplicate = await tx.teacher.findFirst({ where: { schoolId, id: { not: id }, email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
        if (duplicate) throw new RequestError('A teacher with this email already exists.', 409);
        if (classId) {
          const group = await tx.class.findUnique({ where: { id: classId, schoolId }, select: { classTeacherId: true } });
          if (!group) throw new RequestError('Class not found.', 404);
          if (group.classTeacherId && group.classTeacherId !== id) throw new RequestError('This class already has another class teacher.', 409);
        }
        // Release only this teacher's previous assignment, preserving the target.
        await tx.class.updateMany({ where: { schoolId, classTeacherId: id, ...(classId ? { id: { not: classId } } : {}) }, data: { classTeacherId: null } });
        if (classId) {
          const claim = await tx.class.updateMany({ where: { id: classId, schoolId, OR: [{ classTeacherId: null }, { classTeacherId: id }] }, data: { classTeacherId: id } });
          if (claim.count !== 1) throw new RequestError('This class is no longer available for assignment.', 409);
        }
        return tx.teacher.update({ where: { id, schoolId }, data: { name, subject, email, phone }, select: {
          id: true, teacherId: true, name: true, subject: true, email: true, phone: true,
          class: { where: { schoolId }, select: { id: true, code: true, name: true, room: true, capacity: true } },
        } });
      });
      const { class: classTeacherOf, ...teacher } = record;
      return Response.json({ teacher: { ...teacher, classTeacherOf } }, { status: 200, headers });
    } catch (error) { return failure(error, 'update'); }
  });
}

export async function DELETE(request: Request, context: Context) {
  return withSchoolAccess(request, 'manage', async ({ schoolId }) => {
    try {
      const { id } = await context.params;
      await transaction(async tx => {
        if (!await tx.teacher.findUnique({ where: { id, schoolId }, select: { id: true } })) throw new RequestError('Teacher not found.', 404);
        await tx.class.updateMany({ where: { schoolId, classTeacherId: id }, data: { classTeacherId: null } });
        await tx.teacher.delete({ where: { id, schoolId }, select: { id: true } });
      });
      return new Response(null, { status: 204, headers });
    } catch (error) { return failure(error, 'delete'); }
  });
}
