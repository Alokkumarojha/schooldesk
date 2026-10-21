'use client';

import { useCallback, useRef, useState } from 'react';
import { useWorkspaceRefresh } from '@/lib/use-workspace-refresh';
import type { FormTarget, Notice, RecordSubmission } from '@/lib/demo';
import { loadNotices, mutateNotice, noticeAudience, noticeRow, NoticeRequestError, type ApiNotice } from '@/lib/notices-client';
import { Notices } from './management';
import { RecordForm } from './record-form';
import { Dialog, Empty } from './ui';
import { Icon } from './icon';

export function NoticesWorkspace({ schoolId, active, form, onEdit, onClose, notify, onCount }: {
  schoolId: string;
  active: boolean;
  form: Extract<FormTarget, { kind: 'notice' }> | null; onEdit: (notice: Notice) => void; onClose: () => void;
  notify: (message: string) => void; onCount: (count: number) => void;
}) {
  const [notices, setNotices] = useState<ApiNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<Notice | null>(null);
  const busy = useRef(false);
  const refreshOnVisit = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    await loadNotices(schoolId, signal).then(records => { if (!signal.aborted) { setNotices(records); onCount(records.length); setLoadError(''); } })
      .catch(() => { if (!signal.aborted) setLoadError('Unable to load notices. Check your connection and try again.'); })
      .finally(() => { if (!signal.aborted) setLoading(false); });
  }, [onCount, schoolId]);
  useWorkspaceRefresh(active, pending || !!deleting || (!!form && !loading), revision, refreshOnVisit);
  const close = () => { if (!busy.current) { setError(''); onClose(); } };
  async function change(method: 'POST' | 'PUT' | 'DELETE', id?: string, input?: Parameters<typeof mutateNotice>[3]) {
    if (busy.current || loading || loadError) return;
    busy.current = true; setPending(true); setError('');
    try {
      await mutateNotice(schoolId, method, id, input);
      onClose(); setDeleting(null);
      try { const records = await loadNotices(schoolId); setNotices(records); onCount(records.length); }
      catch { setLoadError('Changes were saved, but notices could not be refreshed. Please retry.'); }
      notify(`Notice ${method === 'POST' ? 'added' : method === 'PUT' ? 'updated' : 'deleted'} successfully.`);
    } catch (failure) { setError(failure instanceof NoticeRequestError ? failure.message : 'Unable to save changes. Check your connection and try again.'); }
    finally { busy.current = false; setPending(false); }
  }
  function save(submission: RecordSubmission, date?: string) {
    if (submission.kind !== 'notice') return;
    return change(form?.existing ? 'PUT' : 'POST', form?.existing?.id, { ...submission.data, audience: noticeAudience(submission.data.audience), date: date ?? '' });
  }
  return <>
    {loading ? <section className="panel"><div className="empty" role="status">Loading notices…</div></section>
      : loadError ? <section className="panel"><div role="alert"><Empty title="Notices could not be loaded" body={loadError} action={<button className="button" onClick={() => { setLoading(true); setRevision(value => value + 1); }}>Retry</button>} /></div></section>
        : null}
    <div hidden={loading || !!loadError}><Notices notices={notices.map(noticeRow)} disabled={pending} onEdit={notice => { setError(''); onEdit(notice); }} onDelete={notice => { setError(''); setDeleting(notice); }} /></div>
    {form && (loading || loadError ? <Dialog title="Notice records" onClose={close}><div className="form"><p role="status">Load notices before adding or editing records.</p><button className="button" onClick={close}>Close</button></div></Dialog>
      : <RecordForm target={form} students={[]} teachers={[]} onClose={close} onSave={save} noticeSettings={{ pending, error }} />)}
    {deleting && <Dialog title="Delete notice?" onClose={() => { if (!busy.current) setDeleting(null); }}><div className="form">
      <div className="confirmation-icon"><Icon name="trash" size={24} /></div><p>Remove <strong>“{deleting.title}”</strong> from the notice board?</p>
      <p className="secondary">This permanently deletes the notice from the database.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button" disabled={pending} data-autofocus onClick={() => setDeleting(null)}>Keep notice</button>
        <button className="button danger" disabled={pending} onClick={() => change('DELETE', deleting.id)}><Icon name="trash" size={17} />{pending ? 'Deleting…' : 'Delete notice'}</button></div>
    </div></Dialog>}
  </>;
}
