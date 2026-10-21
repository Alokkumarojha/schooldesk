-- AlterTable
ALTER TABLE "Attendance" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Class" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Notice" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Student" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Teacher" ALTER COLUMN "schoolId" SET NOT NULL;
