import { getPrisma } from '@/lib/prisma';
import { AttendanceStatus, Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const studentSelect = {
  id: true,
  studentId: true,
  name: true,
  status: true,
} as const;

class AttendanceRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404
  ) {
    super(message);
  }
}

export async function PUT(request: Request) {
  const invalid = (error: string) =>
    Response.json({ error }, { status: 400, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid('Request body must be valid JSON.');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return invalid('Request body must be a JSON object.');
  const input = body as Record<string, unknown>;
  if (
    typeof input.classId !== 'string' ||
    !input.classId.trim() ||
    input.classId.trim().length > 128
  )
    return invalid('Provide a valid classId of at most 128 characters.');
  const classId = input.classId.trim();
  const date = input.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return invalid('Date must use YYYY-MM-DD format.');
  const day = new Date(`${date}T00:00:00.000Z`);
  if (
    date.startsWith('0000-') ||
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== date
  )
    return invalid('Date must be a real calendar date in YYYY-MM-DD format.');
  if (!Array.isArray(input.records))
    return invalid('Records must be an array.');
  const records: { studentId: string; status: AttendanceStatus }[] = [];
  const submitted = new Set<string>();
  for (const item of input.records) {
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      return invalid('Each attendance record must be an object.');
    const record = item as Record<string, unknown>;
    if (
      typeof record.studentId !== 'string' ||
      !record.studentId.trim() ||
      record.studentId.trim().length > 128
    )
      return invalid(
        'Each record requires a valid internal studentId of at most 128 characters.'
      );
    const studentId = record.studentId.trim();
    const status = record.status;
    if (
      status !== AttendanceStatus.PRESENT &&
      status !== AttendanceStatus.ABSENT &&
      status !== AttendanceStatus.LATE
    )
      return invalid('Attendance status must be PRESENT, ABSENT, or LATE.');
    if (submitted.has(studentId))
      return invalid('Each student must appear exactly once.');
    submitted.add(studentId);
    records.push({ studentId, status });
  }
  try {
    const prisma = getPrisma();
    for (let attempt = 0; ; attempt++) {
      try {
        const session = await prisma.$transaction(
          async (tx) => {
            if (
              !(await tx.class.findUnique({
                where: { id: classId },
                select: { id: true },
              }))
            )
              throw new AttendanceRequestError('Class not found.', 404);
            const existing = await tx.attendance.findUnique({
              where: { classId_date: { classId, date: day } },
              select: {
                id: true,
                records: {
                  select: { id: true, studentId: true, status: true },
                },
              },
            });
            let attendanceId: string;
            if (existing) {
              if (
                existing.records.length !== records.length ||
                existing.records.some(
                  (record) => !submitted.has(record.studentId)
                )
              ) {
                throw new AttendanceRequestError(
                  'Submit exactly one attendance record for every student in the saved roster, without adding or removing students.',
                  400
                );
              }
              attendanceId = existing.id;
              const statuses = new Map(
                records.map((record) => [record.studentId, record.status])
              );
              for (const record of existing.records) {
                const status = statuses.get(record.studentId);

                if (status === undefined) {
                  throw new AttendanceRequestError(
                    'Submit exactly one attendance record for every student in the saved roster, without adding or removing students.',
                    400
                  );
                }

                if (status !== record.status) {
                  await tx.attendanceRecord.update({
                    where: { id: record.id },
                    data: { status },
                  });
                }
              }
              await tx.attendance.update({
                where: { id: attendanceId },
                data: { updatedAt: new Date() },
              });
            } else {
              const students = await tx.student.findMany({
                where: { classId },
                select: { id: true },
              });
              if (
                students.length !== records.length ||
                students.some((student) => !submitted.has(student.id))
              ) {
                throw new AttendanceRequestError(
                  'Submit exactly one attendance record for every current student in this class, and no students from other classes.',
                  400
                );
              }
              const attendance = await tx.attendance.create({
                data: { classId, date: day },
                select: { id: true },
              });
              attendanceId = attendance.id;
              if (records.length)
                await tx.attendanceRecord.createMany({
                  data: records.map((record) => ({ ...record, attendanceId })),
                });
            }
            const saved = await tx.attendanceRecord.findMany({
              where: { attendanceId },
              orderBy: { studentId: 'asc' },
              select: { id: true, studentId: true, status: true },
            });
            return { id: attendanceId, records: saved };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        return Response.json(
          { attendance: { ...session, classId, date, exists: true } },
          { status: 200, headers }
        );
      } catch (error) {
        // Concurrent first saves or mark edits retry against the authoritative saved roster.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code) &&
          attempt < 4
        )
          continue;
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof AttendanceRequestError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers }
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2034'].includes(error.code)
    ) {
      return Response.json(
        {
          error:
            'Attendance or class membership changed during saving. Reload and try again.',
        },
        { status: 409, headers }
      );
    }
    console.error('PUT /api/attendance failed.');
    return Response.json(
      { error: 'Unable to save attendance. Please try again later.' },
      { status: 500, headers }
    );
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const classId = params.get('classId')?.trim();
  const date = params.get('date');
  if (
    params.getAll('classId').length !== 1 ||
    !classId ||
    classId.length > 128 ||
    params.getAll('date').length !== 1 ||
    !date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return Response.json(
      { error: 'Provide a classId and a valid date in YYYY-MM-DD format.' },
      { status: 400, headers }
    );
  }
  // Explicit UTC midnight avoids local timezone shifts. Round-trip validation
  // rejects normalized impossible dates, such as February 30, for @db.Date.
  const day = new Date(`${date}T00:00:00.000Z`);
  if (
    date.startsWith('0000-') ||
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== date
  ) {
    return Response.json(
      { error: 'Date must be a real calendar date in YYYY-MM-DD format.' },
      { status: 400, headers }
    );
  }

  try {
    const prisma = getPrisma();
    const result = await prisma.$transaction(
      async (tx) => {
        const group = await tx.class.findUnique({
          where: { id: classId },
          select: { id: true },
        });
        if (!group) return null;
        const session = await tx.attendance.findUnique({
          where: { classId_date: { classId, date: day } },
          select: {
            id: true,
            records: {
              orderBy: { student: { studentId: 'asc' } },
              select: {
                id: true,
                studentId: true,
                status: true,
                student: { select: studentSelect },
              },
            },
          },
        });
        if (session) {
          if (
            session.records.some(
              (record) =>
                !record.student || record.student.id !== record.studentId
            ) ||
            new Set(session.records.map((record) => record.studentId)).size !==
              session.records.length
          ) {
            throw new Error('Inconsistent saved attendance roster.');
          }
          return {
            attendance: {
              id: session.id,
              classId,
              date,
              exists: true,
              records: session.records.map(({ id, studentId, status }) => ({
                id,
                studentId,
                status,
              })),
            },
            students: session.records.map((record) => record.student),
          };
        }
        const students = await tx.student.findMany({
          where: { classId },
          orderBy: { studentId: 'asc' },
          select: studentSelect,
        });
        return {
          attendance: { id: null, classId, date, exists: false, records: [] },
          students,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
    if (!result)
      return Response.json(
        { error: 'Class not found.' },
        { status: 404, headers }
      );
    return Response.json(result, { status: 200, headers });
  } catch {
    console.error('GET /api/attendance failed.');
    return Response.json(
      { error: 'Unable to load attendance. Please try again later.' },
      { status: 500, headers }
    );
  }
}
