import { z } from 'zod';

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'This field is required.')
    .max(max, `Use at most ${max} characters.`);
const reference = text(128);
const email = text(160).regex(
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  'Enter a valid email address.'
);
export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+91)?[6-9]\d{9}$/,
    'Enter a valid 10-digit Indian mobile number (optional +91).'
  );
const optionalReference = reference
  .nullish()
  .transform((value) => value ?? null);
const optionalEmail = z
  .union([email, z.string().trim().length(0), z.null()])
  .optional()
  .transform((value) => value || null);
// Unknown fields are stripped, retaining the existing allowlisted API contract.
// Identifiers are explicitly rejected rather than silently overwritten.
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(value => value === '' ? null : value);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine(value => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return value.slice(0, 4) !== '0000' && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Enter a valid calendar date.');
const optionalDate = z.union([calendarDate, z.literal(''), z.null()]).optional().transform(value => value === '' ? null : value);
const profileFields = {
  firstName: optionalText(80), middleName: optionalText(80), lastName: optionalText(80),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).nullable().optional(),
  dateOfBirth: optionalDate,
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable().optional(),
  imageUrl: optionalText(2048).refine(value => {
    if (value == null) return true;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
  }, 'Use an HTTPS image URL without credentials.'),
  admissionDate: optionalDate, rollNumber: optionalText(40),
  academicYear: optionalText(9).refine(value => value == null || (/^\d{4}-\d{4}$/.test(value) && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1), 'Use consecutive years, such as 2026-2027.'),
  guardianRelation: optionalText(80),
  alternateGuardianPhone: z.union([phoneSchema, z.literal(''), z.null()]).optional().transform(value => value === '' ? null : value),
  addressLine1: optionalText(240), addressLine2: optionalText(240),
  city: optionalText(100), state: optionalText(100), pincode: optionalText(12), country: optionalText(100),
};
// Intent is not a log entry: the server verifies the transition and builds history.
const studentOperation = z.object({
  type: z.enum(['PROMOTION', 'SECTION_CHANGE', 'TRANSFER']),
  fromClassId: reference,
}).strict();
const studentFields = {
  ...profileFields,
  name: text(80),
  classId: reference,
  guardianName: text(80),
  guardianEmail: optionalEmail,
  guardianPhone: phoneSchema,
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED', 'TRANSFERRED']),
  id: z.never().optional(),
  studentId: z.never().optional(),
};
export const studentUpdateSchema = z.object({ ...studentFields, operation: studentOperation.optional() });
export const studentCreateSchema = z.object({
  ...studentFields,
  status: studentFields.status.default('ACTIVE'),
  operation: z.never().optional(),
});
export const teacherCreateSchema = z.object({
  name: text(80),
  subject: text(100),
  email: email.transform((value) => value.toLowerCase()),
  phone: phoneSchema,
  classId: optionalReference,
  id: z.never().optional(),
  teacherId: z.never().optional(),
});
export const teacherUpdateSchema = teacherCreateSchema;
export const classCreateSchema = z.object({
  code: text(40),
  name: text(100),
  room: text(80),
  capacity: z.number().int().min(1).max(1000),
  classTeacherId: optionalReference,
  id: z.never().optional(),
});
export const classUpdateSchema = classCreateSchema;

export function validationFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    fields[field] ??= issue.message;
  }
  return fields;
}

/** Never build a dial URI from unvalidated stored or user-entered text. */
export function phoneHref(value: string | null | undefined): string | null {
  const parsed = phoneSchema.safeParse(value);
  return parsed.success ? `tel:${parsed.data.replace(/[ ()-]/g, '')}` : null;
}
