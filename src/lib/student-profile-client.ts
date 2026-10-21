import { z } from 'zod';
import { schoolFetch } from './school-fetch';
import { studentStatuses } from './student-status';
import { studentUpdateSchema } from './management-validation';

const nullableText = z.string().nullable();
export const studentProfileSchema = z.object({
  id: z.string(), studentId: z.string(), name: z.string(), classId: z.string(),
  guardianName: z.string(), guardianPhone: z.string(), guardianEmail: nullableText,
  status: z.enum(studentStatuses),
  firstName: nullableText, middleName: nullableText, lastName: nullableText,
  gender: nullableText, dateOfBirth: nullableText, bloodGroup: nullableText, imageUrl: nullableText,
  admissionDate: nullableText, rollNumber: nullableText, academicYear: nullableText,
  guardianRelation: nullableText, alternateGuardianPhone: nullableText,
  addressLine1: nullableText, addressLine2: nullableText, city: nullableText,
  state: nullableText, pincode: nullableText, country: nullableText,
  class: z.object({ id: z.string(), code: z.string(), name: z.string(), room: z.string(), capacity: z.number() }),
}).refine(student => student.classId === student.class.id);
export type StudentProfile = z.infer<typeof studentProfileSchema>;
const profileEnvelope = z.object({
  student: studentProfileSchema,
  permissions: z.object({ canEdit: z.boolean(), canAddRemark: z.literal(false) }),
});
export type ProfileData = z.infer<typeof profileEnvelope>;
export const historyEventSchema = z.object({
  id: z.string(), studentId: z.string(), logType: z.string(), title: z.string(), description: nullableText,
  fromClassId: nullableText, toClassId: nullableText,
  fromClassNameSnapshot: nullableText, toClassNameSnapshot: nullableText,
  fromClassCodeSnapshot: nullableText, toClassCodeSnapshot: nullableText,
  fromStatus: z.enum(studentStatuses).nullable(), toStatus: z.enum(studentStatuses).nullable(),
  academicYear: nullableText, studentIdSnapshot: z.string(), studentNameSnapshot: z.string(),
  createdById: nullableText, createdAt: z.string().datetime(),
  creator: z.object({ name: nullableText, role: z.string() }).nullable().optional(),
  // Read support only; the current database cannot yet persist categories.
  remarkCategory: z.enum(['POSITIVE', 'NEEDS_IMPROVEMENT', 'GENERAL']).nullable().optional(),
});
export type HistoryEvent = z.infer<typeof historyEventSchema>;
const historyPage = z.object({ history: z.array(historyEventSchema), limit: z.number().int(), nextCursor: nullableText });
export type HistoryPage = z.infer<typeof historyPage>;

export class ProfileRequestError extends Error {
  constructor(message: string, readonly fields: Record<string, string> = {}) { super(message); }
}
async function check(response: Response) {
  if (response.ok) return;
  if (response.status === 400) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = z.object({ fields: z.record(z.string(), z.string()).optional() }).safeParse(body);
    throw new ProfileRequestError('Please review the highlighted details.', parsed.success ? parsed.data.fields : {});
  }
  const messages: Record<number, string> = {
    401: 'Sign in again to continue.', 403: 'You do not have permission to access or change this record.',
    404: 'This student is unavailable in your active school.',
    409: 'The class may be full or another change conflicts with this update. Reload class choices and try again.',
    503: 'School data is temporarily unavailable. Please retry.',
  };
  throw new ProfileRequestError(messages[response.status] ?? 'Unable to complete the request. Please retry.');
}
export async function loadStudentProfile(schoolId: string, id: string, signal?: AbortSignal): Promise<ProfileData> {
  const response = await schoolFetch(schoolId, `/api/students/${encodeURIComponent(id)}/`, { signal });
  await check(response);
  const data = profileEnvelope.parse(await response.json());
  if (data.student.id !== id) throw new Error('Unexpected student response.');
  return data;
}
export async function updateStudentProfile(schoolId: string, id: string, input: z.infer<typeof studentUpdateSchema>): Promise<StudentProfile> {
  const response = await schoolFetch(schoolId, `/api/students/${encodeURIComponent(id)}/`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  await check(response);
  const data = z.object({ student: studentProfileSchema }).parse(await response.json());
  if (data.student.id !== id) throw new Error('Unexpected student response.');
  return data.student;
}
export async function loadStudentHistory(schoolId: string, id: string, cursor?: string, signal?: AbortSignal): Promise<HistoryPage> {
  const query = new URLSearchParams({ limit: '20', ...(cursor ? { cursor } : {}) });
  const response = await schoolFetch(schoolId, `/api/students/${encodeURIComponent(id)}/history/?${query}`, { signal });
  await check(response);
  const data = historyPage.parse(await response.json());
  if (data.history.some(event => event.studentId !== id)) throw new Error('Unexpected history response.');
  return data;
}
