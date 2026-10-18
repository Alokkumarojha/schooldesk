import { getPrisma } from '@/lib/prisma';
import { Prisma, StudentStatus } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'no-store' };
const notFound = () => Response.json({ error: 'Student not found.' }, { status: 404, headers });

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return Response.json({ error: 'Request body must be a JSON object.' }, { status: 400, headers });
  }
  const input = body as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const requiredText = (field: string, max: number) => {
    const value = input[field];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
      errors[field] = `Must be a non-empty string of at most ${max} characters.`;
      return '';
    }
    return value.trim();
  };
  const name = requiredText('name', 80);
  const classId = requiredText('classId', 128);
  const guardianName = requiredText('guardianName', 80);
  const guardianPhone = requiredText('guardianPhone', 40);
  // PUT replaces the editable fields; omitting the optional email clears it.
  let guardianEmail: string | null = null;
  if (input.guardianEmail !== undefined) {
    if (typeof input.guardianEmail !== 'string' || input.guardianEmail.trim().length > 160 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guardianEmail.trim())) {
      errors.guardianEmail = 'Enter a valid email address or omit this field.';
    } else {
      guardianEmail = input.guardianEmail.trim();
    }
  }
  const status = input.status;
  if (status !== StudentStatus.ACTIVE && status !== StudentStatus.INACTIVE) {
    errors.status = 'Status must be ACTIVE or INACTIVE.';
  }
  if ('id' in input || 'studentId' in input) {
    errors.id = 'Student identifiers cannot be changed or supplied in the body.';
  }
  if (Object.keys(errors).length || (status !== StudentStatus.ACTIVE && status !== StudentStatus.INACTIVE)) {
    return Response.json({ error: 'Invalid student input.', fields: errors }, { status: 400, headers });
  }

  try {
    const { id } = await context.params;
    return await transaction(async tx => {
      const existing = await tx.student.findUnique({ where: { id }, select: { classId: true } });
      if (!existing) return notFound();
      const group = await tx.class.findUnique({ where: { id: classId }, select: { capacity: true } });
      if (!group) return Response.json({ error: 'Class not found.' }, { status: 404, headers });
      // A same-class edit already occupies its seat, even at/above capacity.
      if (existing.classId !== classId && await tx.student.count({ where: { classId } }) >= group.capacity) {
        return Response.json({ error: 'The selected class has reached its capacity. Choose another class.', code: 'CLASS_CAPACITY_EXCEEDED' }, { status: 409, headers });
      }
      const student = await tx.student.update({
        where: { id },
        data: { name, classId, guardianName, guardianEmail, guardianPhone, status },
        select: {
          id: true, studentId: true, name: true, guardianName: true,
          guardianEmail: true, guardianPhone: true, status: true, classId: true,
          class: { select: { id: true, code: true, name: true, room: true, capacity: true } },
        },
      });
      return Response.json({ student }, { status: 200, headers });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return notFound();
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return Response.json({ error: 'Student or class information changed. Refresh and try again.' }, { status: 409, headers });
    console.error('PUT /api/students/[id] failed.');
    return Response.json({ error: 'Unable to update student. Please try again later.' }, { status: 500, headers });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    // A unique delete atomically verifies existence; P2025 means no such student.
    await getPrisma().student.delete({ where: { id }, select: { id: true } });
    return new Response(null, { status: 204, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return notFound();
      if (error.code === 'P2003') {
        return Response.json({ error: 'Student cannot be deleted while related records exist.' }, { status: 409, headers });
      }
    }
    console.error('DELETE /api/students/[id] failed.');
    return Response.json({ error: 'Unable to delete student. Please try again later.' }, { status: 500, headers });
  }
}
