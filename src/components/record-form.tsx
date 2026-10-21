'use client';
import { studentStatuses, studentStatusLabels, statusFromLabel } from '@/lib/student-status';

import { FormEvent, ReactNode, useId, useRef, useState } from 'react';
import {
  audiences,
  classes,
  FormTarget,
  RecordSubmission,
  SchoolClass,
  Student,
  Teacher,
} from '@/lib/demo';
import {
  studentUpdateSchema,
  teacherUpdateSchema,
  validationFields,
} from '@/lib/management-validation';
import { Dialog } from './ui';
import { validNoticeDate } from '@/lib/notices-client';
import { todayISO } from '@/lib/demo';
import { Icon } from './icon';

type Props = {
  target: FormTarget;
  students: Student[];
  teachers: Teacher[];
  onClose: () => void;
  onSave: (submission: RecordSubmission, phone?: string) => void;
  noticeSettings?: { pending: boolean; error: string };
  teacherSettings?: {
    classes: SchoolClass[];
    phone: string;
    pending: boolean;
    error: string;
  };
  studentSettings?: {
    classes: (SchoolClass & { studentCount: number })[];
    phone: string;
    pending: boolean;
    error: string;
  };
};
type Errors = Record<string, string>;

function limitMobileInput(value: string): string {
  const prefix = value.startsWith('+91') ? '+91' : '';
  const digits = (prefix ? value.slice(3) : value)
    .replace(/\D/g, '')
    .slice(0, 10);

  return prefix + digits;
}

export function RecordForm({
  target,
  teachers,
  onClose,
  onSave,
  studentSettings,
  teacherSettings,
  noticeSettings,
}: Props) {
  const { kind, existing } = target;
  const [errors, setErrors] = useState<Errors>({});
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const prefix = useId();
  const classOptions =
    teacherSettings?.classes ?? studentSettings?.classes ?? classes;
  const fullDestination = (id: string) => {
    const group = studentSettings?.classes.find((group) => group.id === id);
    return (
      !!group &&
      group.studentCount >= group.capacity &&
      !(kind === 'student' && existing?.classId === id)
    );
  };
  const pending =
    noticeSettings?.pending ??
    teacherSettings?.pending ??
    studentSettings?.pending ??
    false;
  const value = (key: string) =>
    existing && key in existing ? String(Reflect.get(existing, key)) : '';
  const fieldId = (name: string) => `${prefix}-${name}`;
  const inputProps = (name: string) => ({
    name,
    id: fieldId(name),
    'aria-invalid': !!errors[name],
    'aria-describedby': errors[name] ? `${fieldId(name)}-error` : undefined,
  });

  function field(name: string, label: string, control: ReactNode) {
    return (
      <div className="field">
        <label htmlFor={fieldId(name)}>
          {label}{' '}
          {!(studentSettings && name === 'email') &&
            !(teacherSettings && name === 'classId') && (
              <span aria-hidden="true" className="required-mark">
                *
              </span>
            )}
        </label>
        {control}
        {errors[name] && (
          <p className="field-error" id={`${fieldId(name)}-error`}>
            {errors[name]}
          </p>
        )}
      </div>
    );
  }

  function requestClose() {
    if (pending) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const get = (key: string) => String(data.get(key) ?? '').trim();
    const studentStatus = statusFromLabel(get('status'));
    const next: Errors = {};
    const requireLength = (
      name: string,
      label: string,
      min: number,
      max: number
    ) => {
      const length = get(name).length;
      if (length < min)
        next[name] =
          `${label} must contain at least ${min} ${min === 1 ? 'character' : 'characters'}.`;
      else if (length > max)
        next[name] = `${label} must be ${max} characters or fewer.`;
    };
    if (kind === 'notice') {
      requireLength('title', 'Title', 1, noticeSettings ? 160 : 100);
      requireLength('body', 'Message', 1, noticeSettings ? 5000 : 2000);
      if (noticeSettings && !validNoticeDate(get('date')))
        next.date = 'Choose a valid calendar date.';
      if (!audiences.some((audience) => audience === get('audience')))
        next.audience = 'Choose an audience.';
    } else {
      const parsed =
        kind === 'student'
          ? studentUpdateSchema.safeParse({
              name: get('name'),
              classId: get('classId'),
              guardianName: get('guardian'),
              guardianEmail: get('email'),
              guardianPhone: get('guardianPhone'),
              status: studentStatus,
            })
          : teacherUpdateSchema.safeParse({
              name: get('name'),
              subject: get('subject'),
              email: get('email'),
              phone: get('phone'),
              classId: get('classId') || null,
            });
      if (!parsed.success) {
        for (const [key, message] of Object.entries(
          validationFields(parsed.error)
        )) {
          next[
            key === 'guardianName'
              ? 'guardian'
              : key === 'guardianEmail'
                ? 'email'
                : key
          ] = message;
        }
      }
      if (
        !(kind === 'teacher' && !get('classId')) &&
        !classOptions.some((group) => group.id === get('classId'))
      )
        next.classId = 'Choose a valid class.';
      if (kind === 'student' && fullDestination(get('classId')))
        next.classId =
          'This class is full. Active and inactive students both occupy a seat. Choose another class.';
      if (
        kind === 'teacher' &&
        teachers.some(
          (teacher) =>
            teacher.id !== existing?.id &&
            teacher.email.toLowerCase() === get('email').toLowerCase()
        )
      )
        next.email = 'A teacher with this email already exists.';
    }
    setErrors(next);
    if (Object.keys(next).length) {
      const firstInvalid = Array.from(form.elements).find(
        (element) =>
          element instanceof HTMLElement &&
          'name' in element &&
          next[String(element.name)]
      );
      if (firstInvalid instanceof HTMLElement) firstInvalid.focus();
      return;
    }
    if (kind === 'student') {
      if (!studentStatus) return;
      onSave(
        {
          kind,
          data: {
            name: get('name'),
            classId: get('classId'),
            guardian: get('guardian'),
            email: get('email'),
            status: studentStatusLabels[studentStatus],
          },
        },
        get('guardianPhone')
      );
    } else if (kind === 'teacher')
      onSave(
        {
          kind,
          data: {
            name: get('name'),
            classId: get('classId'),
            subject: get('subject'),
            email: get('email'),
          },
        },
        get('phone')
      );
    else
      onSave(
        {
          kind,
          data: {
            title: get('title'),
            body: get('body'),
            audience: get('audience'),
          },
        },
        get('date')
      );
  }

  return (
    <Dialog
      title={`${existing ? 'Edit' : 'Add'} ${kind}`}
      onClose={requestClose}
    >
      <form
        ref={formRef}
        className="form"
        noValidate
        onSubmit={submit}
        onChange={(event) => {
          const target = event.target;
          if (
            !(
              target instanceof HTMLInputElement ||
              target instanceof HTMLSelectElement ||
              target instanceof HTMLTextAreaElement
            )
          )
            return;
          setDirty(true);
          const name = target.name;
          setErrors((previous) => {
            const next = { ...previous };
            delete next[name];
            return next;
          });
        }}
      >
        <p className="form-intro">
          {kind === 'notice'
            ? 'Create an update for your school community.'
            : `Keep ${kind} details and class assignments up to date.`}{' '}
          {studentSettings
            ? 'Guardian email is optional; all other fields are required.'
            : teacherSettings
              ? 'Class assignment is optional; all other fields are required.'
              : 'All fields are required.'}
        </p>
        {(noticeSettings?.error ||
          teacherSettings?.error ||
          studentSettings?.error) && (
          <p className="form-error" role="alert">
            {noticeSettings?.error ||
              teacherSettings?.error ||
              studentSettings?.error}
          </p>
        )}
        {studentSettings && !classOptions.length && (
          <p className="form-error" role="alert">
            No database classes are available. A class must exist before adding
            a student.
          </p>
        )}
        {!!Object.keys(errors).length && (
          <div className="form-error" role="alert">
            <Icon name="info" size={18} />
            Please review the highlighted fields.
          </div>
        )}
        <fieldset
          className="form-fields"
          hidden={confirmClose}
          disabled={pending}
        >
          {kind === 'notice' ? (
            <>
              {field(
                'title',
                'Title',
                <input
                  {...inputProps('title')}
                  required
                  maxLength={noticeSettings ? 160 : 100}
                  defaultValue={value('title')}
                  data-autofocus
                  placeholder="e.g. Parent–teacher meeting"
                />
              )}
              {field(
                'audience',
                'Audience',
                <select
                  {...inputProps('audience')}
                  defaultValue={value('audience') || 'Everyone'}
                >
                  {audiences.map((audience) => (
                    <option key={audience}>{audience}</option>
                  ))}
                </select>
              )}
              {noticeSettings &&
                field(
                  'date',
                  'Date',
                  <input
                    {...inputProps('date')}
                    type="date"
                    required
                    defaultValue={value('date') || todayISO()}
                  />
                )}
              {field(
                'body',
                'Message',
                <textarea
                  {...inputProps('body')}
                  required
                  maxLength={noticeSettings ? 5000 : 2000}
                  rows={5}
                  defaultValue={value('body')}
                  placeholder="Include the details, dates and any action needed."
                />
              )}
            </>
          ) : (
            <>
              {field(
                'name',
                'Full name',
                <input
                  {...inputProps('name')}
                  required
                  minLength={1}
                  maxLength={80}
                  defaultValue={value('name')}
                  data-autofocus
                  autoComplete="off"
                  placeholder="Enter full name"
                />
              )}
              <div className="form-grid">
                {field(
                  'classId',
                  'Class',
                  <select
                    {...inputProps('classId')}
                    defaultValue={
                      value('classId') ||
                      (teacherSettings
                        ? ''
                        : classOptions.find(
                            (group) => !fullDestination(group.id)
                          )?.id) ||
                      ''
                    }
                  >
                    {studentSettings && (
                      <option value="">Choose a class</option>
                    )}
                    {teacherSettings && <option value="">Unassigned</option>}
                    {classOptions.map((group) => (
                      <option
                        key={group.id}
                        value={group.id}
                        disabled={fullDestination(group.id)}
                      >
                        {group.name}
                        {fullDestination(group.id) ? ' (Full)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                {kind === 'student'
                  ? field(
                      'status',
                      'Status',
                      <select
                        {...inputProps('status')}
                        defaultValue={value('status') || 'Active'}
                      >
                        {studentStatuses.map(status => <option key={status}>{studentStatusLabels[status]}</option>)}
                      </select>
                    )
                  : field(
                      'subject',
                      'Subject',
                      <input
                        {...inputProps('subject')}
                        required
                        maxLength={teacherSettings ? 100 : 70}
                        defaultValue={value('subject')}
                        placeholder="e.g. Mathematics"
                      />
                    )}
              </div>
              {kind === 'student' &&
                field(
                  'guardian',
                  'Guardian name',
                  <input
                    {...inputProps('guardian')}
                    required
                    minLength={1}
                    maxLength={80}
                    defaultValue={value('guardian')}
                    autoComplete="off"
                    placeholder="Enter guardian’s full name"
                  />
                )}
              {teacherSettings &&
                field(
                  'phone',
                  'Phone',
                  <input
                    {...inputProps('phone')}
                    type="tel"
                    inputMode="tel"
                    required
                    maxLength={13}
                    defaultValue={teacherSettings.phone}
                    placeholder="9876543210"
                    onChange={(e) => {
                      e.currentTarget.value = limitMobileInput(
                        e.currentTarget.value
                      );
                    }}
                  />
                )}
              {studentSettings &&
                field(
                  'guardianPhone',
                  'Guardian phone',
                  <input
                    {...inputProps('guardianPhone')}
                    type="tel"
                    inputMode="tel"
                    required
                    maxLength={13}
                    defaultValue={studentSettings.phone}
                    placeholder="9876543210"
                    onChange={(e) => {
                      e.currentTarget.value = limitMobileInput(
                        e.currentTarget.value
                      );
                    }}
                  />
                )}
              {field(
                'email',
                kind === 'student'
                  ? 'Guardian email (optional)'
                  : 'Email address',
                <input
                  {...inputProps('email')}
                  type="email"
                  inputMode="email"
                  required={!studentSettings}
                  maxLength={160}
                  defaultValue={value('email')}
                  placeholder="name@example.com"
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </>
          )}
        </fieldset>
        {confirmClose ? (
          <div className="discard-prompt" role="alert">
            <h3>Discard your changes?</h3>
            <p>Your edits have not been saved.</p>
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => {
                  setConfirmClose(false);
                  requestAnimationFrame(() =>
                    formRef.current
                      ?.querySelector<HTMLElement>('[data-autofocus]')
                      ?.focus()
                  );
                }}
              >
                Keep editing
              </button>
              <button type="button" className="button danger" onClick={onClose}>
                Discard changes
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="form-note">
              <Icon name="info" size={16} />
              {noticeSettings
                ? 'Notice changes are saved to the database.'
                : teacherSettings
                  ? 'Teacher changes are saved to the database.'
                  : studentSettings
                    ? 'Student changes are saved to the database.'
                    : 'Demo data only. Changes reset when you refresh.'}
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="button"
                disabled={pending}
                onClick={requestClose}
              >
                Cancel
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={
                  pending || (!!studentSettings && !classOptions.length)
                }
              >
                <Icon name={existing ? 'check' : 'plus'} size={17} />
                {pending
                  ? 'Saving…'
                  : existing
                    ? 'Save changes'
                    : `Add ${kind}`}
              </button>
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}
