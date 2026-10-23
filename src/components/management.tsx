'use client';

import { useState } from 'react';
import { phoneHref } from '@/lib/management-validation';
import { studentStatuses, studentStatusLabels } from '@/lib/student-status';
import { Icon } from './icon';
import { Empty, Person, Search, StatusBadge, TableRegion } from './ui';
import {
  Student,
  Teacher,
  Notice,
  audiences,
  classes,
  initials,
  className,
  formatDate,
} from '@/lib/demo';
import type { DatabaseClass } from '@/lib/classes-client';
import type { TeacherRow } from '@/lib/teachers-client';
import type { StudentRow } from '@/lib/students-client';

export function Students({
  students,
  onEdit,
  onDelete,
  initialClass = '',
  classOptions = classes,
}: {
  students: StudentRow[];
  onEdit: (student: Student) => void;
  onDelete?: (student: Student) => void;
  initialClass?: string;
  classOptions?: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(initialClass);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const matching = students.filter(
    (student) =>
      (!filter || student.classId === filter) &&
      (!status || student.status === status) &&
      `${student.name} ${student.studentId ?? student.id} ${student.guardian}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  );
  const pageCount = Math.max(1, Math.ceil(matching.length / 8));
  const currentPage = Math.min(page, pageCount);
  const visible = matching.slice((currentPage - 1) * 8, currentPage * 8);
  const filtered = Boolean(query || filter || status);
  const clearFilters = () => {
    setQuery('');
    setFilter('');
    setStatus('');
    setPage(1);
  };

  return (
    <section className="panel students-panel" aria-label="Student directory">
      <div className="toolbar">
        <Search
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder="Search students, ID or guardian…"
        />
        <div className="filter-group">
          <label className="sr-only" htmlFor="student-class">
            Filter by class
          </label>
          <select
            id="student-class"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All classes</option>
            {classOptions.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="student-status">
            Filter by status
          </label>
          <select
            id="student-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {studentStatuses.map((status) => (
              <option key={status}>{studentStatusLabels[status]}</option>
            ))}
          </select>
          {filtered && (
            <button className="button quiet" onClick={clearFilters}>
              Reset filters
            </button>
          )}
        </div>
      </div>
      {filter && (
        <div className="roster-summary">
          <span role="status">
            {classOptions.find((group) => group.id === filter)?.name ??
              'Selected class'}{' '}
            · {matching.length} matching students
          </span>
          <button
            className="button"
            onClick={() => {
              setFilter('');
              setPage(1);
            }}
          >
            Clear class filter
          </button>
        </div>
      )}

      <div className="student-mobile-cards">
        {visible.map((student, index) => (
          <article className="student-mobile-card" key={student.id}>
            <div className="student-mobile-card-header">
              <Person
                name={student.name}
                id={student.studentId ?? student.id}
                index={index}
              />
              <StatusBadge status={student.status} />
            </div>

            <div className="student-mobile-details">
              <div>
                <span>Class</span>
                <strong>
                  {student.className ?? className(student.classId)}
                </strong>
              </div>
              <div>
                <span>Guardian</span>
                <strong>{student.guardian}</strong>
                {student.guardianPhone && (
                  <small>{student.guardianPhone}</small>
                )}
                {student.email && <small>{student.email}</small>}
              </div>
            </div>

            <div className="student-mobile-actions">
              {phoneHref(student.guardianPhone) && (
                <a
                  href={phoneHref(student.guardianPhone) ?? undefined}
                  className="button small"
                  aria-label={`Call ${student.guardian}'s guardian phone`}
                >
                  <Icon name="phone" size={16} />
                  Call
                </a>
              )}

              <button
                className="button small"
                aria-label={`Edit ${student.name}`}
                onClick={() => onEdit(student)}
              >
                <Icon name="edit" size={16} />
                Edit
              </button>

              {onDelete && (
                <button
                  className="iconbutton destructive"
                  aria-label={`Delete ${student.name}`}
                  onClick={() => onDelete(student)}
                >
                  <Icon name="trash" size={18} />
                </button>
              )}
            </div>

            <a
              className="button student-mobile-profile"
              href={`/students/${encodeURIComponent(student.id)}`}
              aria-label={`View profile for ${student.name}`}
            >
              View Profile
            </a>
          </article>
        ))}

        {!matching.length && (
          <Empty
            title={
              students.length
                ? 'No students match your filters'
                : 'No students yet'
            }
            body={
              students.length
                ? 'Try another name, class or status.'
                : 'Use Add student to create the first record.'
            }
            action={
              filtered && (
                <button className="button" onClick={clearFilters}>
                  Clear filters
                </button>
              )
            }
          />
        )}
      </div>

      <TableRegion label="Student records" className="responsive-table">
        <table>
          <caption className="sr-only">
            Students, classes, guardians and enrolment status
          </caption>
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Class</th>
              <th scope="col">Guardian</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((student, index) => (
              <tr key={student.id}>
                <th scope="row" className="student-cell">
                  <Person
                    name={student.name}
                    id={student.studentId ?? student.id}
                    index={index}
                  />
                </th>
                <td data-label="Class">
                  {student.className ?? className(student.classId)}
                </td>
                <td data-label="Guardian">
                  <div className="guardian">
                    <span>{student.guardian}</span>

                    {student.email && <small>{student.email}</small>}

                    {student.guardianPhone && (
                      <small>{student.guardianPhone}</small>
                    )}

                    {phoneHref(student.guardianPhone) && (
                      <a
                        href={phoneHref(student.guardianPhone) ?? undefined}
                        className="button small"
                        aria-label={`Call ${student.guardian}'s guardian phone`}
                      >
                        <Icon name="phone" size={16} />
                        Call
                      </a>
                    )}
                  </div>
                </td>
                <td data-label="Status">
                  <StatusBadge status={student.status} />
                </td>
                <td className="row-action">
                  <div className="action-group">
                    <a
                      className="button small"
                      href={`/students/${encodeURIComponent(student.id)}`}
                      aria-label={`View profile for ${student.name}`}
                    >
                      View profile
                    </a>
                    <button
                      className="button small"
                      aria-label={`Edit ${student.name}`}
                      onClick={() => onEdit(student)}
                    >
                      <Icon name="edit" size={16} />
                      <span>Edit</span>
                    </button>
                    {onDelete && (
                      <button
                        className="iconbutton destructive"
                        aria-label={`Delete ${student.name}`}
                        onClick={() => onDelete(student)}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!matching.length && (
          <Empty
            title={
              students.length
                ? 'No students match your filters'
                : 'No students yet'
            }
            body={
              students.length
                ? 'Try another name, class or status.'
                : 'Use Add student to create the first record.'
            }
            action={
              filtered && (
                <button className="button" onClick={clearFilters}>
                  Clear filters
                </button>
              )
            }
          />
        )}
      </TableRegion>
      <div className="table-footer">
        <span role="status">
          {matching.length
            ? `${(currentPage - 1) * 8 + 1}–${Math.min(currentPage * 8, matching.length)}`
            : '0'}{' '}
          of {matching.length} students
        </span>
        <nav className="pagination" aria-label="Student pages">
          <button
            className="button small"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {pageCount}
          </span>
          <button
            className="button small"
            disabled={currentPage === pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </nav>
      </div>
    </section>
  );
}

export function Teachers({
  teachers,
  onEdit,
  onDelete,
}: {
  teachers: TeacherRow[];
  onEdit: (teacher: Teacher) => void;
  onDelete: (teacher: Teacher) => void;
}) {
  const [query, setQuery] = useState('');
  const matching = teachers.filter((teacher) =>
    `${teacher.name} ${teacher.subject}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
  return (
    <>
      <div className="section-toolbar">
        <Search
          value={query}
          onChange={setQuery}
          placeholder="Search teachers or subjects…"
        />
        <span className="result-count" role="status">
          {matching.length} {matching.length === 1 ? 'teacher' : 'teachers'}
        </span>
      </div>
      <div className="cards">
        {matching.map((teacher, index) => (
          <article className="panel teacher" key={teacher.id}>
            <div className="card-top">
              <div
                className={`avatar large ${index % 2 ? 'teal' : 'purple'}`}
                aria-hidden="true"
              >
                {initials(teacher.name)}
              </div>
              <div className="action-group">
                <button
                  className="iconbutton"
                  aria-label={`Edit ${teacher.name}`}
                  title={`Edit ${teacher.name}`}
                  onClick={() => onEdit(teacher)}
                >
                  <Icon name="edit" size={18} />
                </button>
                <button
                  className="iconbutton destructive"
                  aria-label={`Delete ${teacher.name}`}
                  onClick={() => onDelete(teacher)}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </div>
            <h2>{teacher.name}</h2>
            <p className="card-subtitle">{teacher.subject}</p>
            <dl className="details">
              <div className="detail-line">
                <dt>
                  <span className="sr-only">Assigned class</span>
                  <Icon name="classes" size={18} />
                </dt>
                <dd>{teacher.className}</dd>
              </div>
              <div className="detail-line">
                <dt>
                  <span className="sr-only">Email</span>
                  <Icon name="mail" size={18} />
                </dt>
                <dd>{teacher.email}</dd>
              </div>
              {teacher.phone && (
                <div className="detail-line">
                  <dt>Phone</dt>
                  <dd>{teacher.phone}</dd>
                </div>
              )}
            </dl>
            {phoneHref(teacher.phone) && (
              <a
                className="button teacher-call"
                href={phoneHref(teacher.phone) ?? undefined}
                aria-label={`Call ${teacher.name}`}
              >
                Call
              </a>
            )}
            <div className="card-footer">
              <span className="badge blue">
                {teacher.classId ? 'Class teacher' : 'Unassigned'}
              </span>
              <span className="secondary">{teacher.teacherId}</span>
            </div>
          </article>
        ))}
      </div>
      {!matching.length && (
        <section className="panel">
          <Empty
            title={teachers.length ? 'No teachers found' : 'No teachers yet'}
            body={
              teachers.length
                ? 'Try another name or subject.'
                : 'Use Add teacher to create the first teacher record.'
            }
            action={
              query && (
                <button className="button" onClick={() => setQuery('')}>
                  Clear search
                </button>
              )
            }
          />
        </section>
      )}
    </>
  );
}

export function Classes({
  groups,
  onRoster,
  onEdit,
  onDelete,
  disabled,
}: {
  groups: DatabaseClass[];
  onRoster: (code: string) => void;
  onEdit: (group: DatabaseClass) => void;
  onDelete: (group: DatabaseClass) => void;
  disabled: boolean;
}) {
  return (
    <div className="cards">
      {groups.map((group) => (
        <article className="panel class-card" key={group.id}>
          <div className="card-top">
            <span className="stat-icon">
              <Icon name="classes" size={25} />
            </span>
            <span className="badge">Room {group.room}</span>
          </div>
          <h2>{group.name}</h2>
          <p className="card-subtitle">
            {group.classTeacher?.name ?? 'No teacher assigned'}
          </p>
          <div className="capacity">
            <span>
              {group.studentCount} / {group.capacity} students
            </span>
            <span>
              {Math.max(0, group.capacity - group.studentCount)} places
              available
            </span>
          </div>
          <meter
            className="capacity-meter"
            min={0}
            max={group.capacity}
            value={Math.min(group.capacity, group.studentCount)}
            aria-label={
              group.name +
              ': ' +
              group.studentCount +
              ' of ' +
              group.capacity +
              ' places filled'
            }
          />
          <p className="secondary capacity-note">
            Code: {group.code} · Capacity: {group.capacity} students
          </p>
          <div className="action-group">
            <button
              className="button small"
              disabled={disabled}
              aria-label={'Edit ' + group.name}
              onClick={() => onEdit(group)}
            >
              <Icon name="edit" size={16} />
              Edit
            </button>
            <button
              className="iconbutton destructive"
              disabled={disabled}
              aria-label={'Delete ' + group.name}
              onClick={() => onDelete(group)}
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
          <button
            className="button roster-button"
            disabled={disabled}
            aria-label={`View class roster for ${group.name}`}
            onClick={() => onRoster(group.code)}
          >
            View class roster
            <Icon name="arrow" size={16} />
          </button>
        </article>
      ))}
    </div>
  );
}

export function NoticeContent({ notice }: { notice: Notice }) {
  return (
    <>
      <div className="notice-meta">
        <span className="badge blue">{notice.audience}</span>
        <time dateTime={notice.date}>{formatDate(notice.date)}</time>
      </div>
      <h3>{notice.title}</h3>
      <p className="notice-body">{notice.body}</p>
    </>
  );
}

export function Notices({
  notices,
  onEdit,
  onDelete,
  disabled = false,
}: {
  disabled?: boolean;
  notices: Notice[];
  onEdit: (notice: Notice) => void;
  onDelete: (notice: Notice) => void;
}) {
  const [audience, setAudience] = useState('');
  const matching = notices.filter(
    (notice) => !audience || notice.audience === audience
  );
  return (
    <>
      <div className="section-toolbar">
        <label className="filter-label">
          Audience
          <select
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
          >
            <option value="">All audiences</option>
            {audiences.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <span className="result-count" role="status">
          {matching.length} {matching.length === 1 ? 'notice' : 'notices'}
        </span>
      </div>
      <div className="notice-grid">
        {matching.map((notice) => (
          <article className="panel notice" key={notice.id}>
            <NoticeContent notice={notice} />
            <div className="notice-actions">
              <button
                className="button small"
                disabled={disabled}
                aria-label={`Edit ${notice.title}`}
                onClick={() => onEdit(notice)}
              >
                <Icon name="edit" size={16} />
                Edit notice
              </button>
              <button
                className="iconbutton destructive"
                disabled={disabled}
                title={`Delete ${notice.title}`}
                aria-label={`Delete ${notice.title}`}
                onClick={() => onDelete(notice)}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!matching.length && (
        <section className="panel">
          <Empty
            title={audience ? 'No notices for this audience' : 'No notices yet'}
            body={
              audience
                ? 'Choose another audience or add a notice.'
                : 'Use Add notice to share your first school update.'
            }
            action={
              audience && (
                <button className="button" onClick={() => setAudience('')}>
                  Show all notices
                </button>
              )
            }
          />
        </section>
      )}
    </>
  );
}
