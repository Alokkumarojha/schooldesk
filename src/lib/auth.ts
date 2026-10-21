import 'server-only';

import { auth } from '@clerk/nextjs/server';

const accessErrors = {
  UNAUTHENTICATED: { status: 401, message: 'Sign in to continue.' },
  INVALID_SCHOOL_CONTEXT: { status: 400, message: 'Provide a valid school ID.' },
  SCHOOL_ACCESS_DENIED: { status: 403, message: 'You do not have access to this school.' },
  ROLE_FORBIDDEN: { status: 403, message: 'You do not have permission to perform this action.' },
  AUTH_UNAVAILABLE: { status: 503, message: 'Unable to verify your session. Please try again.' },
  USER_SYNC_UNAVAILABLE: { status: 503, message: 'Unable to synchronize your account. Please try again.' },
  MEMBERSHIP_UNAVAILABLE: { status: 503, message: 'Unable to verify school access. Please try again.' },
} as const;

export type AccessErrorCode = keyof typeof accessErrors;

// Future routes may map status/code/message to JSON; never serialize raw provider errors.
export class AccessError extends Error {
  readonly status: 400 | 401 | 403 | 503;

  constructor(readonly code: AccessErrorCode) {
    super(accessErrors[code].message);
    this.name = 'AccessError';
    this.status = accessErrors[code].status;
  }
}

export async function requireAuthenticatedUser(): Promise<Readonly<{ clerkId: string }>> {
  try {
    const { userId } = await auth();
    if (!userId) throw new AccessError('UNAUTHENTICATED');
    return { clerkId: userId };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError('AUTH_UNAVAILABLE');
  }
}
