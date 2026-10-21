import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { AccessError } from '@/lib/auth';
import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import { getPrisma } from '@/lib/prisma';
import { remarkSchema } from '@/lib/student-remarks';
import { studentSelect, verifyHistoryActor } from '@/lib/student-history';
import { validationFields } from '@/lib/management-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withSchoolAccess(request, 'manage', async access => {
    let body: unknown;
    try { body = await request.json(); } catch {
      return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers });
    }
    const parsed = remarkSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid remark.', fields: validationFields(parsed.error) }, { status: 400, headers });
    const key = z.string().uuid().safeParse(request.headers.get('Idempotency-Key'));
    if (!key.success) return Response.json({ error: 'A valid remark request key is required.' }, { status: 400, headers });
    const { id } = await context.params;
    const { schoolId, userId } = access;
    const { title, description, category } = parsed.data;
    // Scope retry identity to the verified actor, school and student. The
    // existing primary key enforces uniqueness across concurrent workers.
    const eventId = 'remark_' + createHash('sha256').update(JSON.stringify([schoolId, userId, id, key.data.toLowerCase()])).digest('hex');
    for (let attempt = 0; ; attempt++) {
      try {
        return await getPrisma().$transaction(async tx => {
          await verifyHistoryActor(tx, access);
          const student = await tx.student.findUnique({ where: { id, schoolId, class: { schoolId } }, select: studentSelect });
          if (!student) return Response.json({ error: 'Student not found.' }, { status: 404, headers });
          const existing = await tx.studentHistory.findFirst({ where: { id: eventId, schoolId, studentId: id, createdById: userId } });
          if (existing) {
            if (existing.logType !== 'ACADEMIC_REMARK' || existing.title !== title || existing.description !== description || existing.remarkCategory !== category) {
              return Response.json({ error: 'This request key was already used for different remark content.' }, { status: 409, headers });
            }
            return Response.json({ remark: { id: existing.id } }, { status: 200, headers });
          }
          const event = await tx.studentHistory.create({ data: {
            id: eventId, schoolId, studentId: student.id, createdById: userId,
            logType: 'ACADEMIC_REMARK', title, description, remarkCategory: category,
            studentIdSnapshot: student.studentId, studentNameSnapshot: student.name,
            fromClassId: student.class.id, toClassId: student.class.id,
            fromClassNameSnapshot: student.class.name, toClassNameSnapshot: student.class.name,
            fromClassCodeSnapshot: student.class.code, toClassCodeSnapshot: student.class.code,
            fromStatus: student.status, toStatus: student.status, academicYear: student.academicYear,
          }, select: { id: true } });
          return Response.json({ remark: event }, { status: 201, headers });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof AccessError) throw error;
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code) && attempt < 4) continue;
        return databaseFailure(error) ?? Response.json({ error: 'Unable to save the remark. Please retry.' }, { status: 500, headers });
      }
    }
  });
}
