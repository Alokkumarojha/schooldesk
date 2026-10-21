'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import {
  studentUpdateSchema,
  validationFields,
} from '@/lib/management-validation';
import { loadClasses, type StudentClass } from '@/lib/students-client';
import {
  ProfileRequestError,
  type StudentProfile,
} from '@/lib/student-profile-client';
import { humanLabel, profileSections } from '@/lib/student-profile-fields';
import { Dialog } from './ui';
import { StudentPhotoPicker } from './student-photo-picker';
import { useStudentPhoto } from './use-student-photo';
import { saveProfileWithPhoto, PartialProfileSaveError, PhotoRequestError, type PhotoDraft, type SaveCheckpoint } from '@/lib/student-photo-client';

function limitMobileInput(value: string): string {
  const prefix = value.startsWith('+91') ? '+91' : '';
  const digits = (prefix ? value.slice(3) : value)
    .replace(/\D/g, '')
    .slice(0, 10);

  return prefix + digits;
}

export function StudentProfileForm({
  schoolId,
  student,
  onClose,
  onSaved,
  onProgress,
}: {
  schoolId: string;
  student: StudentProfile;
  onClose: () => void;
  onSaved: (student: StudentProfile, cleanupPending: boolean) => void;
  onProgress: (student: StudentProfile) => void;
}) {
  const prefix = useId();
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [classError, setClassError] = useState('');
  const [revision, setRevision] = useState(0);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<PhotoDraft>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [partial, setPartial] = useState(false);
  const checkpoint = useRef<SaveCheckpoint | null>(null);
  const photo = useStudentPhoto(schoolId, student.id, student.imageUrl);
  const [discard, setDiscard] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadClasses(schoolId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setClasses(result);
          setClassError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setClassError(
            'Class choices could not be loaded. Retry before saving.'
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [schoolId, revision]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const close = () => {
    if (!busy.current) {
      if (dirty) setDiscard(true);
      else onClose();
    }
  };
  const reload = () => {
    setLoading(true);
    setRevision((value) => value + 1);
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || loading || classError || (photoDraft && (photo.loading || !photo.photo || reviewRequired))) return;
    const raw: Record<string, unknown> = Object.fromEntries(
      new FormData(event.currentTarget)
    );
    // Photo changes use their dedicated API; blob URLs never enter profile data.
    delete raw.imageUrl;
    if (raw.gender === '') raw.gender = null;
    if (raw.bloodGroup === '') raw.bloodGroup = null;
    const parsed = studentUpdateSchema.safeParse(raw);
    const next = parsed.success ? {} : validationFields(parsed.error);
    const group = classes.find((group) => group.id === raw.classId);
    if (!group) next.classId = 'Choose an available class.';
    else if (
      group.id !== student.classId &&
      group.studentCount >= group.capacity
    )
      next.classId = 'This class has reached its capacity.';
    setFields(next);
    if (!parsed.success || Object.keys(next).length) {
      const control = form.current?.elements.namedItem(Object.keys(next)[0]);
      if (control instanceof HTMLElement) control.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const result = await saveProfileWithPhoto(schoolId, student.id, parsed.data, photoDraft, photo.photo?.version ?? null, checkpoint.current, value => {
        checkpoint.current = value;
        onProgress(value.student);
      });
      onSaved(result.student, result.cleanupPending);
    } catch (failure) {
      if (failure instanceof PartialProfileSaveError) {
        setPartial(true); setError(failure.message);
        const cause = failure.cause;
        setReviewRequired(!(cause instanceof PhotoRequestError) || ![400, 413, 415].includes(cause.status));
        return;
      }
      setError(
        failure instanceof ProfileRequestError
          ? failure.message
          : 'Unable to confirm the save. Reload the profile before retrying.'
      );
      if (failure instanceof ProfileRequestError) setFields(failure.fields);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog title="Edit student profile" onClose={close}>
      <form
        ref={form}
        className="form student-profile-form"
        noValidate
        onSubmit={submit}
        onChange={(event) => {
          setDirty(true);
          const control = event.target;
          if (
            control instanceof HTMLInputElement ||
            control instanceof HTMLSelectElement
          )
            setFields((previous) => {
              const next = { ...previous };
              delete next[control.name];
              return next;
            });
        }}
      >
        <p className="form-intro">
          Admission number {student.studentId} stays unchanged. Required fields
          are marked *. Other fields can be cleared.
        </p>
        {loading && <p role="status">Loading class choices…</p>}
      {partial && <p role="status" className="form-intro">Profile details from the previous attempt are already saved. Closing this form will not undo them. Your selected photo is retained for retry.</p>}
      {photo.loading && <p role="status">Loading current photo…</p>}
      {(photo.error || reviewRequired) && <div role="alert"><p>{photo.error || 'Review the latest saved photo before retrying your selected change.'}</p>
        <button type="button" className="button" disabled={pending || photo.loading} onClick={() => { photo.reload(); setReviewRequired(false); }}>Review current photo</button>
      </div>}
      {partial && photo.photo && <div className="form-intro"><p>Current saved photo (your selected change is shown below):</p>{photo.src ? <Image src={photo.src} width={88} height={88} unoptimized alt="Current saved student photo" /> : <p>No saved photo.</p>}</div>}
        {classError && (
          <div role="alert">
            <p>{classError}</p>
            <button
              type="button"
              className="button"
              disabled={loading}
              onClick={reload}
            >
              Retry class choices
            </button>
          </div>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
            <button
              type="button"
              className="button"
              disabled={loading || pending}
              onClick={reload}
            >
              Reload class choices
            </button>
          </div>
        )}
        <fieldset disabled={pending} hidden={discard} className="form-fields">
          {profileSections.map((section) => (
            <fieldset className="profile-edit-section" key={section.title}>
              <legend>{section.title}</legend>
              <div className="student-detail-grid">
                {section.fields.map((field) => {
                  if (field.name === 'imageUrl') return <StudentPhotoPicker key={field.name} existingSrc={photo.src ?? null} hasPhoto={!!photo.photo?.imageUrl} disabled={pending} onDraftChange={draft => { setPhotoDraft(draft); setDirty(true); }} />;
                  const stored = student[field.name];
                  const value = typeof stored === 'string' ? stored : '';
                  const props = {
                    id: `${prefix}-${field.name}`,
                    name: field.name,
                    required: field.required,
                    'aria-invalid': !!fields[field.name],
                    'aria-describedby': fields[field.name]
                      ? `${prefix}-${field.name}-error`
                      : undefined,
                  };
                  return (
                    <div className="field" key={field.name}>
                      <label htmlFor={props.id}>
                        {field.label}
                        {field.required ? ' *' : ''}
                      </label>
                      {field.name === 'classId' ? (
                        <select
                          {...props}
                          defaultValue={student.classId}
                          disabled={loading || !!classError}
                        >
                          {!classes.some(
                            (group) => group.id === student.classId
                          ) && (
                            <option value={student.classId}>
                              {student.class.name}
                            </option>
                          )}
                          {classes.map((group) => (
                            <option
                              key={group.id}
                              value={group.id}
                              disabled={
                                group.id !== student.classId &&
                                group.studentCount >= group.capacity
                              }
                            >
                              {group.name}
                              {group.studentCount >= group.capacity
                                ? ' (Full)'
                                : ''}
                            </option>
                          ))}
                        </select>
                      ) : field.options ? (
                        <select {...props} defaultValue={value}>
                          {!field.required && (
                            <option value="">Not provided</option>
                          )}
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {humanLabel(option)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...props}
                          type={field.type ?? 'text'}
                          maxLength={field.max}
                          defaultValue={value}
                          data-autofocus={field.name === 'name' || undefined}
                          inputMode={field.type === 'tel' ? 'tel' : undefined}
                          onChange={
                            field.type === 'tel'
                              ? (event) => {
                                  event.currentTarget.value = limitMobileInput(
                                    event.currentTarget.value
                                  );
                                }
                              : undefined
                          }
                        />
                      )}
                      {fields[field.name] && (
                        <p className="field-error" id={`${props.id}-error`}>
                          {fields[field.name]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </fieldset>
        {discard ? (
          <div role="alert">
            <h3>Discard unsaved changes?</h3>
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => {
                  setDiscard(false);
                  requestAnimationFrame(() =>
                    form.current
                      ?.querySelector<HTMLElement>('[data-autofocus]')
                      ?.focus()
                  );
                }}
              >
                Keep editing
              </button>
              <button type="button" className="button danger" onClick={onClose}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div className="form-actions">
            <button
              type="button"
              className="button"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={pending || loading || !!classError || (!!photoDraft && (photo.loading || !photo.photo || reviewRequired))}
            >
              {pending ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        )}
      </form>
    </Dialog>
  );
}
