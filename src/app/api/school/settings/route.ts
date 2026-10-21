import { Prisma } from '@/generated/prisma/client';
import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import { managementWriters } from '@/lib/school-policy';
import { getPrisma } from '@/lib/prisma';
import { schoolSettingsPatchSchema, settingsValidationMessages } from '@/lib/school-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const select = { id: true, name: true, code: true, logoUrl: true, addressLine: true,
  city: true, state: true, pincode: true, board: true, academicYear: true, phone: true, email: true } as const;
const missing = () => Response.json({ error: 'School settings are no longer available. Reload the page.' }, { status: 404, headers });

export async function GET(request: Request) {
  return withSchoolAccess(request, 'read', async ({ schoolId, userId, role }) => {
    const school = await getPrisma().school.findUnique({
      where: { id: schoolId, isActive: true, members: { some: { userId, isActive: true } } }, select,
    });
    return school ? Response.json({ school, canEdit: managementWriters.includes(role) }, { headers }) : missing();
  });
}

export async function PATCH(request: Request) {
  return withSchoolAccess(request, 'manage', async ({ schoolId, userId }) => {
    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers }); }
    const parsed = schoolSettingsPatchSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Check the school settings.', fields: settingsValidationMessages(parsed.error) }, { status: 400, headers });
    try {
      const school = await getPrisma().school.update({
        // Recheck membership, role and school status atomically with the write.
        where: { id: schoolId, isActive: true, members: { some: { userId, isActive: true, role: { in: [...managementWriters] } } } },
        data: parsed.data, select,
      });
      return Response.json({ school, canEdit: true }, { headers });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') return missing();
        if (error.code === 'P2002') return Response.json({ error: 'This school code is unavailable. Choose another code.', fields: { code: 'This code is unavailable.' } }, { status: 409, headers });
      }
      return databaseFailure(error) ?? Response.json({ error: 'Unable to save school settings. Please try again.' }, { status: 500, headers });
    }
  });
}
