import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { getPrisma } from '@/lib/prisma';
import { databaseFailure, withSchoolAccess } from '@/lib/school-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const pagination = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).default(20),
  cursor: z.string().trim().min(1).max(128).optional(),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withSchoolAccess(request, 'read', async ({ schoolId }) => {
    const search = new URL(request.url).searchParams;
    const parsed = pagination.safeParse({ limit: search.get('limit') ?? undefined, cursor: search.get('cursor') ?? undefined });
    if (!parsed.success) return Response.json({ error: 'Invalid history pagination.' }, { status: 400, headers });
    const { limit, cursor } = parsed.data;
    const { id } = await context.params;
    try {
      return await getPrisma().$transaction(async tx => {
        if (!await tx.student.findUnique({ where: { id, schoolId }, select: { id: true } })) {
          return Response.json({ error: 'Student not found.' }, { status: 404, headers });
        }
        const scope = { schoolId, studentId: id, student: { schoolId } };
        const anchor = cursor ? await tx.studentHistory.findFirst({
          where: { ...scope, id: cursor }, select: { id: true, createdAt: true },
        }) : null;
        if (cursor && !anchor) return Response.json({ error: 'Invalid history cursor.' }, { status: 400, headers });
        const rows = await tx.studentHistory.findMany({
          where: { ...scope, ...(anchor ? { OR: [
            { createdAt: { lt: anchor.createdAt } },
            { createdAt: anchor.createdAt, id: { lt: anchor.id } },
          ] } : {}) },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          select: {
            id: true, studentId: true, logType: true, title: true, description: true,
            fromClassId: true, toClassId: true, fromClassNameSnapshot: true, toClassNameSnapshot: true,
            fromClassCodeSnapshot: true, toClassCodeSnapshot: true, fromStatus: true, toStatus: true,
            academicYear: true, studentIdSnapshot: true, studentNameSnapshot: true,
            createdById: true, createdAt: true,
            createdBy: { select: { role: true, user: { select: { name: true } } } },
          },
        });
        const history = rows.slice(0, limit).map(({ createdBy, ...event }) => ({
          ...event,
          creator: createdBy ? { name: createdBy.user.name, role: createdBy.role } : null,
        }));
        return Response.json({ history, limit, nextCursor: rows.length > limit ? history[history.length - 1].id : null }, { status: 200, headers });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    } catch (error) {
      return databaseFailure(error) ?? Response.json({ error: 'Unable to load student history. Please try again.' }, { status: 500, headers });
    }
  });
}
