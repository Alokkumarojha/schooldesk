import { AccessError } from '@/lib/auth';
import { syncCurrentUser } from '@/lib/user-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

export async function POST() {
  try {
    // The helper verifies the Clerk session before any database access.
    // No request-supplied identity, profile, or role is accepted.
    const { id, clerkId } = await syncCurrentUser();
    return Response.json({ id, clerkId }, { status: 200, headers });
  } catch (error) {
    if (error instanceof AccessError) {
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    return Response.json({ error: 'Unable to synchronize your account. Please try again later.' }, { status: 500, headers });
  }
}
