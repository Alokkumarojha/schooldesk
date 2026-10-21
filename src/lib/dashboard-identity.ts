import 'server-only';

import { currentUser } from '@clerk/nextjs/server';
import { AccessError, requireAuthenticatedUser } from './auth';
import { requireActiveSchool } from './school-access';
import { managementReaders } from './school-policy';
import { getPrisma } from './prisma';

export type DashboardUser = Readonly<{ name: string; email: string | null; imageUrl: string | null }>;
export type DashboardIdentity = Readonly<{ school: { id: string; name: string; academicYear: string | null }; user: DashboardUser }>;

// Read-only: identity comes from Clerk, and school context from verified membership.
// Never synchronize a database user or accept a client-selected school here.
export async function requireDashboardIdentity(): Promise<DashboardIdentity> {
  const access = await requireActiveSchool();
  if (!managementReaders.includes(access.role)) throw new AccessError('ROLE_FORBIDDEN');
  const { clerkId } = await requireAuthenticatedUser();
  let profile;
  try {
    profile = await currentUser();
  } catch {
    throw new AccessError('AUTH_UNAVAILABLE');
  }
  if (!profile || profile.id !== clerkId) throw new AccessError('UNAUTHENTICATED');

  try {
    const school = await getPrisma().school.findUnique({
      where: { id: access.schoolId, isActive: true },
      select: { id: true, name: true, academicYear: true },
    });
    if (!school) throw new AccessError('SCHOOL_ACCESS_DENIED');
    const email = profile.primaryEmailAddress?.emailAddress?.trim() || null;
    return {
      school,
      user: {
        name: profile.fullName?.trim() || profile.username?.trim() || email || 'Signed-in user',
        email,
        imageUrl: profile.hasImage && profile.imageUrl ? profile.imageUrl : null,
      },
    };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError('MEMBERSHIP_UNAVAILABLE');
  }
}
