import { schoolFetch } from './school-fetch';
import type { Student } from './demo';
import { isStudentStatus, studentStatusLabels, type StudentStatus } from './student-status';

export type ApiClass = {
  id: string;
  code: string;
  name: string;
  room: string;
  capacity: number;
};
export type StudentClass = ApiClass & { studentCount: number };
export type ApiStudent = {
  id: string;
  studentId: string;
  name: string;
  classId: string;
  guardianName: string;
  guardianEmail: string | null;
  guardianPhone: string;
  status: StudentStatus;
  class: ApiClass;
};
export type StudentRow = Student & {
  studentId?: string;
  className?: string;
  guardianPhone: string;
};
export type StudentInput = {
  name: string;
  classId: string;
  guardianName: string;
  guardianEmail?: string;
  guardianPhone: string;
  status: StudentStatus;
};

export class StudentRequestError extends Error {}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isClass(value: unknown): value is ApiClass {
  return (
    object(value) &&
    ['id', 'code', 'name', 'room'].every(
      (key) => typeof value[key] === 'string'
    ) &&
    typeof value.capacity === 'number'
  );
}
function isStudent(value: unknown): value is ApiStudent {
  if (!object(value) || !isClass(value.class)) return false;
  return (
    [
      'id',
      'studentId',
      'name',
      'classId',
      'guardianName',
      'guardianPhone',
    ].every((key) => typeof value[key] === 'string') &&
    (value.guardianEmail === null || typeof value.guardianEmail === 'string') &&
    isStudentStatus(value.status) &&
    value.classId === value.class.id
  );
}

export function studentRow(student: ApiStudent): StudentRow {
  return {
    id: student.id,
    studentId: student.studentId,
    name: student.name,
    classId: student.class.code,
    className: student.class.name,
    guardian: student.guardianName,
    email: student.guardianEmail ?? '',
    guardianPhone: student.guardianPhone,
    status: studentStatusLabels[student.status],
  };
}

export async function loadStudents(
  schoolId: string,
  signal: AbortSignal
): Promise<ApiStudent[]> {
  const response = await schoolFetch(schoolId, '/api/students/', {
    cache: 'no-store',
    signal,
  });
  if (!response.ok)
    throw new Error('Unable to load students. Please try again.');
  const body: unknown = await response.json();
  if (
    !object(body) ||
    !Array.isArray(body.students) ||
    !body.students.every(isStudent)
  ) {
    throw new Error('Unable to read student records. Please try again.');
  }
  return body.students;
}

export async function loadClasses(
  schoolId: string,
  signal: AbortSignal
): Promise<StudentClass[]> {
  const response = await schoolFetch(schoolId, '/api/classes/', {
    cache: 'no-store',
    signal,
  });
  if (!response.ok)
    throw new StudentRequestError('Unable to load classes. Please try again.');
  const body: unknown = await response.json();
  const isStudentClass = (value: unknown): value is StudentClass =>
    isClass(value) &&
    'studentCount' in value &&
    typeof value.studentCount === 'number' &&
    Number.isSafeInteger(value.studentCount) &&
    value.studentCount >= 0;
  if (
    !object(body) ||
    !Array.isArray(body.classes) ||
    !body.classes.every(isStudentClass)
  ) {
    throw new StudentRequestError(
      'Unable to read class information. Please try again.'
    );
  }
  // Include every class, regardless of studentCount or teacher assignment.
  return body.classes;
}

async function requestError(
  response: Response,
  operation: 'save' | 'delete'
): Promise<StudentRequestError> {
  const status = response.status;
  if (status === 401)
    return new StudentRequestError(
      'Your session has expired. Sign in again before continuing.'
    );
  if (status === 403)
    return new StudentRequestError(
      'You do not have permission to manage students in this school.'
    );
  if (status === 503)
    return new StudentRequestError(
      'School data is temporarily unavailable. Please try again.'
    );
  if (status === 409) {
    if (operation === 'delete')
      return new StudentRequestError(
        'This student has related records and cannot be deleted.'
      );
    const body: unknown = await response.json().catch(() => null);
    return new StudentRequestError(
      object(body) && body.code === 'CLASS_CAPACITY_EXCEEDED'
        ? 'The selected class has reached its capacity. Active and inactive students both occupy a seat. Choose another class.'
        : 'Student or class information changed. Refresh the student list and try again.'
    );
  }
  if (status === 404)
    return new StudentRequestError(
      'The student or class is no longer available. Refresh the student list and try again.'
    );
  if (status === 400)
    return new StudentRequestError(
      'Please check the student details and try again.'
    );
  return new StudentRequestError(
    'Unable to save your changes. Please try again.'
  );
}

export async function saveStudent(
  schoolId: string,
  input: StudentInput,
  id?: string
): Promise<ApiStudent> {
  const response = await schoolFetch(
    schoolId,
    id ? `/api/students/${encodeURIComponent(id)}/` : '/api/students/',
    {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  if (!response.ok) throw await requestError(response, 'save');
  const body: unknown = await response.json();
  if (!object(body) || !isStudent(body.student))
    throw new StudentRequestError(
      'Unable to read the saved student. Refresh the list before trying again.'
    );
  return body.student;
}

export async function deleteStudent(
  schoolId: string,
  id: string
): Promise<void> {
  const response = await schoolFetch(
    schoolId,
    `/api/students/${encodeURIComponent(id)}/`,
    { method: 'DELETE' }
  );
  if (!response.ok) throw await requestError(response, 'delete');
}
