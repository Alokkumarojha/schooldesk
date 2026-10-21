'use client';

import { useCallback, useRef, useState } from 'react';
import { useWorkspaceRefresh } from '@/lib/use-workspace-refresh';
import {
  ClassRequestError,
  loadClassWorkspace,
  mutateClass,
  type ClassInput,
  type DatabaseClass,
} from '@/lib/classes-client';
import { Classes } from './management';
import { ClassForm } from './class-form';
import { Dialog, Empty } from './ui';

export function ClassesWorkspace({
  schoolId,
  active,
  onRoster,
  notify,
}: {
  schoolId: string;
  active: boolean;
  onRoster: (code: string) => void;
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<
    Awaited<ReturnType<typeof loadClassWorkspace>>
  >({ classes: [], teachers: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState<{ existing?: DatabaseClass } | null>(null);
  const [deleting, setDeleting] = useState<DatabaseClass | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const refreshOnVisit = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    await loadClassWorkspace(schoolId, signal)
      .then((result) => {
        if (!signal.aborted) {
          setData(result);
          setLoadError('');
        }
      })
      .catch(() => {
        if (!signal.aborted)
          setLoadError(
            'Unable to load classes and teachers. Please try again.'
          );
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
  }, [schoolId]);
  useWorkspaceRefresh(
    active,
    pending || !!form || !!deleting,
    revision,
    refreshOnVisit
  );
  const retry = () => {
    setLoadError('');
    setLoading(true);
    setRevision((value) => value + 1);
  };
  async function refresh() {
    try {
      setData(await loadClassWorkspace(schoolId));
      setLoadError('');
    } catch {
      setLoadError(
        'Unable to refresh classes and teachers. Retry before making further changes.'
      );
    }
  }
  async function change(
    method: 'POST' | 'PUT' | 'DELETE',
    id?: string,
    input?: ClassInput
  ) {
    if (busy.current || loading || loadError) return;
    if (
      input?.classTeacherId &&
      !data.teachers.some(
        (teacher) =>
          teacher.id === input.classTeacherId &&
          (!teacher.classTeacherOf || teacher.classTeacherOf.id === id)
      )
    ) {
      setError(
        'This teacher is no longer available. Select an available teacher or Unassigned.'
      );
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await mutateClass(schoolId, method, id, input);
      setForm(null);
      setDeleting(null);
      await refresh();
      notify(
        `Class ${method === 'POST' ? 'added' : method === 'PUT' ? 'updated' : 'deleted'} successfully.`
      );
    } catch (failure) {
      setError(
        failure instanceof ClassRequestError
          ? failure.message
          : 'Unable to save class changes. Check your connection and try again.'
      );
      if (failure instanceof ClassRequestError && failure.status === 409)
        await refresh();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <div className="section-toolbar">
        <span className="result-count" role="status">
          {loading
            ? 'Loading classes and teachers…'
            : `${data.classes.length} classes`}
        </span>
        <button
          className="button primary"
          disabled={loading || !!loadError || pending}
          onClick={() => {
            setError('');
            setForm({});
          }}
        >
          Add class
        </button>
      </div>
      {loadError && (
        <section className="panel">
          <div role="alert">
            <Empty
              title="Class data could not be loaded"
              body={loadError}
              action={
                <button className="button" disabled={loading} onClick={retry}>
                  Retry
                </button>
              }
            />
          </div>
        </section>
      )}
      {!loading && (
        <Classes
          groups={data.classes}
          onRoster={onRoster}
          onEdit={(group) => {
            setError('');
            setForm({ existing: group });
          }}
          onDelete={(group) => {
            setError('');
            setDeleting(group);
          }}
          disabled={pending || !!loadError}
        />
      )}
      {!loading && !loadError && !data.classes.length && (
        <section className="panel">
          <Empty
            title="No classes yet"
            body="Use Add class to create your first class."
          />
        </section>
      )}
      {form && (
        <ClassForm
          existing={form.existing}
          teachers={data.teachers}
          pending={pending}
          blocked={loading || !!loadError}
          error={loadError || error}
          onClose={() => {
            if (!busy.current) setForm(null);
          }}
          onSave={(input) =>
            change(form.existing ? 'PUT' : 'POST', form.existing?.id, input)
          }
        />
      )}
      {deleting && (
        <Dialog
          title="Delete class?"
          onClose={() => {
            if (!busy.current) setDeleting(null);
          }}
        >
          <div className="form">
            <p>
              Delete <strong>{deleting.name}</strong>? Classes containing
              students or attendance records cannot be deleted.
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
                Keep class
              </button>
              <button
                className="button danger"
                disabled={pending || !!loadError || loading}
                onClick={() => change('DELETE', deleting.id)}
              >
                {pending ? 'Deleting…' : 'Delete class'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
