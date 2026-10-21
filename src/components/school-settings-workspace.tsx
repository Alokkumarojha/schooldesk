'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useWorkspaceRefresh } from '@/lib/use-workspace-refresh';
import { loadSchoolSettings, saveSchoolSettings, SchoolSettingsError } from '@/lib/school-settings-client';
import { schoolBoards, schoolSettingsPatchSchema, schoolSettingsSchema, schoolSetupChecklist, settingsLabels,
  settingsValidationMessages, type SchoolSettings, type SchoolSettingsValues } from '@/lib/school-settings';
import { Empty } from './ui';
import { Icon } from './icon';

function SchoolLogo({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || !schoolSettingsSchema.shape.logoUrl.safeParse(url).success) return <p className="secondary">No logo configured. A logo is optional.</p>;
  return failed ? <p className="secondary" role="status">Logo could not be loaded. Check the image URL.</p>
    : <Image src={url} alt="School logo preview" width={80} height={80} className="school-logo" unoptimized referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

const maxLengths = { name: 160, code: 40, logoUrl: 2048, addressLine: 240, city: 100, state: 100, pincode: 12, academicYear: 9, phone: 40, email: 160 };
const hints: Partial<Record<keyof SchoolSettingsValues, string>> = {
  academicYear: 'Use consecutive years, for example 2026-2027. This label does not move or change historical records.',
  logoUrl: 'Use an HTTPS image URL. File uploads are not available yet.',
  code: 'Letters, numbers, hyphens and underscores. The school code must be unique.',
};

export function SchoolSettingsWorkspace({ schoolId, active, onSchoolChange, notify }: {
  schoolId: string; active: boolean; onSchoolChange: (school: SchoolSettings) => void; notify: (message: string) => void;
}) {
  const [saved, setSaved] = useState<SchoolSettings | null>(null);
  const [draft, setDraft] = useState<SchoolSettingsValues | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const dirty = !!draft && !!saved && schoolSettingsSchema.keyof().options.some(key => draft[key] !== saved[key]);
  const refresh = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const result = await loadSchoolSettings(schoolId, signal);
      if (signal.aborted) return;
      setSaved(result.school); setDraft(result.school); setCanEdit(result.canEdit);
      setLoadError(''); setFields({}); setSaveError(''); setSuccess('');
      onSchoolChange(result.school);
    } catch (error) {
      if (!signal.aborted) setLoadError(error instanceof SchoolSettingsError ? error.message : 'Unable to load school settings. Please retry.');
    } finally { if (!signal.aborted) setLoading(false); }
  }, [schoolId, onSchoolChange]);
  useWorkspaceRefresh(active, dirty || saving, revision, refresh);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function focusField(field: keyof SchoolSettingsValues) { document.getElementById(`school-${field}`)?.focus(); }
  function changeText(field: Exclude<keyof SchoolSettingsValues, 'board'>, value: string) {
    setDraft(current => current ? { ...current, [field]: value } : current);
    setFields(current => ({ ...current, [field]: '' })); setSuccess('');
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !saved || !canEdit || busy.current || !dirty) return;
    const changed = Object.fromEntries(schoolSettingsSchema.keyof().options.filter(key => draft[key] !== saved[key]).map(key => [key, draft[key]]));
    const parsed = schoolSettingsPatchSchema.safeParse(changed);
    if (!parsed.success) {
      setFields(settingsValidationMessages(parsed.error)); setSaveError('Check the highlighted fields.');
      const first = schoolSettingsSchema.keyof().options.find(key => parsed.error.issues.some(issue => issue.path[0] === key));
      if (first) focusField(first);
      return;
    }
    busy.current = true; setSaving(true); setSaveError(''); setFields({}); setSuccess('');
    try {
      const result = await saveSchoolSettings(schoolId, parsed.data);
      setSaved(result.school); setDraft(result.school); setCanEdit(result.canEdit); onSchoolChange(result.school);
      setSuccess('School settings saved.'); notify('School settings saved successfully.');
    } catch (error) {
      setSaveError(error instanceof SchoolSettingsError ? error.message : 'Unable to save settings. Please retry.');
      if (error instanceof SchoolSettingsError) setFields(error.fields);
    } finally { busy.current = false; setSaving(false); }
  }

  if (loading) return <section className="panel"><div className="empty" role="status">Loading school settings…</div></section>;
  if (loadError || !saved || !draft) return <section className="panel"><div role="alert"><Empty title="School settings unavailable" body={loadError || 'Please reload your school settings.'}
    action={<button className="button" onClick={() => { setLoading(true); setRevision(value => value + 1); }}>Retry</button>} /></div></section>;
  const checklist = schoolSetupChecklist(saved);
  const recommended = checklist.filter(step => !step.optional);
  const completed = recommended.filter(step => !step.missing.length).length;
  const next = recommended.find(step => step.missing.length)?.missing[0];

  return <div className="settings-layout">
    <section className="panel setup-checklist" aria-labelledby="setup-title">
      <div className="panel-head"><div><h2 id="setup-title">Set up your school</h2><p>Complete the profile of your existing school.</p></div></div>
      <div className="panel-body">
        <p role="status">{completed} of {recommended.length} recommended steps complete</p>
        <progress max={recommended.length} value={completed} aria-label="Saved school setup progress" />
        <ol className="setup-steps">{checklist.map(step => <li key={step.id}>
          <span className={`badge ${step.missing.length ? '' : 'green'}`}>{step.missing.length ? step.optional ? 'Optional' : 'Incomplete' : 'Complete'}</span>
          <h3>{step.title}</h3><p className="secondary">{step.missing.length ? `Add or review: ${step.missing.map(field => settingsLabels[field]).join(', ')}.` : 'Saved and ready.'}</p>
          {canEdit && step.missing.length > 0 && <button className="button small" disabled={saving} onClick={() => focusField(step.missing[0])}>Review {step.title.toLowerCase()}</button>}
        </li>)}</ol>
        {canEdit && next && <button className="button primary" disabled={saving} onClick={() => focusField(next)}>Continue setup</button>}
        <p className="secondary">Progress reflects saved settings. No school or membership is created by this setup.</p>
      </div>
    </section>
    <section className="panel" aria-labelledby="settings-title">
      <div className="panel-head"><div><h2 id="settings-title">School profile</h2><p>{canEdit ? 'Update your school details.' : 'View only. An owner or administrator can update these details.'}</p></div></div>
      <form className="form school-settings-form" onSubmit={save} noValidate aria-busy={saving}>
        {checklist.map(step => <fieldset key={step.id} disabled={saving}>
          <legend>{step.title}{step.optional ? ' (optional)' : ''}</legend>
          <div className="form-grid">{step.fields.map(field => <label key={field} htmlFor={`school-${field}`}>
            {settingsLabels[field]}{field === 'name' ? ' *' : ''}
            {field === 'board' ? <select id="school-board" value={draft.board ?? ''} disabled={!canEdit} aria-invalid={!!fields.board} aria-describedby={fields.board ? 'school-board-error' : undefined}
              onChange={event => {
                const board = schoolSettingsSchema.shape.board.safeParse(event.target.value || null);
                if (board.success) setDraft(current => current ? { ...current, board: board.data } : current);
                setFields(current => ({ ...current, board: '' })); setSuccess('');
              }}><option value="">Not configured</option>{schoolBoards.map(board => <option key={board} value={board}>{board.replaceAll('_', ' ')}</option>)}</select>
              : <input id={`school-${field}`} name={field} value={draft[field] ?? ''} readOnly={!canEdit} required={field === 'name'} maxLength={maxLengths[field]}
                type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : field === 'logoUrl' ? 'url' : 'text'}
                aria-invalid={!!fields[field]} aria-describedby={[hints[field] ? `school-${field}-hint` : '', fields[field] ? `school-${field}-error` : ''].filter(Boolean).join(' ') || undefined}
                onChange={event => changeText(field, event.target.value)} />}
            {hints[field] && <small className="secondary" id={`school-${field}-hint`}>{hints[field]}</small>}
            {fields[field] && <small className="field-error" id={`school-${field}-error`}>{fields[field]}</small>}
          </label>)}</div>
          {step.id === 'branding' && <SchoolLogo key={draft.logoUrl} url={draft.logoUrl} />}
        </fieldset>)}
        {saveError && <p className="form-error" role="alert">{saveError}{fields._form && ` ${fields._form}`}</p>}
        {success && <p className="settings-success" role="status"><Icon name="check" size={16} />{success}</p>}
        {canEdit && <div className="form-actions"><span className="secondary" role="status">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <button type="button" className="button" disabled={saving || !dirty} onClick={() => { setDraft(saved); setFields({}); setSaveError(''); setSuccess(''); }}>Discard changes</button>
          <button type="submit" className="button primary" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>}
      </form>
    </section>
  </div>;
}
