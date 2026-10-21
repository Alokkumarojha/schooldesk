'use client';

import { useEffect, useRef, useState } from 'react';
import { loadStudentHistory, type HistoryEvent } from '@/lib/student-profile-client';
import { humanLabel } from '@/lib/student-profile-fields';
import { remarkCategories, remarkUnavailableMessage } from '@/lib/student-remarks';
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

function RemarkDraft({ onClose }: { onClose: () => void }) {
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  return <Dialog title="Add academic remark" onClose={() => dirty ? setDiscard(true) : onClose()}>
    <form className="form" onSubmit={event => event.preventDefault()} onChange={() => setDirty(true)}>
      <p className="form-note" role="status">{remarkUnavailableMessage} This draft is not stored.</p>
      <fieldset className="form-fields" hidden={discard}>
        <div className="field"><label htmlFor="remark-title">Remark title *</label><input id="remark-title" name="title" required maxLength={160} data-autofocus /></div>
        <div className="field"><label htmlFor="remark-category">Category *</label><select id="remark-category" name="category" required defaultValue=""><option value="" disabled>Choose a category</option>{Object.entries(remarkCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="remark-description">Description *</label><textarea id="remark-description" name="description" required maxLength={3000} rows={5} /></div>
      </fieldset>
      {discard ? <div role="alert"><h3>Discard this draft?</h3><div className="form-actions"><button type="button" className="button" onClick={() => setDiscard(false)}>Keep draft</button><button type="button" className="button danger" onClick={onClose}>Discard</button></div></div>
        : <div className="form-actions"><button type="button" className="button" onClick={() => dirty ? setDiscard(true) : onClose()}>Cancel</button><button type="submit" className="button primary" disabled title="Category storage requires approval">Save Remark — unavailable</button></div>}
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
  const busy = useRef(false);
  const moreRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadStudentHistory(schoolId, studentId, undefined, controller.signal).then(data => {
      if (!controller.signal.aborted) { setEvents(data.history); setCursor(data.nextCursor); setLoaded(true); setError(''); }
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
    <div className="panel-head"><div><h2>History</h2><p className="secondary">Newest first · historical snapshots</p></div><button className="button" onClick={() => setRemark(true)}>Add Remark</button></div>
    <div className="panel-body">
      {error && <div role="alert" className="form-error">{error}<button className="button" disabled={loading} onClick={() => { if (loaded) void more(); else { setLoading(true); setRevision(value => value + 1); } }}>Retry history</button></div>}
      {loading && <p role="status">Loading history…</p>}
      {!loading && loaded && !events.length && <Empty title="No history yet" body="New student changes will appear here. Earlier events have not been backfilled." />}
      {!!events.length && <ol className="history-timeline">{events.map(event => <HistoryEntry key={event.id} event={event} />)}</ol>}
      {cursor && <button className="button" disabled={loading} onClick={more}>{loading ? 'Loading…' : 'Load older events'}</button>}
    </div>
    {remark && <RemarkDraft onClose={() => setRemark(false)} />}
  </section>;
}
