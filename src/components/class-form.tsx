'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import type { ClassInput, DatabaseClass } from '@/lib/classes-client';
import type { ApiTeacher } from '@/lib/teachers-client';
import { Dialog } from './ui';

export function ClassForm({ existing, teachers, pending, blocked, error, onClose, onSave }: {
  existing?: DatabaseClass; teachers: ApiTeacher[]; pending: boolean; blocked: boolean; error: string;
  onClose: () => void; onSave: (input: ClassInput) => void;
}) {
  const prefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const available = teachers.filter(teacher => !teacher.classTeacherOf || teacher.classTeacherOf.id === existing?.id);
  const [teacherId, setTeacherId] = useState(existing?.classTeacher?.id ?? '');
  const safeTeacherId = available.some(teacher => teacher.id === teacherId) ? teacherId : '';
  const close = () => { if (!pending) { if (dirty) setDiscard(true); else onClose(); } };
  const props = (name: string) => ({ name, id: `${prefix}-${name}`, 'aria-invalid': !!fields[name], 'aria-describedby': fields[name] ? `${prefix}-${name}-error` : undefined });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || blocked) return;
    const data = new FormData(event.currentTarget);
    const get = (name: string) => String(data.get(name) ?? '').trim();
    const next: Record<string, string> = {};
    for (const [name, max] of [['code', 40], ['name', 100], ['room', 80]] as const) {
      if (!get(name) || get(name).length > max) next[name] = `Enter a value of at most ${max} characters.`;
    }
    const capacity = Number(get('capacity'));
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000) next.capacity = 'Enter a whole number from 1 to 1000.';
    setFields(next);
    if (Object.keys(next).length) {
      const element = event.currentTarget.elements.namedItem(Object.keys(next)[0]);
      if (element instanceof HTMLElement) element.focus();
      return;
    }
    onSave({ code: get('code'), name: get('name'), room: get('room'), capacity, classTeacherId: safeTeacherId || null });
  }
  return <Dialog title={existing ? 'Edit class' : 'Add class'} onClose={close}>
    <form className="form" ref={formRef} noValidate onSubmit={submit} onChange={event => {
      setDirty(true);
      const control = event.target;
      if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) setFields(previous => { const next = { ...previous }; delete next[control.name]; return next; });
    }}>
      <p className="form-intro">Keep class details and capacity up to date. Class teacher is optional.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <fieldset className="form-fields" disabled={pending || blocked} hidden={discard}>
        {(['code', 'name', 'room', 'capacity'] as const).map(name => <div className="field" key={name}>
          <label htmlFor={`${prefix}-${name}`}>{({ code: 'Class code', name: 'Class name', room: 'Room', capacity: 'Capacity' })[name]} <span aria-hidden="true" className="required-mark">*</span></label>
          <input {...props(name)} type={name === 'capacity' ? 'number' : 'text'} required
            min={name === 'capacity' ? 1 : undefined} max={name === 'capacity' ? 1000 : undefined} step={name === 'capacity' ? 1 : undefined}
            maxLength={name === 'code' ? 40 : name === 'name' ? 100 : name === 'room' ? 80 : undefined}
            defaultValue={existing?.[name] ?? (name === 'capacity' ? 30 : '')} data-autofocus={name === 'code' || undefined} />
          {fields[name] && <p className="field-error" id={`${prefix}-${name}-error`}>{fields[name]}</p>}
        </div>)}
        <div className="field"><label htmlFor={`${prefix}-teacher`}>Class teacher</label>
          <select id={`${prefix}-teacher`} name="classTeacherId" value={safeTeacherId} onChange={event => setTeacherId(event.target.value)}>
            <option value="">Unassigned</option>{available.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.teacherId}</option>)}
          </select>
        </div>
      </fieldset>
      {discard ? <div className="discard-prompt" role="alert"><h3>Discard your changes?</h3><p>Your edits have not been saved.</p><div className="form-actions">
        <button type="button" className="button" onClick={() => { setDiscard(false); requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()); }}>Keep editing</button>
        <button type="button" className="button danger" onClick={onClose}>Discard changes</button>
      </div></div> : <><p className="form-note">Class changes are saved to the database. Capacity changes never remove students.</p>
        <div className="form-actions"><button type="button" className="button" disabled={pending} onClick={close}>Cancel</button>
          <button className="button primary" disabled={pending || blocked}>{pending ? 'Saving…' : existing ? 'Save changes' : 'Add class'}</button></div></>}
    </form>
  </Dialog>;
}
