'use client';

import { type Section, formatDate } from '@/lib/demo';
import type { DashboardData } from '@/lib/dashboard-client';
import { academicSessionLabel } from '@/lib/school-settings';
import { noticeRow } from '@/lib/notices-client';
import { Icon } from './icon';
import { Empty, Person, StatusBadge, TableRegion } from './ui';
import { NoticeContent } from './management';

export function Dashboard({ dashboard, academicYear, onNavigate }: {
  dashboard: DashboardData; academicYear: string | null; onNavigate: (section: Section) => void;
}) {
  const enrolment = dashboard.enrolment.classes;
  const maxEnrolled = Math.max(1, ...enrolment.map(group => group.activeStudentCount));
  const { date, totalActiveStudents, recordedActiveStudents: recorded } = dashboard.attendance;
  const students = dashboard.studentDirectory;
  const notices = dashboard.noticeBoard.map(noticeRow);
  const stats = [
    { label: 'Students', value: dashboard.students.total, detail: dashboard.students.active + ' active · ' + dashboard.students.inactive + ' inactive', icon: 'students' },
    { label: 'Teachers', value: dashboard.teachers.total, detail: 'Your teaching team', icon: 'teachers' },
    { label: 'Classes', value: dashboard.classes.total, detail: 'Sections in this session', icon: 'classes' },
    { label: 'Notices', value: dashboard.notices.total, detail: 'On the school notice board', icon: 'notices' },
  ];
  const actions: { target: Section; title: string; description: string }[] = [
    { target: 'Attendance', title: 'Take attendance', description: 'Open the class register' },
    { target: 'Students', title: 'Manage students', description: 'View and update student records' },
    { target: 'Notices', title: 'School notices', description: 'Keep your community informed' },
  ];

  return <>
    <div className="stats">{stats.map(stat => <article className="stat" key={stat.label}>
      <div className="stat-top"><h2>{stat.label}</h2><span className="stat-icon"><Icon name={stat.icon} /></span></div>
      <strong className="stat-value">{stat.value}</strong><p>{stat.detail}</p>
    </article>)}</div>
    <div className="dashboard-grid">
      <div className="dashboard-column">
        <section className="panel"><div className="panel-head"><div><h2>Class enrolment</h2><p>Active students by section</p></div><span className="badge">{dashboard.enrolment.sections} sections</span></div>
          <div className="panel-body"><div className="chart-summary"><strong>{dashboard.enrolment.activeStudents}</strong><span>active students enrolled</span></div>
            <div className="enrolment-chart">{enrolment.map(group => <div className="bar-row" key={group.id}><span>{group.name}</span>
              <progress max={maxEnrolled} value={group.activeStudentCount} aria-label={`${group.name}: ${group.activeStudentCount} active students`} /><strong>{group.activeStudentCount}</strong>
            </div>)}</div>
            <div className="legend"><span><i aria-hidden="true" />Active enrolment</span><span>Academic session: {academicSessionLabel(academicYear)}</span></div>
          </div>
        </section>
        <section className="panel"><div className="panel-head"><div><h2>Student directory</h2><p>A quick look at your school roster</p></div><button className="link" onClick={() => onNavigate('Students')}>View students<Icon name="arrow" size={15} /></button></div>
          <TableRegion label="Student directory preview" className="dashboard-table"><table><caption className="sr-only">First four students in the directory</caption>
            <thead><tr><th scope="col">Student</th><th scope="col">Class</th><th scope="col">Status</th></tr></thead>
            <tbody>{students.map((student, index) => <tr key={student.id}>
              <th scope="row"><Person name={student.name} id={student.studentId} index={index} /></th><td>{student.className}</td><td><StatusBadge status={student.status === 'ACTIVE' ? 'Active' : 'Inactive'} /></td>
            </tr>)}</tbody>
          </table>{!students.length && <Empty title="Your student directory is empty" body="Add the first student to get started." />}</TableRegion>
        </section>
      </div>
      <div className="dashboard-column">
        <section className="panel"><div className="panel-head"><h2>Quick actions</h2></div><div className="panel-body action-list">
          {actions.map(action => <button className="action-tile" key={action.target} onClick={() => onNavigate(action.target)}>
            <span className="stat-icon"><Icon name={action.target.toLowerCase()} /></span><span className="action-copy"><strong>{action.title}</strong><small>{action.description}</small></span><Icon name="chevron" size={17} />
          </button>)}
        </div></section>
        <section className="panel attendance-overview"><div className="panel-body">
          <div className="notice-meta"><span className="badge blue">Attendance</span><time dateTime={date}>{formatDate(date)}</time></div>
          <h2>{recorded} <span className="muted">of {totalActiveStudents}</span> recorded</h2>
          <p className="secondary">Currently active students with attendance recorded for this date, across all classes.</p>
          <progress max={Math.max(1, totalActiveStudents)} value={recorded} aria-label={`Attendance recorded for ${recorded} of ${totalActiveStudents} currently active students`} />
        </div></section>
        <section className="panel"><div className="panel-head"><h2>Notice board</h2><button className="link" onClick={() => onNavigate('Notices')}>View all<Icon name="arrow" size={15} /></button></div>
          {notices.length ? notices.map(notice => <article className="notice compact" key={notice.id}><NoticeContent notice={notice} /></article>)
            : <Empty title="No notices yet" body="School updates will appear here." />}
        </section>
      </div>
    </div>
  </>;
}
