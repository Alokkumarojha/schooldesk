import { studentUpdateSchema, validationFields } from '@/lib/management-validation';
import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import { getPrisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { AccessError } from '@/lib/auth';
import { isManagedPhoto } from '@/lib/student-photo-reference';
import { appendStudentHistory, changedStudentFields, operationError, studentMutationData, studentResponse, studentSelect, updateHistoryTypes, verifyHistoryActor } from '@/lib/student-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'no-store' };
const notFound = () => Response.json({ error: 'Student not found.' }, { status: 404, headers });

export async function GET(request: Request, context: Context) {
  return withSchoolAccess(request, 'read', async ({ schoolId, role }) => {
    try {
      const { id } = await context.params;
      const student = await getPrisma().student.findUnique({ where: { id, schoolId, class: { schoolId } }, select: studentSelect });
      if (!student) return notFound();
      return Response.json({
        student: studentResponse(student),
        permissions: { canEdit: role === 'OWNER' || role === 'ADMIN', canAddRemark: false },
      }, { status: 200, headers });
    } catch (error) {
      return databaseFailure(error) ?? Response.json({ error: 'Unable to load student profile.' }, { status: 500, headers });
    }
  });
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

export async function PUT(request: Request, context: Context) {
  return withSchoolAccess(request, 'manage', async (access) => {
    const { schoolId } = access;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers });
    }
    const parsed = studentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid student input.', fields: validationFields(parsed.error) }, { status: 400, headers });
    }
    const { classId } = parsed.data;
    const data = studentMutationData(parsed.data);

    try {
      const { id } = await context.params;
      return await transaction(async tx => {
        await verifyHistoryActor(tx, access);
        const existing = await tx.student.findUnique({ where: { id, schoolId, class: { schoolId } }, select: studentSelect });
        if (!existing) return notFound();
        if (isManagedPhoto(existing.imageUrl) && parsed.data.imageUrl !== undefined) {
          return Response.json({ error: 'Use the student photo endpoint to change or remove this photo.' }, { status: 409, headers });
        }
        const intentError = operationError(existing, parsed.data);
        if (intentError) return Response.json({ error: intentError }, { status: 400, headers });
        const group = await tx.class.findUnique({ where: { id: classId, schoolId }, select: { capacity: true } });
        if (!group) return Response.json({ error: 'Class not found.' }, { status: 404, headers });
        // A same-class edit already occupies its seat, even at/above capacity.
        if (existing.classId !== classId && await tx.student.count({ where: { classId, schoolId } }) >= group.capacity) {
          return Response.json({ error: 'The selected class has reached its capacity. Choose another class.', code: 'CLASS_CAPACITY_EXCEEDED' }, { status: 409, headers });
        }
        const changed = changedStudentFields(existing, data);
        if (!changed.length) return Response.json({ student: studentResponse(existing) }, { status: 200, headers });
        const student = await tx.student.update({
          where: { id, schoolId },
          data,
          select: studentSelect,
        });
        await appendStudentHistory(tx, access, existing, student, updateHistoryTypes(parsed.data, changed), changed);
        return Response.json({ student: studentResponse(student) }, { status: 200, headers });
      });
    } catch (error) {
      if (error instanceof AccessError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return notFound();
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return Response.json({ error: 'Student or class information changed. Refresh and try again.' }, { status: 409, headers });
      const databaseError = databaseFailure(error);
      if (databaseError) return databaseError;
      console.error('PUT /api/students/[id] failed.');
      return Response.json({ error: 'Unable to update student. Please try again later.' }, { status: 500, headers });
    }
  });
}

export async function DELETE(request: Request, context: Context) {
  return withSchoolAccess(request, 'manage', async ({ schoolId }) => {
    try {
      const { id } = await context.params;
      // A unique delete atomically verifies existence; P2025 means no such student.
      await getPrisma().student.delete({ where: { id, schoolId }, select: { id: true } });
      return new Response(null, { status: 204, headers });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') return notFound();
        if (error.code === 'P2003') {
          return Response.json({ error: 'Student cannot be deleted while related records exist.' }, { status: 409, headers });
        }
      }
      const databaseError = databaseFailure(error);
      if (databaseError) return databaseError;
      console.error('DELETE /api/students/[id] failed.');
      return Response.json({ error: 'Unable to delete student. Please try again later.' }, { status: 500, headers });
    }
  });
}
