import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import { getPrisma } from '@/lib/prisma';
import { remarkSchema, remarkUnavailableMessage } from '@/lib/student-remarks';
import { validationFields } from '@/lib/management-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

// Deliberately no write path until category storage AND a verified User–Teacher
// link have been approved. Never infer teacher identity from a matching email.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withSchoolAccess(request, 'read', async ({ schoolId, role }) => {
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return Response.json({ error: 'Remark creation is not authorized for this account.' }, { status: 403, headers });
    }
    const origin = request.headers.get('Origin');
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
      return Response.json({ error: 'Request not permitted.' }, { status: 403, headers });
    }
    let body: unknown;
    try { body = await request.json(); } catch {
      return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers });
    }
    const parsed = remarkSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid remark.', fields: validationFields(parsed.error) }, { status: 400, headers });
    try {
      const { id } = await context.params;
      const student = await getPrisma().student.findUnique({ where: { id, schoolId, class: { schoolId } }, select: { id: true } });
      if (!student) return Response.json({ error: 'Student not found.' }, { status: 404, headers });
      return Response.json({ error: remarkUnavailableMessage, code: 'REMARK_STORAGE_NOT_READY' }, { status: 501, headers });
    } catch (error) {
      return databaseFailure(error) ?? Response.json({ error: 'Unable to process remark request.' }, { status: 500, headers });
    }
  });
}
