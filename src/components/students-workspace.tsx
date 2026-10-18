'use client';

import { useCallback, useRef, useState } from 'react';
import { useWorkspaceRefresh } from '@/lib/use-workspace-refresh';
import type { FormTarget, RecordSubmission, Student } from '@/lib/demo';
import {
  StudentClass,
  ApiStudent,
  StudentRequestError,
  deleteStudent,
  loadClasses,
  loadStudents,
  saveStudent,
  studentRow,
} from '@/lib/students-client';
import { Students } from './management';
import { RecordForm } from './record-form';
import { Dialog, Empty } from './ui';

type Props = {
  active: boolean;
  initialClass: string;
  revision: number;
  form: Extract<FormTarget, { kind: 'student' }> | null;
  onEdit: (student: Student) => void;
  onClose: () => void;
  notify: (message: string) => void;
};

export function StudentsWorkspace({
  active,
  initialClass,
  revision,
  form,
  onEdit,
  onClose,
  notify,
}: Props) {
  const [data, setData] = useState<{
    students: ApiStudent[];
    classes: StudentClass[];
  }>({ students: [], classes: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const refreshOnVisit = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    await Promise.all([loadStudents(signal), loadClasses(signal)])
      .then(([students, classes]) => {
        if (signal.aborted) return;
        setData({ students, classes });
        setLoadError('');
      })
      .catch(() => {
        if (!signal.aborted)
          setLoadError(
            'Unable to load students or their available classes. Check your connection and try again.'
          );
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
  }, []);
  useWorkspaceRefresh(
    active,
    pending || !!deleting || (!!form && !loading),
    reload,
    refreshOnVisit
  );

  const retry = () => {
    setLoading(true);
    setLoadError('');
    setReload((value) => value + 1);
  };
  const closeForm = () => {
    if (!busy.current) {
      setSaveError('');
      onClose();
    }
  };
  const rows = data.students.map(studentRow);
  const classOptions = data.classes.map((group) => ({
    id: group.code,
    name: group.name,
    room: group.room,
    capacity: group.capacity,
    studentCount: group.studentCount,
  }));
  const selected = data.students.find(
    (student) => student.id === form?.existing?.id
  );

  async function refreshCapacity() {
    try {
      const classes = await loadClasses(new AbortController().signal);
      setData((previous) => ({ ...previous, classes }));
    } catch {
      setLoadError(
        'Changes were saved, but class availability could not be refreshed. Please retry before making more changes.'
      );
    }
  }

  async function save(submission: RecordSubmission, phone?: string) {
    if (submission.kind !== 'student' || busy.current || loading || loadError)
      return;
    const group = data.classes.find(
      (group) => group.code === submission.data.classId
    );
    if (!group) {
      setSaveError(
        'Class information is unavailable. Reload the student list before saving.'
      );
      return;
    }
    busy.current = true;
    setPending(true);
    setSaveError('');
    try {
      const saved = await saveStudent(
        {
          name: submission.data.name,
          classId: group.id,
          guardianName: submission.data.guardian,
          guardianEmail: submission.data.email || undefined,
          guardianPhone: phone ?? '',
          status: submission.data.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
        },
        form?.existing?.id
      );
      setData((previous) => ({
        ...previous,
        students: [
          ...previous.students.filter((student) => student.id !== saved.id),
          saved,
        ].sort((a, b) => a.studentId.localeCompare(b.studentId)),
      }));
      notify(`Student ${form?.existing ? 'updated' : 'added'} successfully.`);
      onClose();
      await refreshCapacity();
    } catch (error) {
      setSaveError(
        error instanceof StudentRequestError
          ? error.message
          : 'Unable to save student. Check your connection and try again.'
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function remove() {
    if (!deleting || busy.current) return;
    busy.current = true;
    setPending(true);
    setDeleteError('');
    try {
      await deleteStudent(deleting.id);
      setData((previous) => ({
        ...previous,
        students: previous.students.filter(
          (student) => student.id !== deleting.id
        ),
      }));
      setDeleting(null);
      notify('Student deleted successfully.');
      await refreshCapacity();
    } catch (error) {
      setDeleteError(
        error instanceof StudentRequestError
          ? error.message
          : 'Unable to delete student. Check your connection and try again.'
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      {loading ? (
        <section className="panel">
          <div className="empty" role="status" aria-live="polite">
            Loading students and classes…
          </div>
        </section>
      ) : loadError ? (
        <section className="panel">
          <div role="alert">
            <Empty
              title="Students could not be loaded"
              body={loadError}
              action={
                <button className="button" onClick={retry}>
                  Retry
                </button>
              }
            />
          </div>
        </section>
      ) : null}
      <div hidden={loading || !!loadError}>
        <Students
          key={revision}
          students={rows}
          initialClass={initialClass}
          classOptions={classOptions}
          onEdit={(student) => {
            setSaveError('');
            onEdit(student);
          }}
          onDelete={(student) => {
            setDeleteError('');
            setDeleting(student);
          }}
        />
      </div>
      {form &&
        (loading || loadError ? (
          <Dialog title="Student records" onClose={closeForm}>
            <div className="form">
              <p role="status">
                {loading
                  ? 'Loading students and classes…'
                  : 'Load students and available classes before adding or editing records.'}
              </p>
              <button className="button" onClick={closeForm}>
                Close
              </button>
            </div>
          </Dialog>
        ) : (
          <RecordForm
            target={form}
            students={rows}
            teachers={[]}
            onClose={closeForm}
            onSave={save}
            studentSettings={{
              classes: classOptions,
              phone: selected?.guardianPhone ?? '',
              pending,
              error: saveError,
            }}
          />
        ))}
      {deleting && (
        <Dialog
          title="Delete student?"
          onClose={() => {
            if (!busy.current) setDeleting(null);
          }}
        >
          <div className="form">
            <p>
              Delete <strong>{deleting.name}</strong>? This permanently removes
              the student record.
            </p>
            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button"
                disabled={pending}
                data-autofocus
                onClick={() => setDeleting(null)}
              >
                Keep student
              </button>
              <button
                className="button danger"
                disabled={pending}
                onClick={remove}
              >
                {pending ? 'Deleting…' : 'Delete student'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
