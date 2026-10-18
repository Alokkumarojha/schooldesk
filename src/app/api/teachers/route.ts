import { getPrisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

class TeacherConflict extends Error {
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
  const name = text('name', 80);
  const subject = text('subject', 100);
  const email = text('email', 160).toLowerCase();
  const phone = text('phone', 40);
  const classId = input.classId == null ? null : text('classId', 128);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Enter a valid email address.';
  if (Object.keys(fields).length) {
    return Response.json({ error: 'Invalid teacher input.', fields }, { status: 400, headers });
  }

  try {
    const prisma = getPrisma();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const record = await prisma.$transaction(async tx => {
          const existing = await tx.teacher.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
          if (existing) throw new TeacherConflict('A teacher with this email already exists.', 409);
          if (classId) {
            const group = await tx.class.findUnique({ where: { id: classId }, select: { classTeacherId: true } });
            if (!group) throw new TeacherConflict('Class not found.', 404);
            if (group.classTeacherId) throw new TeacherConflict('This class already has a class teacher.', 409);
          }
          const ids = await tx.teacher.findMany({ select: { teacherId: true } });
          const highest = ids.reduce((max, teacher) => {
            const match = /^T(\d+)$/.exec(teacher.teacherId);
            const number = match ? BigInt(match[1]) : BigInt(0);
            return number > max ? number : max;
          }, BigInt(0));
          const teacher = await tx.teacher.create({ data: {
            teacherId: `T${(highest + BigInt(1)).toString().padStart(2, '0')}`,
            name, subject, email, phone,
          } });
          if (classId) {
            // Claim only an unassigned class; never overwrite another teacher.
            const claim = await tx.class.updateMany({ where: { id: classId, classTeacherId: null }, data: { classTeacherId: teacher.id } });
            if (claim.count !== 1) throw new TeacherConflict('This class already has a class teacher.', 409);
          }
          return tx.teacher.findUniqueOrThrow({ where: { id: teacher.id }, select: {
            id: true, teacherId: true, name: true, subject: true, email: true, phone: true,
            class: { select: { id: true, code: true, name: true, room: true, capacity: true } },
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
    console.error('POST /api/teachers failed.');
    return Response.json({ error: 'Unable to create teacher. Please try again later.' }, { status: 500, headers });
  }
}

export async function GET() {
  try {
    const records = await getPrisma().teacher.findMany({
      orderBy: { teacherId: 'asc' },
      select: {
        id: true,
        teacherId: true,
        name: true,
        subject: true,
        email: true,
        phone: true,
        class: {
          select: { id: true, code: true, name: true, room: true, capacity: true },
        },
      },
    });
    const teachers = records.map(({ class: classTeacherOf, ...teacher }) => ({
      ...teacher,
      classTeacherOf,
    }));
    return Response.json({ teachers }, { status: 200, headers });
  } catch {
    // Raw Prisma/driver errors may contain private connection details.
    console.error('GET /api/teachers failed.');
    return Response.json(
      { error: 'Unable to load teachers. Please try again later.' },
      { status: 500, headers },
    );
  }
}
