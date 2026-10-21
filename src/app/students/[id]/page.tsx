import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AccessError } from '@/lib/auth';
import { requireDashboardIdentity } from '@/lib/dashboard-identity';
import { getPrisma } from '@/lib/prisma';
import { StudentProfilePage } from '@/components/student-profile-page';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  let identity;
  try { identity = await requireDashboardIdentity(); }
  catch (error) {
    if (error instanceof AccessError) {
      if (error.code === 'UNAUTHENTICATED') redirect('/sign-in');
      return <main className="content"><h1>School access unavailable</h1><p>{error.message}</p><Link className="button" href="/">Return to SchoolDesk</Link></main>;
    }
    throw error;
  }
  const { id } = await params;
  const noticeCount = await getPrisma().notice.count({ where: { schoolId: identity.school.id } });
  return <StudentProfilePage key={`${identity.school.id}:${id}`} studentId={id} identity={identity} noticeCount={noticeCount} />;
}
