'use client';

import { useEffect, useRef, useState } from 'react';
import { Mark, attendanceStatuses } from '@/lib/demo';
import type { ApiClass } from '@/lib/students-client';
import { attendanceInput, attendanceMarks, loadAttendance, saveAttendance, validAttendanceDate, type AttendanceResponse } from '@/lib/attendance-client';
import { Dialog, Empty, Person, TableRegion } from './ui';
import { Icon } from './icon';

export function AttendanceRegister({ schoolId, classes, classId, date, onClassChange, onDateChange, notify, refreshRevision, onProtectionChange }: {
  schoolId: string;
  refreshRevision: number; onProtectionChange: (protectedDraft: boolean) => void;
  classes: ApiClass[]; classId: string; date: string; onClassChange: (id: string) => void; onDateChange: (date: string) => void;
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [baseline, setBaseline] = useState<Record<string, Mark>>({});
  const [draft, setDraft] = useState<Record<string, Mark> | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const validDate = validAttendanceDate(date);
  useEffect(() => {
    if (!validDate) return;
    const controller = new AbortController();
    // A deferred read also lets cleanup cancel an obsolete session before it starts.
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      return loadAttendance(schoolId, classId, date, controller.signal);
    }).then(result => {
      if (!result) return;
      if (controller.signal.aborted) return;
      setData(result); setBaseline(attendanceMarks(result.attendance)); setDraft(null); setLoadError(''); setSaveError('');
    }).catch(() => { if (!controller.signal.aborted) setLoadError('Unable to load attendance. Check your connection and retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [schoolId, classId, date, validDate, revision, refreshRevision]);
  const marks = draft ?? baseline;
  const roster = data?.students ?? [];
  const dirty = roster.some(student => marks[student.id] !== baseline[student.id]);
  useEffect(() => { onProtectionChange(dirty || pending); }, [dirty, pending, onProtectionChange]);
  const marked = roster.filter(student => marks[student.id]).length;
  const complete = marked === roster.length;
  const ready = validDate && !loading && !loadError && data !== null;
  const canSave = ready && !pending && complete && (dirty || !data?.attendance.exists);
  const save = async () => {
    if (!canSave || busy.current) return;
    busy.current = true; setPending(true); setSaveError('');
    try {
      const session = await saveAttendance(schoolId, attendanceInput(classId, date, roster, marks));
      setData(previous => previous ? { ...previous, attendance: session } : previous);
      setBaseline(attendanceMarks(session)); setDraft(null);
      notify('Attendance saved successfully.');
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Unable to save attendance. Please try again.'); }
    finally { busy.current = false; setPending(false); }
  };

  return <section className="panel attendance-panel" aria-label="Class attendance register">
    <div className="toolbar attendance-toolbar">
      <label className="filter-label">Class<select disabled={dirty || pending} value={classId} onChange={event => onClassChange(event.target.value)} aria-describedby={dirty ? 'attendance-help' : undefined}>
        {classes.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select></label>
      <label className="filter-label">Date<input type="date" required disabled={dirty || pending} value={date} onChange={event => onDateChange(event.target.value)} aria-invalid={!validDate} aria-describedby={!validDate ? 'attendance-date-error' : dirty ? 'attendance-help' : undefined} /></label>
      <button className="button bulk-mark" disabled={!ready || pending || !roster.length} onClick={() => setDraft(Object.fromEntries(roster.map(student => [student.id, 'Present' as Mark])))}><Icon name="check" size={17} />Mark all present</button>
    </div>
    {!validDate && <p className="inline-error" id="attendance-date-error" role="alert">Choose a valid date before marking attendance.</p>}
    {validDate && loading && <div className="empty" role="status">Loading attendance…</div>}
    {loadError && <div role="alert"><Empty title="Attendance could not be loaded" body={loadError} action={<button className="button" onClick={() => { setLoading(true); setRevision(value => value + 1); }}>Retry</button>} /></div>}
    {saveError && <p className="inline-error" role="alert">{saveError}</p>}
    {ready && <>
    <p className="secondary panel-body">{data.attendance.exists
      ? 'Saved roster for this date. Later class or enrolment status changes do not change its members.'
      : 'This unsaved session uses all students currently assigned to the class, including inactive students. For past dates, this may differ from the historical roster.'}</p>
    <div className="attendance-summary" aria-label="Attendance totals">
      <div><strong>{roster.length}</strong><span>Students</span></div>
      {attendanceStatuses.map(status => <div key={status} className={`summary-${status.toLowerCase()}`}><strong>{roster.filter(student => marks[student.id] === status).length}</strong><span>{status}</span></div>)}
      <div><strong>{roster.length - marked}</strong><span>Unmarked</span></div>
    </div>
    <TableRegion label="Student attendance" className="attendance-table">
      <table><caption className="sr-only">Set one attendance status for each student</caption>
        <thead><tr><th scope="col">Student</th><th scope="col">Attendance status</th></tr></thead>
        <tbody>{roster.map((student, index) => <tr key={student.id}>
          <th scope="row"><Person name={student.name} id={student.studentId} index={index} /></th>
          <td><fieldset className="mark-group" disabled={!ready || pending}>
            <legend className="sr-only">Attendance for {student.name}</legend>
            {attendanceStatuses.map(status => <label className={`mark ${status} ${marks[student.id] === status ? 'selected' : ''}`} key={status}>
              <input className="sr-only" type="radio" name={`attendance-${student.id}`} value={status} checked={marks[student.id] === status}
                onChange={() => setDraft({ ...marks, [student.id]: status })} />
              <Icon name={status === 'Present' ? 'check' : status === 'Absent' ? 'close' : 'clock'} size={14} />
              {status}
            </label>)}
          </fieldset></td>
        </tr>)}</tbody>
      </table>
      {!roster.length && <Empty title={data.attendance.exists ? 'No students in this saved roster' : 'No students in this class'}
        body={data.attendance.exists ? 'This session was saved with an empty roster. Students added later are not included.' : 'This class has no students. You can save an empty register or choose another class.'} />}
    </TableRegion>
    <div className="attendance-savebar">
      <div className="savebar-copy">
        <span className={`badge ${dirty ? 'orange' : data?.attendance.exists ? 'green' : ''}`}>{dirty ? 'Unsaved changes' : data?.attendance.exists ? 'Saved' : 'Not recorded'}</span>
        <p id="attendance-help">{dirty
          ? complete ? 'Ready to save. Save or discard before changing class or date.' : `Mark all students to save. ${roster.length - marked} still unmarked.`
          : data?.attendance.exists ? 'You can update this saved register at any time.' : 'Mark each student present, absent or late.'}</p>
      </div>
      <div className="action-group">
        {dirty && <button className="button" disabled={pending} onClick={() => setConfirmDiscard(true)}>Discard</button>}
        <button className="button primary" disabled={!canSave} aria-describedby="attendance-help" onClick={save}><Icon name="check" size={17} />{pending ? 'Saving…' : 'Save attendance'}</button>
      </div>
    </div>
    {!dirty && <button className="button quiet" disabled={pending} onClick={() => { setLoading(true); setRevision(value => value + 1); }}>Reload attendance</button>}
    </>}
    {confirmDiscard && <Dialog title="Discard attendance changes?" onClose={() => setConfirmDiscard(false)}>
      <div className="form"><p>Your unsaved marks will be removed. Previously saved attendance will stay unchanged.</p>
        <div className="form-actions"><button className="button" data-autofocus onClick={() => setConfirmDiscard(false)}>Keep editing</button>
          <button className="button danger" onClick={() => { setDraft(null); setSaveError(''); setConfirmDiscard(false); notify('Unsaved attendance changes discarded.'); }}>Discard changes</button>
        </div>
      </div>
    </Dialog>}
  </section>;
}
