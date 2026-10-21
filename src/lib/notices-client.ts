import { schoolFetch } from './school-fetch';
import type { Notice } from './demo';

export type NoticeAudience = 'EVERYONE' | 'TEACHERS' | 'PARENTS' | 'STUDENTS';
export type NoticeInput = { title: string; body: string; audience: NoticeAudience; date: string };
export type ApiNotice = NoticeInput & { id: string };
export type NoticesResponse = { notices: ApiNotice[] };
const labels: Record<NoticeAudience, string> = { EVERYONE: 'Everyone', TEACHERS: 'Teachers', PARENTS: 'Parents', STUDENTS: 'Students' };
export function noticeAudience(label: string): NoticeAudience {
  switch (label) {
    case 'Everyone': return 'EVERYONE';
    case 'Teachers': return 'TEACHERS';
    case 'Parents': return 'PARENTS';
    case 'Students': return 'STUDENTS';
    default: throw new Error('Choose a supported audience.');
  }
}
export function noticeRow(notice: ApiNotice): Notice { return { ...notice, audience: labels[notice.audience] }; }
export function validNoticeDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000-')) return false;
  const day = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === date;
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isNotice(value: unknown): value is ApiNotice {
  return object(value) && typeof value.id === 'string' && typeof value.title === 'string' && typeof value.body === 'string' &&
    typeof value.date === 'string' && validNoticeDate(value.date) &&
    (value.audience === 'EVERYONE' || value.audience === 'TEACHERS' || value.audience === 'PARENTS' || value.audience === 'STUDENTS');
}
export async function loadNotices(schoolId: string, signal?: AbortSignal): Promise<ApiNotice[]> {
  const response = await schoolFetch(schoolId, '/api/notices/', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Unable to load notices. Please retry.');
  const body: unknown = await response.json();
  if (!object(body) || !Array.isArray(body.notices) || !body.notices.every(isNotice)) throw new Error('Unable to read notices. Please retry.');
  return body.notices;
}
export class NoticeRequestError extends Error {}
export async function mutateNotice(schoolId: string, method: 'POST' | 'PUT' | 'DELETE', id?: string, input?: NoticeInput): Promise<void> {
  const response = await schoolFetch(schoolId, id ? `/api/notices/${encodeURIComponent(id)}/` : '/api/notices/', {
    method, headers: { 'Content-Type': 'application/json' }, ...(input ? { body: JSON.stringify(input) } : {}),
  });
  if (!response.ok) throw new NoticeRequestError(response.status === 404 ? 'This notice is no longer available. Reload the notices list.'
    : response.status === 400 ? 'Please check the notice details and date.' : 'Unable to save your changes. Please try again.');
  if (method !== 'DELETE') {
    const body: unknown = await response.json();
    if (!object(body) || !isNotice(body.notice)) throw new NoticeRequestError('Unable to confirm saved notice. Reload the list before trying again.');
  }
}
