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
  console.error(`Teacher ${action} failed.`);
  return Response.json({ error: `Unable to ${action} teacher. Please try again later.` }, { status: 500, headers });
}

export async function PUT(request: Request, context: Context) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return Response.json({ error: 'Request body must be a JSON object.' }, { status: 400, headers });
  }
  const input = body as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const text = (field: string, max: number) => {
    const value = input[field];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
      fields[field] = `Must be a non-empty string of at most ${max} characters.`;
      return '';
    }
    return value.trim();
  };
  const name = text('name', 80);
  const subject = text('subject', 100);
  const email = text('email', 160).toLowerCase();
  const phone = text('phone', 40);
  // PUT replaces the assignment: null and omission both mean unassigned.
  const classId = input.classId == null ? null : text('classId', 128);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Enter a valid email address.';
  if ('id' in input || 'teacherId' in input) fields.id = 'Teacher identifiers cannot be changed or supplied in the body.';
  if (Object.keys(fields).length) return Response.json({ error: 'Invalid teacher input.', fields }, { status: 400, headers });

  try {
    const { id } = await context.params;
    const record = await transaction(async tx => {
      if (!await tx.teacher.findUnique({ where: { id }, select: { id: true } })) throw new RequestError('Teacher not found.', 404);
      const duplicate = await tx.teacher.findFirst({ where: { id: { not: id }, email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
      if (duplicate) throw new RequestError('A teacher with this email already exists.', 409);
      if (classId) {
        const group = await tx.class.findUnique({ where: { id: classId }, select: { classTeacherId: true } });
        if (!group) throw new RequestError('Class not found.', 404);
        if (group.classTeacherId && group.classTeacherId !== id) throw new RequestError('This class already has another class teacher.', 409);
      }
      // Release only this teacher's previous assignment, preserving the target.
      await tx.class.updateMany({ where: { classTeacherId: id, ...(classId ? { id: { not: classId } } : {}) }, data: { classTeacherId: null } });
      if (classId) {
        const claim = await tx.class.updateMany({ where: { id: classId, OR: [{ classTeacherId: null }, { classTeacherId: id }] }, data: { classTeacherId: id } });
        if (claim.count !== 1) throw new RequestError('This class is no longer available for assignment.', 409);
      }
      return tx.teacher.update({ where: { id }, data: { name, subject, email, phone }, select: {
        id: true, teacherId: true, name: true, subject: true, email: true, phone: true,
        class: { select: { id: true, code: true, name: true, room: true, capacity: true } },
      } });
    });
    const { class: classTeacherOf, ...teacher } = record;
    return Response.json({ teacher: { ...teacher, classTeacherOf } }, { status: 200, headers });
  } catch (error) { return failure(error, 'update'); }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    await transaction(async tx => {
      if (!await tx.teacher.findUnique({ where: { id }, select: { id: true } })) throw new RequestError('Teacher not found.', 404);
      await tx.class.updateMany({ where: { classTeacherId: id }, data: { classTeacherId: null } });
      await tx.teacher.delete({ where: { id }, select: { id: true } });
    });
    return new Response(null, { status: 204, headers });
  } catch (error) { return failure(error, 'delete'); }
}
