import { z } from 'zod';
import { schoolFetch } from './school-fetch';
import {
  updateStudentProfile,
  type StudentProfile,
} from './student-profile-client';
import type { studentUpdateSchema } from './management-validation';

export type PhotoDraft =
  | { type: 'upload'; file: File }
  | { type: 'remove' }
  | null;
const photoSchema = z.object({
  imageUrl: z.string().nullable(),
  version: z.string().regex(/^"photo-[a-f0-9]{64}"$/),
});
export type PhotoState = z.infer<typeof photoSchema>;
export class PhotoRequestError extends Error {
  constructor(
    message: string,
    readonly status: number = 0
  ) {
    super(message);
  }
}
function endpoint(id: string) {
  return `/api/students/${encodeURIComponent(id)}/photo/`;
}
async function checked(request: Promise<Response>) {
  let response: Response;
  try {
    response = await request;
  } catch {
    throw new PhotoRequestError(
      'The photo request could not be confirmed. Review the current photo before retrying.'
    );
  }
  if (response.ok) return response;
  const messages: Record<number, string> = {
    400: 'Use a valid, non-animated image within the supported dimensions.',
    401: 'Sign in again before saving the photo.',
    403: 'You no longer have permission to change or view this photo.',
    404: 'The student or photo is unavailable.',
    409: 'The photo changed elsewhere. Review the current photo before retrying.',
    413: 'Choose an image no larger than 2 MB.',
    415: 'Choose a JPEG, PNG or WebP image.',
    428: 'Review the current photo before saving.',
    503: 'Photo storage is unavailable. Review the current photo before retrying.',
  };
  throw new PhotoRequestError(
    messages[response.status] ??
      'The photo save could not be confirmed. Review the current photo before retrying.',
    response.status
  );
}
export async function loadPhotoState(
  schoolId: string,
  id: string,
  signal?: AbortSignal
): Promise<PhotoState> {
  const response = await checked(
    schoolFetch(schoolId, `${endpoint(id)}?metadata=1`, {
      signal,
      redirect: 'error',
    })
  );
  return z.object({ photo: photoSchema }).parse(await response.json()).photo;
}
export async function loadPhotoBlob(
  schoolId: string,
  id: string,
  version: string,
  signal?: AbortSignal
) {
  const response = await checked(
    schoolFetch(schoolId, endpoint(id), { signal, redirect: 'error' })
  );
  if (response.headers.get('ETag') !== version)
    throw new PhotoRequestError(
      'The photo changed. Reload it to see the current version.',
      409
    );
  if (response.headers.get('Content-Type')?.split(';')[0] !== 'image/webp')
    throw new PhotoRequestError('Unexpected photo response.');
  return response.blob();
}
export function legacyPhotoUrl(reference: string | null) {
  try {
    const url = new URL(reference ?? '');
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export async function savePhoto(
  schoolId: string,
  id: string,
  draft: Exclude<PhotoDraft, null>,
  version: string
) {
  const response = await checked(
    schoolFetch(schoolId, endpoint(id), {
      method: draft.type === 'upload' ? 'PUT' : 'DELETE',
      headers: {
        'If-Match': version,
        ...(draft.type === 'upload' ? { 'Content-Type': draft.file.type } : {}),
      },
      ...(draft.type === 'upload' ? { body: draft.file } : {}),
    })
  );
  return z
    .object({ photo: photoSchema, cleanupPending: z.boolean() })
    .parse(await response.json());
}
export type ProfileInput = z.infer<typeof studentUpdateSchema>;
export type SaveCheckpoint = { fingerprint: string; student: StudentProfile };
export class PartialProfileSaveError extends Error {
  constructor(
    readonly student: StudentProfile,
    readonly cause: unknown
  ) {
    super(
      `Profile details were saved, but the photo change was not confirmed. ${cause instanceof PhotoRequestError ? cause.message : 'Review the current photo before retrying.'}`
    );
  }
}
export async function saveProfileWithPhoto(
  schoolId: string,
  id: string,
  input: ProfileInput,
  draft: PhotoDraft,
  version: string | null,
  checkpoint: SaveCheckpoint | null,
  onProfileSaved: (value: SaveCheckpoint) => void
) {
  if (draft && !version)
    throw new PhotoRequestError('Load the current photo before saving.', 428);
  const payload = { ...input };
  delete payload.imageUrl;
  const fingerprint = JSON.stringify(payload);
  const student =
    draft && checkpoint?.fingerprint === fingerprint
      ? checkpoint.student
      : await updateStudentProfile(schoolId, id, payload);
  onProfileSaved({ fingerprint, student });
  if (!draft) return { student, cleanupPending: false };
  try {
    if (!version)
      throw new PhotoRequestError('Load the current photo before saving.', 428);
    const result = await savePhoto(schoolId, id, draft, version);
    return {
      student: { ...student, imageUrl: result.photo.imageUrl },
      cleanupPending: result.cleanupPending,
    };
  } catch (error) {
    throw new PartialProfileSaveError(student, error);
  }
}
