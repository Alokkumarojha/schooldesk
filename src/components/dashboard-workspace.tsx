'use client';

import { useEffect, useState } from 'react';
import { loadDashboard, type DashboardData } from '@/lib/dashboard-client';
import type { Section } from '@/lib/demo';
import { Dashboard } from './dashboard';
import { Empty } from './ui';

export function DashboardWorkspace({ schoolId, academicYear, onNavigate, onCount }: { schoolId: string; academicYear: string | null; onNavigate: (section: Section) => void; onCount: (count: number) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(schoolId, controller.signal).then(value => { if (!controller.signal.aborted) { setData(value); onCount(value.notices.total); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [revision, onCount, schoolId]);
  if (error) return <section className="panel"><div role="alert"><Empty title="Dashboard could not be loaded"
    body="Check your connection and try again." action={<button className="button" onClick={() => { setError(false); setRevision(value => value + 1); }}>Retry</button>} /></div></section>;
  if (!data) return <section className="panel"><div className="empty" role="status">Loading dashboard…</div></section>;
  return <Dashboard dashboard={data} academicYear={academicYear} onNavigate={onNavigate} />;
}
