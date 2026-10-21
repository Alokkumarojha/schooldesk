// Explicit per-call context avoids module-global state leaking between schools.
export function schoolFetch(schoolId: string, url: string, init: RequestInit = {}) {
  if (!schoolId.trim()) throw new Error('School context is unavailable. Reload the page.');
  const headers = new Headers(init.headers);
  headers.set('X-School-Id', schoolId);
  return fetch(url, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
}
