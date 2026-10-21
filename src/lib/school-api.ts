import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { AccessError } from './auth';
import { requireSchoolRole, type SchoolAccess } from './school-access';
import { managementReaders, managementWriters } from './school-policy';

const headers = { 'Cache-Control': 'no-store' };

export function databaseFailure(error: unknown): Response | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (['P2002', 'P2003', 'P2034'].includes(error.code)) {
      return Response.json({ error: 'This change conflicts with existing records. Refresh and try again.' }, { status: 409, headers });
    }
    if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028'].includes(error.code)) {
      return Response.json({ error: 'School data is temporarily unavailable. Please try again.' }, { status: 503, headers });
    }
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return Response.json({ error: 'School data is temporarily unavailable. Please try again.' }, { status: 503, headers });
  }
  return null;
}

// The header selects a school; only Clerk + the active membership authorize it.
// Call before parsing input or touching any academic records.
export async function withSchoolAccess(
  request: Request,
  permission: 'read' | 'manage',
  handler: (access: SchoolAccess) => Promise<Response>,
): Promise<Response> {
  try {
    const access = await requireSchoolRole(
      request.headers.get('X-School-Id') ?? '',
      permission === 'manage' ? managementWriters : managementReaders,
    );
    // Browser mutations must originate from this application. Non-browser clients
    // still require a verified Clerk session and the same role/membership checks.
    const origin = request.headers.get('Origin');
    if (permission === 'manage' && ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')) {
      throw new AccessError('ROLE_FORBIDDEN');
    }
    return await handler(access);
  } catch (error) {
    if (error instanceof AccessError) {
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    return databaseFailure(error) ?? Response.json({ error: 'Unable to complete this request. Please try again later.' }, { status: 500, headers });
  }
}
