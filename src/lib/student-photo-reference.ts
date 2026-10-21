import 'server-only';
import { createHash, randomUUID } from 'node:crypto';

const prefix = 'cld-auth:v1:';
function scope(schoolId: string, studentId: string) {
  return createHash('sha256').update(JSON.stringify([schoolId, studentId])).digest('hex');
}
export function newPhotoReference(schoolId: string, studentId: string) {
  return `${prefix}schooldesk/student-photos/${scope(schoolId, studentId)}/${randomUUID()}`;
}
export function photoPublicId(reference: string | null, schoolId: string, studentId: string): string | null {
  const start = `${prefix}schooldesk/student-photos/${scope(schoolId, studentId)}/`;
  if (!reference?.startsWith(start) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(reference.slice(start.length))) return null;
  return reference.slice(prefix.length);
}
export function isManagedPhoto(reference: string | null) { return reference?.startsWith('cld-auth:') ?? false; }
export function photoVersion(reference: string | null) {
  return `"photo-${createHash('sha256').update(reference ?? '').digest('hex')}"`;
}
