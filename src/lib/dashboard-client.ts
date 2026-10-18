import { validNoticeDate, type ApiNotice } from './notices-client';

export type DashboardData = {
  students: { total: number; active: number; inactive: number };
  teachers: { total: number };
  classes: { total: number };
  notices: { total: number };
  enrolment: { activeStudents: number; sections: number; classes: { id: string; code: string; name: string; activeStudentCount: number }[] };
  studentDirectory: { id: string; studentId: string; name: string; status: 'ACTIVE' | 'INACTIVE'; className: string }[];
  attendance: { date: string; totalActiveStudents: number; recordedActiveStudents: number };
  noticeBoard: ApiNotice[];
};

function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function count(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function total(value: unknown) { return object(value) && count(value.total); }
function date(value: unknown) { return typeof value === 'string' && validNoticeDate(value); }
function isDashboard(value: unknown): value is DashboardData {
  if (!object(value)) return false;
  const { students, enrolment, attendance, studentDirectory, noticeBoard } = value;
  return object(students) && count(students.total) && count(students.active) && count(students.inactive) &&
    students.total === students.active + students.inactive && total(value.teachers) && total(value.classes) && total(value.notices) &&
    object(enrolment) && count(enrolment.activeStudents) && count(enrolment.sections) && Array.isArray(enrolment.classes) &&
    enrolment.classes.every(c => object(c) && typeof c.id === 'string' && typeof c.code === 'string' && typeof c.name === 'string' && count(c.activeStudentCount)) &&
    Array.isArray(studentDirectory) && studentDirectory.length <= 4 && studentDirectory.every(s => object(s) &&
      typeof s.id === 'string' && typeof s.studentId === 'string' && typeof s.name === 'string' && typeof s.className === 'string' && (s.status === 'ACTIVE' || s.status === 'INACTIVE')) &&
    object(attendance) && date(attendance.date) && count(attendance.totalActiveStudents) && count(attendance.recordedActiveStudents) &&
    attendance.recordedActiveStudents <= attendance.totalActiveStudents &&
    Array.isArray(noticeBoard) && noticeBoard.length <= 2 && noticeBoard.every(n => object(n) && typeof n.id === 'string' &&
      typeof n.title === 'string' && typeof n.body === 'string' && date(n.date) &&
      (n.audience === 'EVERYONE' || n.audience === 'TEACHERS' || n.audience === 'PARENTS' || n.audience === 'STUDENTS'));
}

export async function loadDashboard(signal?: AbortSignal): Promise<DashboardData> {
  const response = await fetch('/api/dashboard/', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Unable to load dashboard. Please retry.');
  const body: unknown = await response.json();
  if (!isDashboard(body)) throw new Error('Unable to read dashboard. Please retry.');
  return body;
}
