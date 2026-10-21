import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import { getPrisma } from '@/lib/prisma';
import { NoticeAudience } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const select = { id: true, title: true, body: true, audience: true, date: true } as const;

export async function GET(request: Request) {
  return withSchoolAccess(request, 'read', async ({ schoolId }) => {
    try {
      const records = await getPrisma().notice.findMany({
        where: { schoolId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], select,
      });
      return Response.json({ notices: records.map(notice => ({ ...notice, date: notice.date.toISOString().slice(0, 10) })) }, { status: 200, headers });
    } catch (error) {
      const databaseError = databaseFailure(error);
      if (databaseError) return databaseError;
      console.error('GET /api/notices failed.');
      return Response.json({ error: 'Unable to load notices. Please try again later.' }, { status: 500, headers });
    }
  });
}

export async function POST(request: Request) {
  return withSchoolAccess(request, 'manage', async ({ schoolId }) => {
    const invalid = (error: string) => Response.json({ error }, { status: 400, headers });
    let body: unknown;
    try { body = await request.json(); } catch { return invalid('Request body must be valid JSON.'); }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return invalid('Request body must be a JSON object.');
    const input = body as Record<string, unknown>;
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 160) return invalid('Title must contain 1 to 160 characters.');
    if (typeof input.body !== 'string' || !input.body.trim() || input.body.trim().length > 5000) return invalid('Body must contain 1 to 5000 characters.');
    const audience = input.audience;
    if (audience !== NoticeAudience.EVERYONE && audience !== NoticeAudience.TEACHERS && audience !== NoticeAudience.PARENTS && audience !== NoticeAudience.STUDENTS) return invalid('Choose a supported notice audience.');
    const date = input.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid('Date must use YYYY-MM-DD format.');
    // Store calendar dates at explicit UTC midnight and reject normalized impossible dates.
    const day = new Date(`${date}T00:00:00.000Z`);
    if (date.startsWith('0000-') || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return invalid('Date must be a real calendar date.');
    try {
      const notice = await getPrisma().notice.create({ data: { schoolId, title: input.title.trim(), body: input.body.trim(), audience, date: day }, select });
      return Response.json({ notice: { ...notice, date: notice.date.toISOString().slice(0, 10) } }, { status: 201, headers });
    } catch (error) {
      const databaseError = databaseFailure(error);
      if (databaseError) return databaseError;
      console.error('POST /api/notices failed.');
      return Response.json({ error: 'Unable to create notice. Please try again later.' }, { status: 500, headers });
    }
  });
}
