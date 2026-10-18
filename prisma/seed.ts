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
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) throw new Error('DATABASE_URL is required.');
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is development-only.');

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }), log: [] });
  try {
    await prisma.$transaction(async tx => {
      const classIds = new Map<string, string>();
      for (const group of classes) {
        const data = { name: group.name, room: group.room, capacity: group.capacity };
        const record = await tx.class.upsert({
          where: { code: group.id },
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
          name: student.name,
          guardianName: student.guardian,
          guardianEmail: student.email,
          // Intentionally non-dialable development placeholders, not real numbers.
          guardianPhone: `DEMO-GUARDIAN-${student.id}`,
          status: student.status === 'Active' ? StudentStatus.ACTIVE : StudentStatus.INACTIVE,
          classId: getClassId(student.classId),
        };
        await tx.student.upsert({
          where: { studentId: student.id },
          create: { studentId: student.id, ...data },
          update: data,
        });
      }

      const assignedClasses = new Set<string>();
      for (const teacher of initialTeachers) {
        if (assignedClasses.has(teacher.classId)) throw new Error('Demo assigns multiple teachers to one class.');
        assignedClasses.add(teacher.classId);
        const data = {
          name: teacher.name,
          subject: teacher.subject,
          email: teacher.email,
          phone: `DEMO-TEACHER-${teacher.id}`,
        };
        const record = await tx.teacher.upsert({
          where: { teacherId: teacher.id },
          create: { teacherId: teacher.id, ...data },
          update: data,
        });
        await tx.class.update({
          where: { id: getClassId(teacher.classId) },
          data: { classTeacherId: record.id },
        });
      }

      for (const notice of initialNotices) {
        const audience = audienceMap[notice.audience];
        if (!audience) throw new Error('Unknown demo notice audience.');
        const data = {
          title: notice.title,
          body: notice.body,
          audience,
          date: new Date(`${notice.date}T00:00:00.000Z`),
        };
        // Notice has no natural unique key. A namespaced seed ID avoids duplicates
        // even when titles change, without changing the Prisma schema.
        const id = `schooldesk-demo-notice-${notice.id}`;
        await tx.notice.upsert({ where: { id }, create: { id, ...data }, update: data });
      }
    }, { maxWait: 10000, timeout: 60000 });

    const [classCount, students, teachers, notices, attendance, attendanceRecords] = await prisma.$transaction([
      prisma.class.count(), prisma.student.count(), prisma.teacher.count(),
      prisma.notice.count(), prisma.attendance.count(), prisma.attendanceRecord.count(),
    ]);
    const counts = { Classes: classCount, Students: students, Teachers: teachers, Notices: notices, Attendance: attendance, AttendanceRecords: attendanceRecords };
    console.log('Database counts:', JSON.stringify(counts));
    if (classCount !== 4 || students !== 12 || teachers !== 4 || notices !== 3 || attendance !== 0 || attendanceRecords !== 0) {
      throw new Error('Counts differ from the initial demo target; existing records were not deleted.');
    }
    const assignments = await prisma.class.findMany({
      where: { code: { in: classes.map(group => group.id) } },
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
