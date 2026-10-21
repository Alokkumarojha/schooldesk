-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('ADMISSION', 'PROMOTION', 'SECTION_CHANGE', 'STATUS_CHANGE', 'TRANSFER', 'ACADEMIC_REMARK', 'FEE_RECORD', 'PROFILE_UPDATED', 'CLASS_CHANGED', 'LOGIN_LINKED', 'LOGIN_UNLINKED', 'BASELINE_IMPORTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StudentStatus" ADD VALUE 'GRADUATED';
ALTER TYPE "StudentStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "StudentStatus" ADD VALUE 'TRANSFERRED';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "academicYear" TEXT,
ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "admissionDate" DATE,
ADD COLUMN     "alternateGuardianPhone" TEXT,
ADD COLUMN     "bloodGroup" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "guardianRelation" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "rollNumber" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "StudentHistory" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "logType" "LogType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fromClassId" TEXT,
    "toClassId" TEXT,
    "fromClassNameSnapshot" TEXT,
    "toClassNameSnapshot" TEXT,
    "fromClassCodeSnapshot" TEXT,
    "toClassCodeSnapshot" TEXT,
    "fromStatus" "StudentStatus",
    "toStatus" "StudentStatus",
    "academicYear" TEXT,
    "studentIdSnapshot" TEXT NOT NULL,
    "studentNameSnapshot" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentHistory_schoolId_studentId_createdAt_id_idx" ON "StudentHistory"("schoolId", "studentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "StudentHistory_schoolId_fromClassId_idx" ON "StudentHistory"("schoolId", "fromClassId");

-- CreateIndex
CREATE INDEX "StudentHistory_schoolId_toClassId_idx" ON "StudentHistory"("schoolId", "toClassId");

-- CreateIndex
CREATE INDEX "StudentHistory_schoolId_createdById_idx" ON "StudentHistory"("schoolId", "createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Student_schoolId_id_key" ON "Student"("schoolId", "id");

-- AddForeignKey
ALTER TABLE "StudentHistory" ADD CONSTRAINT "StudentHistory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "StudentHistory" ADD CONSTRAINT "StudentHistory_schoolId_studentId_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "Student"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "StudentHistory" ADD CONSTRAINT "StudentHistory_schoolId_createdById_fkey" FOREIGN KEY ("schoolId", "createdById") REFERENCES "SchoolMember"("schoolId", "userId") ON DELETE RESTRICT ON UPDATE RESTRICT;
