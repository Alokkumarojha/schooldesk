import 'server-only';

import type { SchoolRole } from '@/generated/prisma/enums';
import { AccessError, requireAuthenticatedUser } from './auth';
import { getPrisma } from './prisma';

export type SchoolAccess = Readonly<{ schoolId: string; userId: string; role: SchoolRole }>;

// The requested school is an untrusted selector, never evidence of membership.
// This resolver never creates a user/membership or picks a default school.
export async function requireSchoolMembership(requestedSchoolId: string): Promise<SchoolAccess> {
  const { clerkId } = await requireAuthenticatedUser();
  if (typeof requestedSchoolId !== 'string' || !requestedSchoolId.trim() || requestedSchoolId.trim().length > 128) {
    throw new AccessError('INVALID_SCHOOL_CONTEXT');
  }
  const schoolId = requestedSchoolId.trim();
  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
    if (!user) throw new AccessError('SCHOOL_ACCESS_DENIED');
    const member = await prisma.schoolMember.findUnique({
      where: { schoolId_userId: { schoolId, userId: user.id } },
      select: { schoolId: true, userId: true, role: true, isActive: true, school: { select: { isActive: true } } },
    });
    if (!member || !member.isActive || !member.school.isActive) throw new AccessError('SCHOOL_ACCESS_DENIED');
    return { schoolId: member.schoolId, userId: member.userId, role: member.role };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError('MEMBERSHIP_UNAVAILABLE');
  }
}

// allowedRoles must be a server-defined policy, never taken from request input.
// OWNER/ADMIN must be explicitly listed; neither bypasses the allowlist.
export async function requireSchoolRole(schoolId: string, allowedRoles: readonly SchoolRole[]): Promise<SchoolAccess> {
  const access = await requireSchoolMembership(schoolId);
  if (!allowedRoles.includes(access.role)) throw new AccessError('ROLE_FORBIDDEN');
  return access;
}

export async function requireActiveSchool(): Promise<SchoolAccess> {
  const { clerkId } = await requireAuthenticatedUser();

  try {
    const prisma = getPrisma();

    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!user) {
      throw new AccessError('SCHOOL_ACCESS_DENIED');
    }

    const memberships = await prisma.schoolMember.findMany({
      where: {
        userId: user.id,
        isActive: true,
        school: { isActive: true },
      },
      select: {
        schoolId: true,
        userId: true,
        role: true,
      },
      take: 2,
    });

    if (memberships.length !== 1) {
      throw new AccessError('SCHOOL_ACCESS_DENIED');
    }

    return memberships[0];
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError('MEMBERSHIP_UNAVAILABLE');
  }
}
