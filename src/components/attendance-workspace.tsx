'use client';

import { useCallback, useState } from 'react';
import { useWorkspaceRefresh } from '@/lib/use-workspace-refresh';
import { loadClasses, type ApiClass } from '@/lib/students-client';
import { DEMO_DATE } from '@/lib/demo';
import { AttendanceRegister } from './attendance';
import { Empty } from './ui';

export function AttendanceWorkspace({
  schoolId,
  active,
  notify,
}: {
  schoolId: string;
  active: boolean;
  notify: (message: string) => void;
}) {
  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(DEMO_DATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [protectedDraft, setProtectedDraft] = useState(false);
  const [sessionRevision, setSessionRevision] = useState(0);
  const refreshOnVisit = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    await loadClasses(schoolId, signal)
      .then((groups) => {
        if (signal.aborted) return;
        setClasses(groups);
        setClassId((current) =>
          groups.some((group) => group.id === current)
            ? current
            : (groups[0]?.id ?? '')
        );
        setSessionRevision((value) => value + 1);
        setError('');
      })
      .catch(() => {
        if (!signal.aborted)
          setError('Unable to load classes. Please try again.');
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
  }, [schoolId]);
  useWorkspaceRefresh(active, protectedDraft, revision, refreshOnVisit);
  return (
    <>
      {loading && (
        <section className="panel">
          <div className="empty" role="status">
            Loading attendance classes…
          </div>
        </section>
      )}
      {error && (
        <section className="panel">
          <div role="alert">
            <Empty
              title="Classes could not be loaded"
              body={error}
              action={
                <button
                  className="button"
                  onClick={() => {
                    setLoading(true);
                    setRevision((value) => value + 1);
                  }}
                >
                  Retry
                </button>
              }
            />
          </div>
        </section>
      )}
      {!loading && !error && !classes.length && (
        <section className="panel">
          <Empty
            title="No classes available"
            body="Create a class before taking attendance."
          />
        </section>
      )}
      <div hidden={loading || !!error}>
        {classId && (
          <AttendanceRegister schoolId={schoolId}
            key={`${classId}/${date}`}
            refreshRevision={sessionRevision}
            onProtectionChange={setProtectedDraft}
            classes={classes}
            classId={classId}
            date={date}
            onClassChange={setClassId}
            onDateChange={setDate}
            notify={notify}
          />
        )}
      </div>
    </>
  );
}
