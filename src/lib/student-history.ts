import 'server-only';

import type { z } from 'zod';
import type { LogType, Prisma } from '@/generated/prisma/client';
import type { studentUpdateSchema } from './management-validation';
import type { SchoolAccess } from './school-access';
import { AccessError } from './auth';

export const studentSelect = {
  id: true, studentId: true, name: true, classId: true,
  guardianName: true, guardianEmail: true, guardianPhone: true, status: true,
  firstName: true, middleName: true, lastName: true, gender: true, dateOfBirth: true,
  bloodGroup: true, imageUrl: true, admissionDate: true, rollNumber: true, academicYear: true,
  guardianRelation: true, alternateGuardianPhone: true,
  addressLine1: true, addressLine2: true, city: true, state: true, pincode: true, country: true,
  class: { select: { id: true, code: true, name: true, room: true, capacity: true } },
} satisfies Prisma.StudentSelect;

export type StudentRecord = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;
type Input = z.infer<typeof studentUpdateSchema>;

export function studentMutationData(input: Input) {
  // Explicit allowlist: no client-owned school, author, IDs or history properties.
  return {
    name: input.name, classId: input.classId, guardianName: input.guardianName,
    guardianEmail: input.guardianEmail, guardianPhone: input.guardianPhone, status: input.status,
    firstName: input.firstName, middleName: input.middleName, lastName: input.lastName,
    gender: input.gender, bloodGroup: input.bloodGroup, imageUrl: input.imageUrl,
    dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : input.dateOfBirth,
    admissionDate: input.admissionDate ? new Date(`${input.admissionDate}T00:00:00.000Z`) : input.admissionDate,
    rollNumber: input.rollNumber, academicYear: input.academicYear,
    guardianRelation: input.guardianRelation, alternateGuardianPhone: input.alternateGuardianPhone,
    addressLine1: input.addressLine1, addressLine2: input.addressLine2,
    city: input.city, state: input.state, pincode: input.pincode, country: input.country,
  };
}

export function studentResponse(student: StudentRecord) {
  return {
    ...student,
    dateOfBirth: student.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    admissionDate: student.admissionDate?.toISOString().slice(0, 10) ?? null,
  };
}

export async function verifyHistoryActor(tx: Prisma.TransactionClient, access: SchoolAccess) {
  const member = await tx.schoolMember.findUnique({
    where: { schoolId_userId: { schoolId: access.schoolId, userId: access.userId } },
    select: { isActive: true, role: true, school: { select: { isActive: true } } },
  });
  if (!member?.isActive || !member.school.isActive) throw new AccessError('SCHOOL_ACCESS_DENIED');
  if (member.role !== 'OWNER' && member.role !== 'ADMIN') throw new AccessError('ROLE_FORBIDDEN');
}

const comparable = (value: unknown) => value instanceof Date ? value.toISOString() : value ?? null;
export function changedStudentFields(before: StudentRecord, data: ReturnType<typeof studentMutationData>) {
  return Object.entries(data).filter(([key, value]) =>
    value !== undefined && comparable(Reflect.get(before, key)) !== comparable(value),
  ).map(([key]) => key);
}

export function operationError(before: StudentRecord, input: Input): string | null {
  const operation = input.operation;
  if (!operation) return null;
  if (operation.fromClassId !== before.classId) return 'The source class has changed. Refresh and try again.';
  if (operation.type === 'TRANSFER') {
    if (input.status !== 'TRANSFERRED' || before.status === 'TRANSFERRED') return 'Transfer requires a new transition to TRANSFERRED.';
  } else if (input.classId === before.classId) {
    return 'Promotion or section change requires a different destination class.';
  } else if (input.status === 'TRANSFERRED' || input.status === 'GRADUATED') {
    return 'Promotion or section change cannot also graduate or transfer the student.';
  }
  return null;
}

export async function appendStudentHistory(
  tx: Prisma.TransactionClient, access: SchoolAccess, before: StudentRecord | null,
  after: StudentRecord, types: readonly LogType[], changed: readonly string[] = [],
) {
  const titles: Partial<Record<LogType, string>> = {
    ADMISSION: 'Student admitted', PROMOTION: 'Student promoted', SECTION_CHANGE: 'Section changed',
    CLASS_CHANGED: 'Class changed', STATUS_CHANGE: 'Student status changed',
    TRANSFER: 'Student transferred', PROFILE_UPDATED: 'Student profile updated',
  };
  for (const logType of types) {
    // External transfer keeps the required current class on Student for compatibility,
    // but does not invent a destination class in the transfer event.
    const toClass = logType === 'TRANSFER' && before?.classId === after.classId ? null : after.class;
    await tx.studentHistory.create({ data: {
      schoolId: access.schoolId, studentId: after.id, createdById: access.userId,
      logType, title: titles[logType] ?? 'Student updated',
      description: logType === 'PROFILE_UPDATED' ? `Changed fields: ${changed.filter(key => key !== 'classId' && key !== 'status').join(', ')}.` : null,
      fromClassId: before?.class.id ?? null, toClassId: toClass?.id ?? null,
      fromClassNameSnapshot: before?.class.name ?? null, toClassNameSnapshot: toClass?.name ?? null,
      fromClassCodeSnapshot: before?.class.code ?? null, toClassCodeSnapshot: toClass?.code ?? null,
      fromStatus: before?.status ?? null, toStatus: after.status,
      academicYear: after.academicYear,
      studentIdSnapshot: after.studentId, studentNameSnapshot: after.name,
    } });
  }
}

export function updateHistoryTypes(input: Input, changed: readonly string[]): LogType[] {
  const types: LogType[] = [];
  if (input.operation?.type === 'TRANSFER') types.push('TRANSFER');
  else if (changed.includes('classId')) types.push(input.operation?.type ?? 'CLASS_CHANGED');
  if (changed.includes('status') && input.operation?.type !== 'TRANSFER') types.push('STATUS_CHANGE');
  if (changed.some(key => key !== 'classId' && key !== 'status')) types.push('PROFILE_UPDATED');
  return types;
}
