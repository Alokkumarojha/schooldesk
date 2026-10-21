// Node-only development seed. Never import this entry point from the application.
import { config } from 'dotenv';
import { PrismaNeon } from '@prisma/adapter-neon';
import { NoticeAudience, Prisma, PrismaClient, StudentStatus } from '../src/generated/prisma/client';
import { classes, initialNotices, initialStudents, initialTeachers } from '../src/lib/demo';

config({ quiet: true });

const audienceMap: Record<string, NoticeAudience> = {
  Everyone: NoticeAudience.EVERYONE,
  Teachers: NoticeAudience.TEACHERS,
  Parents: NoticeAudience.PARENTS,
  Students: NoticeAudience.STUDENTS,
};

async function seed() {
  const schoolId = process.env.SEED_SCHOOL_ID?.trim();
  if (!schoolId) throw new Error('Explicit SEED_SCHOOL_ID is required.');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) throw new Error('DATABASE_URL is required.');
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is development-only.');

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }), log: [] });
  try {
    await prisma.$transaction(async tx => {
      if (!await tx.school.findUnique({ where: { id: schoolId, isActive: true }, select: { id: true } })) throw new Error('Selected seed school must exist and be active.');
      const classIds = new Map<string, string>();
      for (const group of classes) {
        const data = { schoolId, name: group.name, room: group.room, capacity: group.capacity };
        const record = await tx.class.upsert({
          where: { code: group.id, schoolId },
          create: { code: group.id, ...data },
          update: data,
        });
        classIds.set(group.id, record.id);
      }
      const getClassId = (code: string) => {
        const id = classIds.get(code);
        if (!id) throw new Error('Demo record references an unknown class.');
        return id;
      };

      for (const student of initialStudents) {
        const data = {
          schoolId,
          name: student.name,
          guardianName: student.guardian,
          guardianEmail: student.email,
          // Intentionally non-dialable development placeholders, not real numbers.
          guardianPhone: `DEMO-GUARDIAN-${student.id}`,
          status: student.status === 'Active' ? StudentStatus.ACTIVE : StudentStatus.INACTIVE,
          classId: getClassId(student.classId),
        };
        await tx.student.upsert({
          where: { studentId: student.id, schoolId },
          create: { studentId: student.id, ...data },
          update: data,
        });
      }

      const assignedClasses = new Set<string>();
      for (const teacher of initialTeachers) {
        if (assignedClasses.has(teacher.classId)) throw new Error('Demo assigns multiple teachers to one class.');
        assignedClasses.add(teacher.classId);
        const data = {
          schoolId,
          name: teacher.name,
          subject: teacher.subject,
          email: teacher.email,
          phone: `DEMO-TEACHER-${teacher.id}`,
        };
        const record = await tx.teacher.upsert({
          where: { teacherId: teacher.id, schoolId },
          create: { teacherId: teacher.id, ...data },
          update: data,
        });
        await tx.class.update({
          where: { id: getClassId(teacher.classId), schoolId },
          data: { classTeacherId: record.id },
        });
      }

      for (const notice of initialNotices) {
        const audience = audienceMap[notice.audience];
        if (!audience) throw new Error('Unknown demo notice audience.');
        const data = {
          schoolId,
          title: notice.title,
          body: notice.body,
          audience,
          date: new Date(`${notice.date}T00:00:00.000Z`),
        };
        // Notice has no natural unique key. A namespaced seed ID avoids duplicates
        // even when titles change, without changing the Prisma schema.
        const legacyId = `schooldesk-demo-notice-${notice.id}`;
        const legacy = await tx.notice.findUnique({ where: { id: legacyId, schoolId }, select: { id: true } });
        const id = legacy?.id ?? `schooldesk-demo-${schoolId}-notice-${notice.id}`;
        await tx.notice.upsert({ where: { id, schoolId }, create: { id, ...data }, update: data });
      }
    }, { maxWait: 10000, timeout: 60000 });

    const [classCount, students, teachers, notices, attendance, attendanceRecords] = await prisma.$transaction([
      prisma.class.count({ where: { schoolId } }), prisma.student.count({ where: { schoolId } }), prisma.teacher.count({ where: { schoolId } }),
      prisma.notice.count({ where: { schoolId } }), prisma.attendance.count({ where: { schoolId } }), prisma.attendanceRecord.count({ where: { attendance: { schoolId } } }),
    ]);
    const counts = { Classes: classCount, Students: students, Teachers: teachers, Notices: notices, Attendance: attendance, AttendanceRecords: attendanceRecords };
    console.log('Database counts:', JSON.stringify(counts));
    if (classCount !== 4 || students !== 12 || teachers !== 4 || notices !== 3 || attendance !== 0 || attendanceRecords !== 0) {
      throw new Error('Counts differ from the initial demo target; existing records were not deleted.');
    }
    const assignments = await prisma.class.findMany({
      where: { schoolId, code: { in: classes.map(group => group.id) } },
      select: { code: true, classTeacher: { select: { teacherId: true, name: true } } },
      orderBy: { code: 'asc' },
    });
    for (const group of assignments) {
      const expected = initialTeachers.find(teacher => teacher.classId === group.code);
      if (!expected || group.classTeacher?.teacherId !== expected.id) {
        throw new Error('A class-teacher assignment does not match the demo.');
      }
    }
    console.log('Verified class teachers:', JSON.stringify(assignments));
    console.log('SchoolDesk demo seed completed; counts and assignments verified.');
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch(error => {
  // Do not log raw driver errors: they can include connection details.
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'SEED_FAILED';
  console.error(`SchoolDesk seed failed (${code}). Check the development connection, migration and seed constraints. Credentials are not logged.`);
  process.exitCode = 1;
});
