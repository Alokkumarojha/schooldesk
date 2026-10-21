-- CreateEnum
CREATE TYPE "RemarkCategory" AS ENUM ('POSITIVE', 'NEEDS_IMPROVEMENT', 'GENERAL');

-- AlterTable
ALTER TABLE "StudentHistory" ADD COLUMN     "remarkCategory" "RemarkCategory";
