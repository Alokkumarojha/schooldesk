'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DashboardIdentity } from '@/lib/dashboard-identity';
import { initials, type Section } from '@/lib/demo';
import {
  loadStudentProfile,
  ProfileRequestError,
  type ProfileData,
  type StudentProfile,
} from '@/lib/student-profile-client';
import { humanLabel, profileSections } from '@/lib/student-profile-fields';
import { studentStatusLabels } from '@/lib/student-status';
import { phoneHref } from '@/lib/management-validation';
import { Sidebar, Topbar } from './navigation';
import { Empty, StatusBadge } from './ui';
import { StudentProfileForm } from './student-profile-form';
import { StudentHistoryTimeline } from './student-history-timeline';

const tabs = [
  'Personal',
  'Academic',
  'Guardian',
  'Address',
  'History',
] as const;
type Tab = (typeof tabs)[number];
function StudentPhoto({ student }: { student: StudentProfile }) {
  const [failed, setFailed] = useState(false);
  let safeUrl: string | null = null;
  try {
    const url = new URL(student.imageUrl ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password)
      safeUrl = url.href;
  } catch {}
  return (
    <div className="student-photo">
      {safeUrl && !failed ? (
        <Image
          src={safeUrl}
          width={88}
          height={88}
          unoptimized
          alt={`${student.name}'s photo`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={`Initials for ${student.name}`}>
          {initials(student.name) || 'S'}
        </span>
      )}
    </div>
  );
}
function ProfileDetails({
  student,
  tab,
}: {
  student: StudentProfile;
  tab: Tab;
}) {
  const section = profileSections.find((section) => section.title === tab);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{tab} details</h2>
      </div>
      <dl className="student-detail-grid profile-details">
        {tab === 'Academic' && (
          <div>
            <dt>Admission number</dt>
            <dd>{student.studentId}</dd>
          </div>
        )}
        {section?.fields.map((field) => {
          const stored = student[field.name];
          const value =
            field.name === 'classId'
              ? student.class.name
              : typeof stored === 'string'
                ? stored
                : null;
          return (
            <div key={field.name}>
              <dt>{field.label}</dt>
              <dd>
                {!value ? (
                  <span className="secondary">Not provided</span>
                ) : field.name === 'status' ? (
                  studentStatusLabels[student.status]
                ) : field.name === 'gender' ? (
                  humanLabel(value)
                ) : field.type === 'tel' && phoneHref(value) ? (
                  <span className="profile-phone">
                    <span>{value}</span>
                    <a
                      href={phoneHref(value)!}
                      className="button"
                      aria-label={`Call ${field.label}: ${value}`}
                    >
                      ☎ Call
                    </a>
                  </span>
                ) : (
                  value
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
export function StudentProfilePage({
  studentId,
  identity,
  noticeCount,
}: {
  studentId: string;
  identity: DashboardIdentity;
  noticeCount: number;
}) {
  const router = useRouter();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<Tab>('Personal');
  const [editing, setEditing] = useState(false);
  const [success, setSuccess] = useState('');
  const tablist = useRef<HTMLDivElement>(null);
  const { school } = identity;
  useEffect(() => {
    const controller = new AbortController();
    loadStudentProfile(school.id, studentId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError('');
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof ProfileRequestError
              ? failure.message
              : 'Student profile could not be loaded. Please retry.'
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [school.id, studentId, revision]);
  const navigate = (section: Section) =>
    router.push(`/#${section.toLowerCase()}`);
  const navigation = {
    section: 'Students' as const,
    schoolName: school.name,
    academicYear: school.academicYear,
    noticeCount,
    onNavigate: navigate,
  };
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft')
      next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next]);
    tablist.current
      ?.querySelectorAll<HTMLButtonElement>('[role=tab]')
      [next]?.focus();
  }
  return (
    <div className="shell">
      <a href="#student-profile-content" className="skip-link">
        Skip to student profile
      </a>
      <Sidebar {...navigation} />
      <div className="main">
        <Topbar {...navigation} user={identity.user} />
        <main
          className="content student-profile-page"
          id="student-profile-content"
        >
          <Link href="/#students" className="button profile-back">
            ← Back to Students
          </Link>
          {success && (
            <p role="status" className="settings-success">
              {success}
            </p>
          )}
          {loading ? (
            <section className="panel">
              <div className="empty" role="status">
                Loading student profile…
              </div>
            </section>
          ) : error ? (
            <section className="panel">
              <div role="alert">
                <Empty
                  title="Profile unavailable"
                  body={error}
                  action={
                    <button
                      className="button"
                      onClick={() => {
                        setLoading(true);
                        setRevision((value) => value + 1);
                      }}
                    >
                      Retry profile
                    </button>
                  }
                />
              </div>
            </section>
          ) : (
            data && (
              <>
                <header className="panel student-profile-header">
                  <StudentPhoto
                    key={data.student.imageUrl ?? 'initials'}
                    student={data.student}
                  />
                  <div className="student-profile-heading">
                    <p className="secondary">Student profile</p>
                    <h1>{data.student.name}</h1>
                    <div className="student-profile-meta">
                      <span>Admission no. {data.student.studentId}</span>
                      <span>{data.student.class.name}</span>
                      <StatusBadge
                        status={studentStatusLabels[data.student.status]}
                      />
                    </div>
                  </div>
                  {data.permissions.canEdit && (
                    <button
                      className="button primary"
                      onClick={() => {
                        setSuccess('');
                        setEditing(true);
                      }}
                    >
                      Edit profile
                    </button>
                  )}
                </header>
                <div
                  className="student-profile-tabs"
                  role="tablist"
                  aria-label="Student profile sections"
                  ref={tablist}
                >
                  {tabs.map((name, index) => (
                    <button
                      key={name}
                      id={`tab-${name}`}
                      role="tab"
                      type="button"
                      aria-selected={tab === name}
                      aria-controls={`panel-${name}`}
                      tabIndex={tab === name ? 0 : -1}
                      onClick={() => setTab(name)}
                      onKeyDown={(event) => tabKey(event, index)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div
                  role="tabpanel"
                  id={`panel-${tab}`}
                  aria-labelledby={`tab-${tab}`}
                  tabIndex={0}
                >
                  {tab === 'History' ? (
                    <StudentHistoryTimeline
                      schoolId={school.id}
                      studentId={studentId}
                    />
                  ) : (
                    <ProfileDetails student={data.student} tab={tab} />
                  )}
                </div>
                {editing && (
                  <StudentProfileForm
                    schoolId={school.id}
                    student={data.student}
                    onClose={() => setEditing(false)}
                    onSaved={(student) => {
                      setData({ ...data, student });
                      setEditing(false);
                      setSuccess('Student profile saved.');
                      // Remount the timeline after a successful mutation so it loads new events.
                      setTab('Personal');
                    }}
                  />
                )}
              </>
            )
          )}
        </main>
      </div>
    </div>
  );
}
