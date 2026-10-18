'use client';

import { useCallback, useRef, useState } from 'react';
import { useWorkspaceRefresh } from '@/lib/use-workspace-refresh';
import type { FormTarget, RecordSubmission, Teacher } from '@/lib/demo';
import {
  loadTeacherWorkspace,
  mutateTeacher,
  teacherRow,
  TeacherRequestError,
  ApiTeacher,
  TeacherClass,
} from '@/lib/teachers-client';
import { Teachers } from './management';
import { RecordForm } from './record-form';
import { Dialog, Empty } from './ui';

type Props = {
  active: boolean;
  form: Extract<FormTarget, { kind: 'teacher' }> | null;
  onEdit: (teacher: Teacher) => void;
  onClose: () => void;
  notify: (message: string) => void;
};
export function TeachersWorkspace({
  active,
  form,
  onEdit,
  onClose,
  notify,
}: Props) {
  const [data, setData] = useState<{
    teachers: ApiTeacher[];
    classes: TeacherClass[];
  }>({ teachers: [], classes: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<Teacher | null>(null);
  const busy = useRef(false);
  const refreshOnVisit = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    await loadTeacherWorkspace(signal)
      .then((result) => {
        if (!signal.aborted) {
          setData(result);
          setLoadError('');
        }
      })
      .catch(() => {
        if (!signal.aborted)
          setLoadError(
            'Unable to load teachers and available classes. Please try again.'
          );
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
  }, []);
  useWorkspaceRefresh(
    active,
    pending || !!deleting || (!!form && !loading),
    revision,
    refreshOnVisit
  );
  const retry = () => {
    setLoading(true);
    setLoadError('');
    setRevision((value) => value + 1);
  };
  const close = () => {
    if (!busy.current) {
      setError('');
      onClose();
    }
  };
  const selected = data.teachers.find(
    (teacher) => teacher.id === form?.existing?.id
  );
  const available = data.classes.filter(
    (group) =>
      group.classTeacher === null || group.classTeacher.id === selected?.id
  );
  const rows = data.teachers.map(teacherRow);
  async function refresh() {
    try {
      setData(await loadTeacherWorkspace());
      setLoadError('');
    } catch {
      setLoadError(
        'Changes may have been saved, but teachers and classes could not be refreshed. Retry before making further changes.'
      );
    }
  }
  async function change(
    method: 'POST' | 'PUT' | 'DELETE',
    id?: string,
    input?: Parameters<typeof mutateTeacher>[2]
  ) {
    if (busy.current || loading || loadError) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await mutateTeacher(method, id, input);
      onClose();
      setDeleting(null);
      await refresh();
      notify(
        `Teacher ${method === 'POST' ? 'added' : method === 'PUT' ? 'updated' : 'deleted'} successfully.`
      );
    } catch (failure) {
      setError(
        failure instanceof TeacherRequestError
          ? failure.message
          : 'Unable to save changes. Check your connection and try again.'
      );
      if (failure instanceof TeacherRequestError && failure.status === 409)
        await refresh();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function save(submission: RecordSubmission, phone?: string) {
    if (submission.kind !== 'teacher') return;
    const group = available.find(
      (group) => group.code === submission.data.classId
    );
    if (submission.data.classId && !group) {
      setError(
        'This class is unavailable. Choose an available class or Unassigned.'
      );
      return;
    }
    return change(form?.existing ? 'PUT' : 'POST', form?.existing?.id, {
      name: submission.data.name,
      subject: submission.data.subject,
      email: submission.data.email,
      phone: phone ?? '',
      classId: group?.id ?? null,
    });
  }
  return (
    <>
      {loading ? (
        <section className="panel">
          <div className="empty" role="status">
            Loading teachers and classes…
          </div>
        </section>
      ) : loadError ? (
        <section className="panel">
          <div role="alert">
            <Empty
              title="Teachers could not be loaded"
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
        <Teachers
          teachers={rows}
          onEdit={(teacher) => {
            setError('');
            onEdit(teacher);
          }}
          onDelete={(teacher) => {
            setError('');
            setDeleting(teacher);
          }}
        />
      </div>
      {form &&
        (loading || loadError ? (
          <Dialog title="Teacher records" onClose={close}>
            <div className="form">
              <p role="status">
                Load teachers and available classes before adding or editing
                records.
              </p>
              <button className="button" onClick={close}>
                Close
              </button>
            </div>
          </Dialog>
        ) : (
          <RecordForm
            target={form}
            students={[]}
            teachers={rows}
            onClose={close}
            onSave={save}
            teacherSettings={{
              classes: available.map((group) => ({
                id: group.code,
                name: group.name,
                room: group.room,
                capacity: group.capacity,
              })),
              phone: selected?.phone ?? '',
              pending,
              error,
            }}
          />
        ))}
      {deleting && (
        <Dialog
          title="Delete teacher?"
          onClose={() => {
            if (!busy.current) setDeleting(null);
          }}
        >
          <div className="form">
            <p>
              Delete <strong>{deleting.name}</strong>? Their class-teacher
              assignment will also be removed.
            </p>
            {(error || loadError) && (
              <p className="form-error" role="alert">
                {loadError || error}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button"
                disabled={pending}
                data-autofocus
                onClick={() => setDeleting(null)}
              >
                Keep teacher
              </button>
              <button
                className="button danger"
                disabled={pending || !!loadError}
                onClick={() => change('DELETE', deleting.id)}
              >
                {pending ? 'Deleting…' : 'Delete teacher'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
