import type { Mark } from './demo';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE';
export type AttendanceStudent = {
  id: string;
  studentId: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
};
export type AttendanceRecord = {
  id: string;
  studentId: string;
  status: AttendanceStatus;
};
export type AttendanceSession = {
  id: string | null;
  classId: string;
  date: string;
  exists: boolean;
  records: AttendanceRecord[];
};
export type AttendanceResponse = {
  attendance: AttendanceSession;
  students: AttendanceStudent[];
};
export type AttendanceInput = {
  classId: string;
  date: string;
  records: { studentId: string; status: AttendanceStatus }[];
};
const toUI: Record<AttendanceStatus, Mark> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
};
const toAPI: Record<Mark, AttendanceStatus> = {
  Present: 'PRESENT',
  Absent: 'ABSENT',
  Late: 'LATE',
};
export function attendanceMarks(
  session: AttendanceSession
): Record<string, Mark> {
  return Object.fromEntries(
    session.records.map((record) => [record.studentId, toUI[record.status]])
  );
}
export function attendanceInput(
  classId: string,
  date: string,
  students: AttendanceStudent[],
  marks: Record<string, Mark>
): AttendanceInput {
  return {
    classId,
    date,
    records: students.map((student) => {
      const mark = marks[student.id];
      if (!mark) throw new Error('Mark every student before saving.');
      return { studentId: student.id, status: toAPI[mark] };
    }),
  };
}
export function validAttendanceDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000-'))
    return false;
  const day = new Date(`${date}T00:00:00.000Z`);
  return (
    Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === date
  );
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isRecord(value: unknown): value is AttendanceRecord {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.studentId === 'string' &&
    (value.status === 'PRESENT' ||
      value.status === 'ABSENT' ||
      value.status === 'LATE')
  );
}
function isStudent(value: unknown): value is AttendanceStudent {
  return (
    object(value) &&
    ['id', 'studentId', 'name'].every(
      (key) => typeof value[key] === 'string'
    ) &&
    (value.status === 'ACTIVE' || value.status === 'INACTIVE')
  );
}
function isSession(
  value: unknown,
  classId: string,
  date: string
): value is AttendanceSession {
  return (
    object(value) &&
    value.classId === classId &&
    value.date === date &&
    typeof value.exists === 'boolean' &&
    (value.exists ? typeof value.id === 'string' : value.id === null) &&
    Array.isArray(value.records) &&
    value.records.every(isRecord) &&
    (value.exists || value.records.length === 0) &&
    new Set(value.records.map((record) => record.studentId)).size ===
      value.records.length
  );
}
export async function loadAttendance(
  classId: string,
  date: string,
  signal?: AbortSignal
): Promise<AttendanceResponse> {
  const response = await fetch(
    `/api/attendance/?${new URLSearchParams({ classId, date })}`,
    { cache: 'no-store', signal }
  );
  if (!response.ok)
    throw new Error(
      'Unable to load attendance. Check the class/date and retry.'
    );
  const body: unknown = await response.json();
  if (
    !object(body) ||
    !isSession(body.attendance, classId, date) ||
    !Array.isArray(body.students) ||
    !body.students.every(isStudent)
  )
    throw new Error('Unable to read attendance. Please retry.');
  const studentIds = new Set(body.students.map((student) => student.id));
  if (
    studentIds.size !== body.students.length ||
    (body.attendance.exists &&
      (body.attendance.records.length !== studentIds.size ||
        body.attendance.records.some(
          (record) => !studentIds.has(record.studentId)
        )))
  ) {
    throw new Error(
      'Unable to read the saved attendance roster. Please retry.'
    );
  }
  return { attendance: body.attendance, students: body.students };
}
export async function saveAttendance(
  input: AttendanceInput
): Promise<AttendanceSession> {
  const response = await fetch('/api/attendance/', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok)
    throw new Error(
      response.status === 400 || response.status === 409
        ? 'The class roster or attendance may have changed. Discard local changes and reload before trying again.'
        : response.status === 404
          ? 'This class is no longer available. Reload the page.'
          : 'Unable to save attendance. Please try again.'
    );
  const body: unknown = await response.json();
  if (
    !object(body) ||
    !isSession(body.attendance, input.classId, input.date) ||
    !body.attendance.exists
  )
    throw new Error(
      'Unable to confirm saved attendance. Reload before trying again.'
    );
  const submitted = new Map(
    input.records.map((record) => [record.studentId, record.status])
  );
  if (
    body.attendance.records.length !== submitted.size ||
    body.attendance.records.some(
      (record) => submitted.get(record.studentId) !== record.status
    )
  ) {
    throw new Error(
      'Unable to confirm saved attendance. Reload before trying again.'
    );
  }
  return body.attendance;
}
