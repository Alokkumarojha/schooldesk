import { z } from 'zod';

export const schoolBoards = ['CBSE', 'ICSE', 'STATE_BOARD', 'IB', 'OTHER'] as const;
const optionalText = (max: number) => z.string().trim().max(max, `Use at most ${max} characters.`).nullable().transform(value => value || null);
const optionalMatch = (max: number, pattern: RegExp, message: string) => optionalText(max).refine(value => value === null || pattern.test(value), message);

export const academicYearSchema = optionalText(9).refine(value => {
  if (value === null) return true;
  const match = /^(\d{4})-(\d{4})$/.exec(value);
  return !!match && Number(match[1]) >= 1900 && Number(match[2]) === Number(match[1]) + 1;
}, 'Use consecutive years in YYYY-YYYY format, for example 2026-2027.');

export const schoolSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Enter the school name.').max(160, 'Use at most 160 characters.'),
  code: optionalMatch(40, /^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens or underscores.'),
  logoUrl: optionalText(2048).refine(value => {
    if (value === null) return true;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
    catch { return false; }
  }, 'Use a valid HTTPS image URL without credentials.'),
  addressLine: optionalText(240),
  city: optionalText(100),
  state: optionalText(100),
  pincode: optionalMatch(12, /^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/, 'Use a 3–12 character postal code.'),
  board: z.enum(schoolBoards).nullable(),
  academicYear: academicYearSchema,
  phone: optionalMatch(40, /^\+?[0-9][0-9 ()-]{5,39}$/, 'Enter a phone number using digits, spaces, +, parentheses or hyphens.')
    .refine(value => value === null || value.replace(/\D/g, '').length >= 6, 'Enter a phone number with at least six digits.'),
  email: optionalText(160).refine(value => value === null || z.email().safeParse(value).success, 'Enter a valid email address.'),
}).strict();

// PATCH accepts only supported profile fields, never IDs, roles, slug or relations.
export const schoolSettingsPatchSchema = schoolSettingsSchema.partial().refine(value => Object.keys(value).length > 0, 'Change at least one school setting.');
export type SchoolSettingsValues = z.output<typeof schoolSettingsSchema>;

// Read existing stored strings without rewriting legacy values during a GET.
const storedText = z.string().nullable();
export const schoolSettingsResponseSchema = z.object({
  school: z.object({ id: z.string(), name: z.string(), code: storedText, logoUrl: storedText,
    addressLine: storedText, city: storedText, state: storedText, pincode: storedText,
    board: z.enum(schoolBoards).nullable(), academicYear: storedText, phone: storedText, email: storedText }),
  canEdit: z.boolean(),
});
export type SchoolSettings = z.infer<typeof schoolSettingsResponseSchema>['school'];

export const settingsLabels: Record<keyof SchoolSettingsValues, string> = {
  name: 'School name', code: 'School code', logoUrl: 'Logo URL', addressLine: 'Address',
  city: 'City', state: 'State', pincode: 'Pincode / postal code', board: 'Board',
  academicYear: 'Academic year', phone: 'Contact phone', email: 'Contact email',
};
export const setupSteps: { id: string; title: string; fields: (keyof SchoolSettingsValues)[]; optional?: boolean }[] = [
  { id: 'identity', title: 'School identity', fields: ['name', 'code'] },
  { id: 'academics', title: 'Academic configuration', fields: ['board', 'academicYear'] },
  { id: 'contact', title: 'Contact information', fields: ['email', 'phone'] },
  { id: 'location', title: 'School address', fields: ['addressLine', 'city', 'state', 'pincode'] },
  { id: 'branding', title: 'School logo', fields: ['logoUrl'], optional: true },
];

export function schoolSetupChecklist(school: SchoolSettingsValues) {
  return setupSteps.map(step => ({ ...step, missing: step.fields.filter(field =>
    !school[field]?.trim() || !schoolSettingsSchema.shape[field].safeParse(school[field]).success) }));
}

export function settingsValidationMessages(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = typeof issue.path[0] === 'string' ? issue.path[0] : '_form';
    fields[key] ??= key === '_form' ? 'Provide only supported school settings and change at least one field.' : issue.message;
  }
  return fields;
}

export function academicSessionLabel(value: string | null) {
  return value?.trim() || 'Not configured';
}
