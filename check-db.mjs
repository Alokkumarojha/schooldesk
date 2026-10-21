import { config } from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "./src/generated/prisma/client.ts";

config();

const prisma = new PrismaClient({
  adapter: new PrismaNeon({
    connectionString: process.env.DATABASE_URL,
  }),
});

try {
  const [students, classes, teachers, attendance, records] =
    await Promise.all([
      prisma.student.count(),
      prisma.class.count(),
      prisma.teacher.count(),
      prisma.attendance.count(),
      prisma.attendanceRecord.count(),
    ]);

  console.table({
    Students: students,
    Classes: classes,
    Teachers: teachers,
    AttendanceSessions: attendance,
    AttendanceRecords: records,
  });
} finally {
  await prisma.$disconnect();
}
