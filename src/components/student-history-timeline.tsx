'use client';

import { useEffect, useRef, useState } from 'react';
import { loadStudentHistory, saveStudentRemark, type HistoryEvent } from '@/lib/student-profile-client';
import { humanLabel } from '@/lib/student-profile-fields';
import { remarkCategories, remarkSchema } from '@/lib/student-remarks';
import { Dialog, Empty } from './ui';

export function HistoryEntry({ event }: { event: HistoryEvent }) {
  const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(event.createdAt));
  return <li className="history-entry">
    <div className="history-entry-meta"><span className="badge blue">{humanLabel(event.logType)}</span>
      {event.remarkCategory && <span className="badge" aria-label={`Remark category: ${remarkCategories[event.remarkCategory]}`}>{remarkCategories[event.remarkCategory]}</span>}
      <time dateTime={event.createdAt}>{date} IST</time></div>
    <h3>{event.title}</h3>
    {event.description && <p className="history-description">{event.description}</p>}
    {(event.fromClassId !== event.toClassId) && <p className="secondary">Class: {event.fromClassNameSnapshot ?? 'No previous class'}{event.fromClassCodeSnapshot ? ` (${event.fromClassCodeSnapshot})` : ''} → {event.toClassNameSnapshot ?? 'No destination class'}{event.toClassCodeSnapshot ? ` (${event.toClassCodeSnapshot})` : ''}</p>}
    {event.fromStatus !== event.toStatus && <p className="secondary">Status: {event.fromStatus ? humanLabel(event.fromStatus) : 'Not recorded'} → {event.toStatus ? humanLabel(event.toStatus) : 'Not recorded'}</p>}
    {event.academicYear && <p className="secondary">Academic year: {event.academicYear}</p>}
    <p className="secondary">Recorded by {event.creator?.name || (event.createdById ? 'School member' : 'System / not recorded')}{event.creator?.role ? ` · ${humanLabel(event.creator.role)}` : ''}</p>
  </li>;
}

export function RemarkDraft({ schoolId, studentId, onClose, onSaved }: {
  schoolId: string; studentId: string; onClose: () => void; onSaved: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const submission = useRef<{ content: string; key: string } | null>(null);
  function close() { if (!inFlight.current) { if (dirty) setDiscard(true); else onClose(); } }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = new FormData(event.currentTarget);
    const parsed = remarkSchema.safeParse({ title: form.get('title'), category: form.get('category'), description: form.get('description') });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join(' ')); return; }
    const content = JSON.stringify(parsed.data);
    if (!submission.current || submission.current.content !== content) submission.current = { content, key: crypto.randomUUID() };
    inFlight.current = true; setSaving(true); setError('');
    try {
      await saveStudentRemark(schoolId, studentId, parsed.data, submission.current.key);
      onSaved();
    } catch (failure) {
      setError((failure instanceof Error ? failure.message : 'Unable to save remark. Please retry.') + ' Your draft is retained. Retry unchanged content to avoid a duplicate if the earlier response was lost.');
    } finally { inFlight.current = false; setSaving(false); }
  }
  return <Dialog title="Add academic remark" onClose={close}>
    <form className="form" onSubmit={submit} onChange={() => setDirty(true)} aria-busy={saving}>
      <p className="form-note">Remarks are permanent history entries and cannot be edited or deleted.</p>
      {error && <p className="form-error" role="alert" id="remark-error">{error}</p>}
      <fieldset className="form-fields" hidden={discard} disabled={saving} aria-describedby={error ? 'remark-error' : undefined}>
        <div className="field"><label htmlFor="remark-title">Remark title *</label><input id="remark-title" name="title" required maxLength={160} data-autofocus /></div>
        <div className="field"><label htmlFor="remark-category">Category *</label><select id="remark-category" name="category" required defaultValue=""><option value="" disabled>Choose a category</option>{Object.entries(remarkCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="remark-description">Description *</label><textarea id="remark-description" name="description" required maxLength={3000} rows={5} /></div>
      </fieldset>
      {discard ? <div role="alert"><h3>Discard this draft?</h3><div className="form-actions"><button type="button" className="button" onClick={() => setDiscard(false)}>Keep draft</button><button type="button" className="button danger" onClick={onClose}>Discard</button></div></div>
        : <div className="form-actions"><button type="button" className="button" disabled={saving} onClick={close}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save Remark'}</button></div>}
    </form>
  </Dialog>;
}

export function StudentHistoryTimeline({ schoolId, studentId }: { schoolId: string; studentId: string }) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [remark, setRemark] = useState(false);
  const [canAddRemark, setCanAddRemark] = useState(false);
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const moreRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadStudentHistory(schoolId, studentId, undefined, controller.signal).then(data => {
      if (!controller.signal.aborted) { setCanAddRemark(data.permissions?.canAddRemark === true); setEvents(data.history); setCursor(data.nextCursor); setLoaded(true); setError(''); }
    }).catch(() => { if (!controller.signal.aborted) setError('History could not be loaded. Please retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); moreRequest.current?.abort(); };
  }, [schoolId, studentId, revision]);
  async function more() {
    if (!cursor || busy.current) return;
    busy.current = true; setLoading(true); setError('');
    const controller = new AbortController(); moreRequest.current = controller;
    try {
      const page = await loadStudentHistory(schoolId, studentId, cursor, controller.signal);
      if (!controller.signal.aborted) {
        setEvents(previous => [...previous, ...page.history.filter(event => !previous.some(old => old.id === event.id))]);
        setCursor(page.nextCursor);
      }
    } catch { if (!controller.signal.aborted) setError('More history could not be loaded. Please retry.'); }
    finally { busy.current = false; if (!controller.signal.aborted) setLoading(false); }
  }
  return <section className="panel student-history-panel" aria-label="Student history">
    <div className="panel-head"><div><h2>History</h2><p className="secondary">Newest first · historical snapshots</p></div><button className="button" disabled={!canAddRemark || loading || !!error} onClick={() => setRemark(true)}>Add Remark</button></div>
    <div className="panel-body">
      {saved && <p role="status">Academic remark saved.</p>}
      {loaded && !canAddRemark && <p className="secondary">History is read-only. Only school owners and administrators can add remarks.</p>}
      {error && <div role="alert" className="form-error">{error}<button className="button" disabled={loading} onClick={() => { setLoading(true); setRevision(value => value + 1); }}>Retry history</button></div>}
      {loading && <p role="status">Loading history…</p>}
      {!loading && loaded && !events.length && <Empty title="No history yet" body="New student changes will appear here. Earlier events have not been backfilled." />}
      {!!events.length && <ol className="history-timeline">{events.map(event => <HistoryEntry key={event.id} event={event} />)}</ol>}
      {cursor && <button className="button" disabled={loading} onClick={more}>{loading ? 'Loading…' : 'Load older events'}</button>}
    </div>
    {remark && canAddRemark && <RemarkDraft schoolId={schoolId} studentId={studentId} onClose={() => setRemark(false)} onSaved={() => { setRemark(false); setSaved(true); moreRequest.current?.abort(); setCursor(null); setLoading(true); setRevision(value => value + 1); }} />}
  </section>;
}
