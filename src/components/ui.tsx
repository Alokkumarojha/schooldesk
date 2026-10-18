'use client';

import { ReactNode, useEffect, useId, useRef } from 'react';
import { Icon } from './icon';
import { initials } from '@/lib/demo';

export function Dialog({ title, children, onClose, variant = 'form' }: {
  title: string; children: ReactNode; onClose: () => void; variant?: 'form' | 'drawer';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    element?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={ref} className={`modal ${variant === 'drawer' ? 'drawer' : ''}`} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="iconbutton" aria-label={`Close ${variant === 'drawer' ? 'navigation' : 'dialog'}`} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Person({ name, id, index = 0 }: { name: string; id?: string; index?: number }) {
  return <div className="row-person">
    <div className={`avatar ${index % 3 === 1 ? 'teal' : index % 3 === 2 ? 'purple' : ''}`} aria-hidden="true">{initials(name)}</div>
    <div className="person-copy"><strong>{name}</strong>{id && <small>{id}</small>}</div>
  </div>;
}

export function Empty({ title = 'No matching records', body = 'Try a different search or clear your filters.', action }: {
  title?: string; body?: string; action?: ReactNode;
}) {
  return <div className="empty">
    <span className="empty-icon"><Icon name="search" size={24} /></span>
    <h3>{title}</h3><p>{body}</p>{action && <div className="empty-action">{action}</div>}
  </div>;
}

export function Search({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="search">
    <Icon name="search" size={18} />
    <input type="search" aria-label={placeholder} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    {value && <button className="search-clear iconbutton" type="button" aria-label="Clear search" onClick={() => onChange('')}><Icon name="close" size={16} /></button>}
  </div>;
}

export function StatusBadge({ status }: { status: 'Active' | 'Inactive' }) {
  return <span className={`badge ${status === 'Active' ? 'green' : ''}`}>{status}</span>;
}

export function TableRegion({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`table-scroll ${className}`} role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

export type ToastMessage = { id: number; text: string };
export function Toast({ message, onDismiss }: { message: ToastMessage | null; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!message) return;
    const timer = window.setInterval(() => {
      const element = ref.current;
      if (!element?.matches(':hover') && !element?.contains(document.activeElement)) onDismiss();
    }, 6500);
    return () => window.clearInterval(timer);
  }, [message, onDismiss]);
  return <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
    {message && <div ref={ref} className="toast" key={message.id}>
      <Icon name="check" size={20} /><span>{message.text}</span>
      <button className="iconbutton" type="button" onClick={onDismiss} aria-label="Dismiss message"><Icon name="close" size={18} /></button>
    </div>}
  </div>;
}
