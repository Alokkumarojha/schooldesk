import 'server-only';

import { currentUser } from '@clerk/nextjs/server';
import { AccessError, requireAuthenticatedUser } from './auth';
import { getPrisma } from './prisma';

export type DatabaseUserIdentity = Readonly<{ id: string; clerkId: string }>;

// Explicit write operation for a future sign-in/onboarding flow, not an authorization check.
// Existing users are read-only by default. Request profile refresh deliberately when needed.
export async function syncCurrentUser(
  { refreshProfile = false }: { refreshProfile?: boolean } = {},
): Promise<DatabaseUserIdentity> {
  const { clerkId } = await requireAuthenticatedUser();
  try {
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, clerkId: true, email: true, name: true, phone: true, imageUrl: true },
    });
    if (existing && !refreshProfile) return { id: existing.id, clerkId: existing.clerkId };

    const user = await currentUser();
    if (!user || user.id !== clerkId) throw new AccessError('UNAUTHENTICATED');
    const profile = {
      email: user.primaryEmailAddress?.emailAddress ?? null,
      name: user.fullName,
      phone: user.primaryPhoneNumber?.phoneNumber ?? null,
      imageUrl: user.imageUrl || null,
    };
    if (existing && existing.email === profile.email && existing.name === profile.name &&
      existing.phone === profile.phone && existing.imageUrl === profile.imageUrl) {
      return { id: existing.id, clerkId: existing.clerkId };
    }

    return await prisma.user.upsert({
      where: { clerkId },
      create: { clerkId, ...profile },
      // A concurrent first sync may already have created the user; keep that profile.
      update: existing ? profile : {},
      select: { id: true, clerkId: true },
    });
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError('USER_SYNC_UNAVAILABLE');
  }
}
