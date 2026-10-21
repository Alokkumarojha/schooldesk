import { redirect } from 'next/navigation';
import { AccessError } from '@/lib/auth';
import { requireDashboardIdentity, type DashboardIdentity } from '@/lib/dashboard-identity';
import SchoolDeskClient from '@/components/schooldesk-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let identity: DashboardIdentity;

  try {
    identity = await requireDashboardIdentity();
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.code === 'UNAUTHENTICATED') {
        redirect('/sign-in');
      }

      if (error.code === 'SCHOOL_ACCESS_DENIED' || error.code === 'ROLE_FORBIDDEN') {
        return <main><h1>School access unavailable</h1><p>A single active school membership with management access is required. Contact your school administrator if no school or multiple schools are assigned.</p></main>;
      }
    }

    throw error;
  }

  return <SchoolDeskClient key={identity.school.id} schoolId={identity.school.id} schoolName={identity.school.name} academicYear={identity.school.academicYear} user={identity.user} />;
}
