import { getPrisma } from '@/lib/prisma';
import { Prisma, StudentStatus } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
class CapacityConflict extends Error {}

export async function GET() {
  try {
    const students = await getPrisma().student.findMany({
      orderBy: { studentId: 'asc' },
      select: {
        id: true,
        studentId: true,
        name: true,
        guardianName: true,
        guardianEmail: true,
        guardianPhone: true,
        status: true,
        classId: true,
        class: {
          select: { id: true, code: true, name: true, room: true, capacity: true },
        },
      },
    });

    return Response.json({ students }, { status: 200, headers });
  } catch {
    // Do not log raw Prisma/driver errors: they may contain connection details.
    console.error('GET /api/students failed.');
    return Response.json(
      { error: 'Unable to load students. Please try again later.' },
      { status: 500, headers },
    );
  }
}

export async function POST(request: Request) {
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
  let guardianEmail: string | undefined;
  if (input.guardianEmail !== undefined) {
    if (typeof input.guardianEmail !== 'string' || input.guardianEmail.trim().length > 160 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guardianEmail.trim())) {
      errors.guardianEmail = 'Enter a valid email address or omit this field.';
    } else {
      guardianEmail = input.guardianEmail.trim();
    }
  }
  const status = input.status === undefined ? StudentStatus.ACTIVE : input.status;
  if (status !== StudentStatus.ACTIVE && status !== StudentStatus.INACTIVE) {
    errors.status = 'Status must be ACTIVE or INACTIVE.';
  }
  if (Object.keys(errors).length || (status !== StudentStatus.ACTIVE && status !== StudentStatus.INACTIVE)) {
    return Response.json({ error: 'Invalid student input.', fields: errors }, { status: 400, headers });
  }

  try {
    const prisma = getPrisma();
    // Retry concurrent allocations; the unique studentId constraint is the
    // final safeguard. Every attempt re-reads the maximum inside a transaction.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const student = await prisma.$transaction(async tx => {
          const group = await tx.class.findUnique({ where: { id: classId }, select: { capacity: true } });
          if (!group) return null;
          // All assigned students consume a seat, regardless of status. The
          // serializable transaction retries concurrent admissions/capacity changes.
          const assigned = await tx.student.count({ where: { classId } });
          if (assigned >= group.capacity) throw new CapacityConflict();

          const ids = await tx.student.findMany({ select: { studentId: true } });
          const highest = ids.reduce((max, record) => {
            const match = /^SD(\d+)$/.exec(record.studentId);
            const number = match ? BigInt(match[1]) : BigInt(0);
            return number > max ? number : max;
          }, BigInt(0));
          const studentId = `SD${(highest + BigInt(1)).toString().padStart(3, '0')}`;

          return tx.student.create({
            data: { studentId, name, classId, guardianName, guardianEmail, guardianPhone, status },
            select: {
              id: true, studentId: true, name: true, guardianName: true,
              guardianEmail: true, guardianPhone: true, status: true, classId: true,
              class: { select: { id: true, code: true, name: true, room: true, capacity: true } },
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        return student
          ? Response.json({ student }, { status: 201, headers })
          : Response.json({ error: 'Class not found.' }, { status: 404, headers });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034') && attempt < 4) continue;
        throw error;
      }
    }
    throw new Error('Student ID allocation retries exhausted.');
  } catch (error) {
    if (error instanceof CapacityConflict) return Response.json({ error: 'The selected class has reached its capacity. Choose another class.', code: 'CLASS_CAPACITY_EXCEEDED' }, { status: 409, headers });
    console.error('POST /api/students failed.');
    return Response.json(
      { error: 'Unable to create student. Please try again later.' },
      { status: 500, headers },
    );
  }
}
