import { getPrisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

class ClassRequestError extends Error {
  constructor(message: string, readonly status: 404 | 409) { super(message); }
}

export async function POST(request: Request) {
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
  const code = text('code', 40);
  const name = text('name', 100);
  const room = text('room', 80);
  const classTeacherId = input.classTeacherId == null ? null : text('classTeacherId', 128);
  const capacity = input.capacity;
  if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 1 || capacity > 1000) {
    fields.capacity = 'Capacity must be an integer between 1 and 1000.';
  }
  if (Object.keys(fields).length || typeof capacity !== 'number') {
    return Response.json({ error: 'Invalid class input.', fields }, { status: 400, headers });
  }
  try {
    const prisma = getPrisma();
    for (let attempt = 0; ; attempt++) {
      try {
        const record = await prisma.$transaction(async tx => {
          if (await tx.class.findUnique({ where: { code }, select: { id: true } })) {
            throw new ClassRequestError('A class with this code already exists.', 409);
          }
          if (classTeacherId) {
            const teacher = await tx.teacher.findUnique({ where: { id: classTeacherId }, select: { class: { select: { id: true } } } });
            if (!teacher) throw new ClassRequestError('Teacher not found.', 404);
            if (teacher.class) throw new ClassRequestError('This teacher is already assigned to another class.', 409);
          }
          return tx.class.create({
            data: { code, name, room, capacity, classTeacherId },
            select: {
              id: true, code: true, name: true, room: true, capacity: true,
              classTeacher: { select: { id: true, teacherId: true, name: true, subject: true, email: true, phone: true } },
              _count: { select: { students: true } },
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
    console.error('POST /api/classes failed.');
    return Response.json({ error: 'Unable to create class. Please try again later.' }, { status: 500, headers });
  }
}

export async function GET() {
  try {
    const records = await getPrisma().class.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        room: true,
        capacity: true,
        classTeacher: {
          select: { id: true, teacherId: true, name: true, subject: true, email: true, phone: true },
        },
        _count: { select: { students: true } },
      },
    });
    const classes = records.map(({ _count, ...group }) => ({
      ...group,
      studentCount: _count.students,
    }));
    return Response.json({ classes }, { status: 200, headers });
  } catch {
    // Raw Prisma/driver errors may contain private connection details.
    console.error('GET /api/classes failed.');
    return Response.json(
      { error: 'Unable to load classes. Please try again later.' },
      { status: 500, headers },
    );
  }
}
