import { Prisma } from '@/generated/prisma/client';
import { AccessError } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { withSchoolAccess, databaseFailure } from '@/lib/school-api';
import type { SchoolAccess } from '@/lib/school-access';
import {
  studentSelect,
  appendStudentHistory,
  verifyHistoryActor,
} from '@/lib/student-history';
import {
  newPhotoReference,
  photoPublicId,
  photoVersion,
  isManagedPhoto,
} from '@/lib/student-photo-reference';
import { validatePhoto, PhotoError } from '@/lib/student-photo-image';
import {
  uploadPhoto,
  cleanupPhoto,
  cleanupRequired,
  readPhoto,
} from '@/lib/student-photo-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Cookie, X-School-Id',
};
function failure(error: unknown) {
  if (error instanceof AccessError) throw error;
  if (error instanceof PhotoError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers }
    );
  return (
    databaseFailure(error) ??
    Response.json(
      { error: 'Unable to update photo. Refresh before retrying.' },
      { status: 500, headers }
    )
  );
}
function findStudent(id: string, schoolId: string) {
  return getPrisma().student.findUnique({
    where: { id, schoolId, class: { schoolId } },
    select: studentSelect,
  });
}

export async function GET(request: Request, context: Context) {
  return withSchoolAccess(request, 'read', async ({ schoolId }) => {
    try {
      const { id } = await context.params;
      const student = await findStudent(id, schoolId);
      if (!student) throw new PhotoError(404, 'Student not found.');
      const responseHeaders = {
        ...headers,
        ETag: photoVersion(student.imageUrl),
      };
      // Same authorization as delivery; avoids opaque redirect headers for legacy images.
      if (new URL(request.url).searchParams.get('metadata') === '1') {
        return Response.json(
          {
            photo: {
              imageUrl: student.imageUrl,
              version: photoVersion(student.imageUrl),
            },
          },
          { headers: responseHeaders }
        );
      }
      if (!student.imageUrl)
        return Response.json(
          { error: 'No photo.' },
          { status: 404, headers: responseHeaders }
        );
      const publicId = photoPublicId(student.imageUrl, schoolId, id);
      if (publicId)
        return new Response(new Uint8Array(await readPhoto(publicId)), {
          headers: {
            ...responseHeaders,
            'Content-Type': 'image/webp',
            'Content-Disposition': 'inline; filename="student-photo.webp"',
          },
        });
      // Preserve legacy external HTTPS photos without server-side fetching (SSRF).
      if (!isManagedPhoto(student.imageUrl)) {
        const url = new URL(student.imageUrl);
        if (url.protocol === 'https:' && !url.username && !url.password)
          return new Response(null, {
            status: 307,
            headers: { ...responseHeaders, Location: url.href },
          });
      }
      throw new PhotoError(404, 'Photo unavailable.');
    } catch (error) {
      return failure(error);
    }
  });
}

async function mutate(
  request: Request,
  context: Context,
  access: SchoolAccess,
  remove: boolean
) {
  let uploaded: string | null = null;
  let callbackCompleted = false;
  let committed = false;
  try {
    const { id } = await context.params;
    const { schoolId } = access;
    const before = await findStudent(id, schoolId);
    if (!before) throw new PhotoError(404, 'Student not found.');
    const expected = request.headers.get('If-Match');
    if (!expected)
      throw new PhotoError(
        428,
        'Load the current photo version before changing it.'
      );
    if (expected !== photoVersion(before.imageUrl))
      throw new PhotoError(409, 'Photo changed. Refresh before retrying.');
    if (
      remove &&
      (request.body !== null || request.headers.has('content-length'))
    ) {
      throw new PhotoError(
        400,
        'Photo removal does not accept a request body.'
      );
    }
    let reference: string | null = null;
    if (!remove) {
      const bytes = await validatePhoto(request);
      reference = newPhotoReference(schoolId, id);
      const publicId = photoPublicId(reference, schoolId, id);
      if (!publicId) throw new Error('Invalid generated reference');
      await uploadPhoto(publicId, bytes);
      uploaded = publicId;
    }
    // Storage I/O stays outside the database transaction and its retries.
    for (let attempt = 0; ; attempt++) {
      callbackCompleted = false;
      try {
        await getPrisma().$transaction(
          async (tx) => {
            await verifyHistoryActor(tx, access);
            const current = await tx.student.findUnique({
              where: { id, schoolId, class: { schoolId } },
              select: studentSelect,
            });
            if (!current) throw new PhotoError(404, 'Student not found.');
            if (photoVersion(current.imageUrl) !== expected)
              throw new PhotoError(
                409,
                'Photo changed. Refresh before retrying.'
              );
            if (current.imageUrl !== reference) {
              const updated = await tx.student.update({
                where: { id, schoolId, imageUrl: current.imageUrl },
                data: { imageUrl: reference },
                select: studentSelect,
              });
              await appendStudentHistory(
                tx,
                access,
                current,
                updated,
                ['PROFILE_UPDATED'],
                ['imageUrl']
              );
            }
            callbackCompleted = true;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        committed = true;
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          callbackCompleted = false; // Prisma explicitly rolled back this transaction.
          if (attempt < 2) continue;
        }
        throw error;
      }
    }
    const oldPublicId = photoPublicId(before.imageUrl, schoolId, id);
    const cleanupPending = oldPublicId
      ? !(await cleanupPhoto(oldPublicId))
      : false;
    return Response.json(
      {
        photo: { imageUrl: reference, version: photoVersion(reference) },
        cleanupPending,
      },
      { headers: { ...headers, ETag: photoVersion(reference) } }
    );
  } catch (error) {
    if (uploaded && !committed) {
      // If commit acknowledgement was lost, deletion could destroy the active photo.
      if (callbackCompleted)
        cleanupRequired(uploaded, 'database-commit-outcome-unknown');
      else await cleanupPhoto(uploaded);
    }
    return failure(error);
  }
}
export async function PUT(request: Request, context: Context) {
  return withSchoolAccess(request, 'manage', (access) =>
    mutate(request, context, access, false)
  );
}
export async function DELETE(request: Request, context: Context) {
  return withSchoolAccess(request, 'manage', (access) =>
    mutate(request, context, access, true)
  );
}
