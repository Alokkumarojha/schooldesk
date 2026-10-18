import { getPrisma } from '@/lib/prisma';
import { NoticeAudience, Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'no-store' };
const notFound = () => Response.json({ error: 'Notice not found.' }, { status: 404, headers });

export async function PUT(request: Request, context: Context) {
  const invalid = (error: string) => Response.json({ error }, { status: 400, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return invalid('Request body must be valid JSON.'); }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return invalid('Request body must be a JSON object.');
  const input = body as Record<string, unknown>;
  if ('id' in input) return invalid('Notice identifiers cannot be supplied or changed in the body.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 160) return invalid('Title must contain 1 to 160 characters.');
  if (typeof input.body !== 'string' || !input.body.trim() || input.body.trim().length > 5000) return invalid('Body must contain 1 to 5000 characters.');
  const audience = input.audience;
  if (audience !== NoticeAudience.EVERYONE && audience !== NoticeAudience.TEACHERS && audience !== NoticeAudience.PARENTS && audience !== NoticeAudience.STUDENTS) return invalid('Choose a supported notice audience.');
  const date = input.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid('Date must use YYYY-MM-DD format.');
  const day = new Date(`${date}T00:00:00.000Z`);
  if (date.startsWith('0000-') || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return invalid('Date must be a real calendar date.');
  try {
    const { id } = await context.params;
    // Unique update checks existence atomically; P2025 means the notice is missing.
    const notice = await getPrisma().notice.update({ where: { id },
      data: { title: input.title.trim(), body: input.body.trim(), audience, date: day },
      select: { id: true, title: true, body: true, audience: true, date: true },
    });
    return Response.json({ notice: { ...notice, date: notice.date.toISOString().slice(0, 10) } }, { status: 200, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return notFound();
    console.error('PUT /api/notices/[id] failed.');
    return Response.json({ error: 'Unable to update notice. Please try again later.' }, { status: 500, headers });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    // Only the identified notice is deleted; the unique delete also checks existence.
    await getPrisma().notice.delete({ where: { id }, select: { id: true } });
    return new Response(null, { status: 204, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return notFound();
    console.error('DELETE /api/notices/[id] failed.');
    return Response.json({ error: 'Unable to delete notice. Please try again later.' }, { status: 500, headers });
  }
}
