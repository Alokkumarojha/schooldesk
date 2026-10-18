import { loadTeacherWorkspace, type TeacherClass } from './teachers-client';

export type DatabaseClass = TeacherClass & { studentCount: number };
export type ClassInput = { code: string; name: string; room: string; capacity: number; classTeacherId: string | null };
export class ClassRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function loadClassWorkspace(signal?: AbortSignal) {
  // Reuse the validated, no-store teachers/classes loader without changing its consumers.
  const data = await loadTeacherWorkspace(signal);
  const classes: DatabaseClass[] = data.classes.map(group => {
    if (!('studentCount' in group) || typeof group.studentCount !== 'number' || !Number.isInteger(group.studentCount) || group.studentCount < 0) {
      throw new Error('Invalid class count.');
    }
    return { ...group, studentCount: group.studentCount };
  });
  return { classes, teachers: data.teachers };
}

export async function mutateClass(method: 'POST' | 'PUT' | 'DELETE', id?: string, input?: ClassInput): Promise<void> {
  const response = await fetch(id ? `/api/classes/${encodeURIComponent(id)}/` : '/api/classes/', {
    method, headers: { 'Content-Type': 'application/json' }, ...(input ? { body: JSON.stringify(input) } : {}),
  });
  if (!response.ok) throw new ClassRequestError(response.status === 409
    ? method === 'DELETE' ? 'This class cannot be deleted while it contains students, attendance, or other related records.'
      : 'The class code may already be in use, the teacher may be assigned elsewhere, or capacity may be below the student count. Review your details and try again.'
    : response.status === 404 ? 'The class or teacher is no longer available. Refresh and try again.'
      : response.status === 400 ? 'Please check the class details and try again.' : 'Unable to save class changes. Please try again.', response.status);
}
