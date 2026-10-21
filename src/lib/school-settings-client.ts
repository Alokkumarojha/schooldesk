import { z } from 'zod';
import { schoolFetch } from './school-fetch';
import { schoolSettingsResponseSchema, type SchoolSettingsValues } from './school-settings';

export class SchoolSettingsError extends Error {
  constructor(message: string, readonly fields: Record<string, string> = {}) { super(message); }
}

async function readResponse(response: Response, schoolId: string) {
  if (!response.ok) {
    const failure = z.object({ error: z.string(), fields: z.record(z.string(), z.string()).optional() }).safeParse(await response.json().catch(() => null));
    throw new SchoolSettingsError(failure.success ? failure.data.error : 'Unable to load or save school settings. Please retry.', failure.success ? failure.data.fields : undefined);
  }
  const result = schoolSettingsResponseSchema.safeParse(await response.json());
  if (!result.success || result.data.school.id !== schoolId) throw new SchoolSettingsError('Unable to verify school settings. Reload the page.');
  return result.data;
}

export async function loadSchoolSettings(schoolId: string, signal: AbortSignal) {
  return readResponse(await schoolFetch(schoolId, '/api/school/settings/', { signal }), schoolId);
}

export async function saveSchoolSettings(schoolId: string, input: Partial<SchoolSettingsValues>) {
  return readResponse(await schoolFetch(schoolId, '/api/school/settings/', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }), schoolId);
}
