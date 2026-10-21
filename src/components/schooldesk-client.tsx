'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { loadDashboard } from '@/lib/dashboard-client';
import type { DashboardUser } from '@/lib/dashboard-identity';
import { academicSessionLabel, type SchoolSettings } from '@/lib/school-settings';
import { SchoolSettingsWorkspace } from '@/components/school-settings-workspace';
import { Icon } from '@/components/icon';
import { Sidebar, Topbar } from '@/components/navigation';
import { DashboardWorkspace } from '@/components/dashboard-workspace';
import { NoticesWorkspace } from '@/components/notices-workspace';
import { ClassesWorkspace } from '@/components/classes-workspace';
import { TeachersWorkspace } from '@/components/teachers-workspace';
import { StudentsWorkspace } from '@/components/students-workspace';
import { AttendanceWorkspace } from '@/components/attendance-workspace';
import { WorkspacePanel } from '@/components/workspace-panel';
import { Toast, ToastMessage } from '@/components/ui';
import { sections, Section, FormTarget } from '@/lib/demo';

const descriptions: Record<Section, string> = {
  Dashboard: 'A clear view of your school day.',
  Students: 'Student records, class assignments and guardian details.',
  Teachers: 'Your teaching team and their class assignments.',
  Classes: 'Class sections, teachers and student capacity.',
  Attendance: 'Keep a clear record of every school day.',
  Notices: 'Updates for your school community.',
  Settings: 'School profile, academic session and guided setup.',
};

function subscribeToNavigation(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}
function currentSection(): Section {
  return (
    sections.find(
      (section) => section.toLowerCase() === window.location.hash.slice(1)
    ) ?? 'Dashboard'
  );
}

export default function SchoolDeskClient({ schoolId, schoolName, academicYear, user }: { schoolId: string; schoolName: string; academicYear: string | null; user: DashboardUser }) {
  const [activeSchool, setActiveSchool] = useState({ name: schoolName, academicYear });
  const updateSchool = useCallback((school: SchoolSettings) => setActiveSchool({ name: school.name, academicYear: school.academicYear }), []);
  const section = useSyncExternalStore(
    subscribeToNavigation,
    currentSection,
    () => 'Dashboard' as Section
  );
  const [rosterRequest, setRosterRequest] = useState({
    classId: '',
    revision: 0,
  });
  const [form, setForm] = useState<FormTarget | null>(null);
  const [noticeCount, setNoticeCount] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const toastSequence = useRef(0);
  const notify = useCallback(
    (text: string) => setToast({ id: ++toastSequence.current, text }),
    []
  );
  const dismissToast = useCallback(() => setToast(null), []);

  function navigate(target: Section) {
    window.location.hash = target.toLowerCase();
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  useEffect(() => {
    document.title = `${section} · SchoolDesk`;
  }, [section]);

  // Preserve the existing optional, read-only browser integration.
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: {
          name: string;
          description: string;
          inputSchema: object;
          annotations: object;
          execute: (input: unknown) => unknown;
        },
        options: { signal: AbortSignal }
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: 'schooldesk_read_summary',
          description:
            'Read current database summary counts. Does not change school records.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          async execute(input) {
            if (
              !input ||
              typeof input !== 'object' ||
              Array.isArray(input) ||
              Object.keys(input).length
            )
              throw new Error('Expected an empty object.');
            const data = await loadDashboard(schoolId, lifecycle.signal);
            return {
              mode: 'database',
              students: data.students.total,
              teachers: data.teachers.total,
              classes: data.classes.total,
              notices: data.notices.total,
            };
          },
        },
        { signal: lifecycle.signal }
      )
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [schoolId]);

  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to main content
      </a>
      <Sidebar
        schoolName={activeSchool.name}
        academicYear={activeSchool.academicYear}
        section={section}
        noticeCount={noticeCount}
        onNavigate={navigate}
      />
      <div className="main">
        <Topbar
          schoolName={activeSchool.name}
          academicYear={activeSchool.academicYear}
          user={user}
          section={section}
          noticeCount={noticeCount}
          onNavigate={navigate}
        />
        <main className="content" id="main-content" tabIndex={-1}>
          <div className="demo-banner">
            <Icon name="info" size={17} />
            <p>
              {section === 'Settings' ? <>School settings apply to your verified active school. Owners and administrators can save changes.</> : section === 'Students' ||
              section === 'Teachers' ||
              section === 'Classes' ||
              section === 'Attendance' ||
              section === 'Notices' ? (
                <>
                  <strong>Database {section.toLowerCase()}.</strong> Changes are
                  saved and remain after refresh.
                </>
              ) : (
                <>
                  <strong>Database dashboard.</strong> School summaries are
                  loaded from the database.
                </>
              )}
            </p>
          </div>
          <div className="page-head">
            <div>
              <div className="eyebrow">
                {section === 'Dashboard'
                  ? 'Your school, at a glance'
                  : 'School management'}
              </div>
              <h1 ref={headingRef} tabIndex={-1}>
                {section === 'Dashboard' ? 'School overview' : section}
              </h1>
              <p>{descriptions[section]}</p>
            </div>
            {section === 'Students' ||
            section === 'Teachers' ||
            section === 'Notices' ? (
              <button
                className="button primary"
                onClick={() =>
                  setForm({
                    kind:
                      section === 'Students'
                        ? 'student'
                        : section === 'Teachers'
                          ? 'teacher'
                          : 'notice',
                  })
                }
              >
                <Icon name="plus" size={18} />
                Add{' '}
                {section === 'Students'
                  ? 'student'
                  : section === 'Teachers'
                    ? 'teacher'
                    : 'notice'}
              </button>
            ) : (
              <span className="badge session-badge">Session: {academicSessionLabel(activeSchool.academicYear)}</span>
            )}
          </div>

          {section === 'Dashboard' && (
            <DashboardWorkspace schoolId={schoolId}
              academicYear={activeSchool.academicYear}
              onNavigate={navigate}
              onCount={setNoticeCount}
            />
          )}
          <WorkspacePanel active={section === 'Students'}>
            <StudentsWorkspace schoolId={schoolId}
              active={section === 'Students'}
              revision={rosterRequest.revision}
              initialClass={rosterRequest.classId}
              form={form?.kind === 'student' ? form : null}
              onClose={() => setForm(null)}
              onEdit={(existing) => setForm({ kind: 'student', existing })}
              notify={notify}
            />
          </WorkspacePanel>
          <WorkspacePanel active={section === 'Teachers'}>
            <TeachersWorkspace schoolId={schoolId}
              active={section === 'Teachers'}
              form={form?.kind === 'teacher' ? form : null}
              onClose={() => setForm(null)}
              onEdit={(existing) => setForm({ kind: 'teacher', existing })}
              notify={notify}
            />
          </WorkspacePanel>
          <WorkspacePanel active={section === 'Classes'}>
            <ClassesWorkspace schoolId={schoolId}
              active={section === 'Classes'}
              notify={notify}
              onRoster={(classId) => {
                setRosterRequest((previous) => ({
                  classId,
                  revision: previous.revision + 1,
                }));
                navigate('Students');
              }}
            />
          </WorkspacePanel>
          <WorkspacePanel active={section === 'Attendance'}>
            <AttendanceWorkspace schoolId={schoolId}
              active={section === 'Attendance'}
              notify={notify}
            />
          </WorkspacePanel>
          <WorkspacePanel active={section === 'Notices'}>
            <NoticesWorkspace schoolId={schoolId}
              active={section === 'Notices'}
              form={form?.kind === 'notice' ? form : null}
              onEdit={(existing) => setForm({ kind: 'notice', existing })}
              onClose={() => setForm(null)}
              notify={notify}
              onCount={setNoticeCount}
            />
          </WorkspacePanel>
          <WorkspacePanel active={section === 'Settings'}>
            <SchoolSettingsWorkspace schoolId={schoolId} active={section === 'Settings'} onSchoolChange={updateSchool} notify={notify} />
          </WorkspacePanel>
          <footer className="bottom-note">
            <span>SchoolDesk · School management</span>
            <span>
              {section === 'Students' ||
              section === 'Teachers' ||
              section === 'Classes' ||
              section === 'Attendance' ||
              section === 'Notices'
                ? `${section} connected to database`
                : section === 'Settings' ? 'School settings connected to database' : 'Dashboard connected to database'}
            </span>
          </footer>
        </main>
      </div>
      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}
