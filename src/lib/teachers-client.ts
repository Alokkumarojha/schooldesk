import { schoolFetch } from './school-fetch';
import type { Teacher } from './demo';
import type { ApiClass } from './students-client';

export type ApiTeacher = {
  id: string;
  teacherId: string;
  name: string;
  subject: string;
  email: string;
  phone: string;
  classTeacherOf: ApiClass | null;
};
export type TeacherClass = ApiClass & {
  classTeacher: Omit<ApiTeacher, 'classTeacherOf'> | null;
};
export type TeacherRow = Teacher & { teacherId: string; className: string; phone: string };
export type TeacherInput = {
  name: string;
  subject: string;
  email: string;
  phone: string;
  classId: string | null;
};
export class TeacherRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function teacherFields(
  value: unknown
): value is Omit<ApiTeacher, 'classTeacherOf'> {
  return (
    object(value) &&
    ['id', 'teacherId', 'name', 'subject', 'email', 'phone'].every(
      (key) => typeof value[key] === 'string'
    )
  );
}
function classFields(value: unknown): value is ApiClass {
  return (
    object(value) &&
    ['id', 'code', 'name', 'room'].every(
      (key) => typeof value[key] === 'string'
    ) &&
    typeof value.capacity === 'number'
  );
}
function isTeacher(value: unknown): value is ApiTeacher {
  return (
    object(value) &&
    teacherFields(value) &&
    'classTeacherOf' in value &&
    (value.classTeacherOf === null || classFields(value.classTeacherOf))
  );
}
function isClass(value: unknown): value is TeacherClass {
  return (
    object(value) &&
    classFields(value) &&
    'classTeacher' in value &&
    (value.classTeacher === null || teacherFields(value.classTeacher))
  );
}
export async function loadTeacherWorkspace(schoolId: string, signal?: AbortSignal
): Promise<{ teachers: ApiTeacher[]; classes: TeacherClass[] }> {
  const responses = await Promise.all(
    ['/api/teachers/', '/api/classes/'].map((url) =>
      schoolFetch(schoolId, url, { cache: 'no-store', signal })
    )
  );
  if (responses.some((response) => !response.ok))
    throw new Error('Unable to load teachers and classes.');
  const teachers: unknown = await responses[0].json();
  const classes: unknown = await responses[1].json();
  if (
    !object(teachers) ||
    !Array.isArray(teachers.teachers) ||
    !teachers.teachers.every(isTeacher) ||
    !object(classes) ||
    !Array.isArray(classes.classes) ||
    !classes.classes.every(isClass)
  )
    throw new Error('Invalid teacher data.');
  return { teachers: teachers.teachers, classes: classes.classes };
}
export function teacherRow(teacher: ApiTeacher): TeacherRow {
  return {
    id: teacher.id,
    teacherId: teacher.teacherId,
    name: teacher.name,
    subject: teacher.subject,
    email: teacher.email,
    phone: teacher.phone,
    classId: teacher.classTeacherOf?.code ?? '',
    className: teacher.classTeacherOf?.name ?? 'Unassigned',
  };
}
export async function mutateTeacher(schoolId: string, method: 'POST' | 'PUT' | 'DELETE',
  id?: string,
  input?: TeacherInput
): Promise<void> {
  const response = await schoolFetch(schoolId,
    id ? `/api/teachers/${encodeURIComponent(id)}/` : '/api/teachers/',
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(input ? { body: JSON.stringify(input) } : {}),
    }
  );
  if (!response.ok) {
    let message: string;

    if (response.status === 409) {
      message =
        method === 'DELETE'
          ? 'This teacher cannot be deleted because related records exist.'
          : 'This email or class assignment conflicts with another record. Review the refreshed class choices and try again.';
    } else if (response.status === 404) {
      message =
        'The teacher or class is no longer available. Refresh and try again.';
    } else if (response.status === 400) {
      message = 'Please check the teacher details and try again.';
    } else {
      message =
        method === 'DELETE'
          ? 'Unable to delete teacher. Please try again.'
          : 'Unable to save your changes. Please try again.';
    }

    throw new TeacherRequestError(message, response.status);
  }
}
