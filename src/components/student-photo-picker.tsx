'use client';

import Image from 'next/image';
import type { PhotoDraft } from '@/lib/student-photo-client';
import { useEffect, useId, useRef, useState } from 'react';

// Convenience checks only. The upload endpoint also validates actual bytes.
export function photoSelectionError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG or WebP image.';
  if (!file.size || file.size > 2 * 1024 * 1024) return 'Choose a non-empty image no larger than 2 MB.';
  return null;
}

export function StudentPhotoPicker({ existingSrc, hasPhoto, disabled, onDraftChange }: {
  existingSrc: string | null; hasPhoto: boolean; disabled: boolean; onDraftChange: (draft: PhotoDraft) => void;
}) {
  const id = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(false);
  const objectUrl = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  function release() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null; setPreview(null);
    if (input.current) input.current.value = '';
  }
  const src = removed ? null : preview ?? existingSrc;
  const changed = !!preview || removed;
  return <div className="field student-photo-picker">
    <label htmlFor={id}>Choose Photo</label>
    <div className="student-photo-preview">
      {src && !failed ? <Image src={src} alt={preview ? 'Selected photo preview — not saved' : 'Current student photo'} width={96} height={96} unoptimized onError={() => { setFailed(true); setError('This image could not be previewed. Choose another photo.'); }} /> : <span>{removed ? 'Photo removed from preview' : 'No photo preview'}</span>}
    </div>
    <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
      aria-invalid={!!error} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
      onChange={event => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        const problem = photoSelectionError(file);
        if (problem) { setError(problem); event.currentTarget.value = ''; return; }
        let url: string;
        try { url = URL.createObjectURL(file); } catch { setError('Unable to preview this image. Try another photo.'); return; }
        release(); objectUrl.current = url; setPreview(url); setRemoved(false); setFailed(false); setError(''); onDraftChange({ type: 'upload', file });
      }} />
    <p id={`${id}-help`} className="form-intro">JPEG, PNG or WebP · maximum 2 MB. Photo changes are applied when you save the profile.</p>
    {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
    <div className="action-group">
      {(src || (hasPhoto && !removed)) && <button type="button" className="button" disabled={disabled} onClick={() => { release(); setRemoved(true); setError(''); setFailed(false); onDraftChange({ type: 'remove' }); }}>Remove photo</button>}
      {changed && <button type="button" className="button" disabled={disabled} onClick={() => { release(); setRemoved(false); setError(''); setFailed(false); onDraftChange(null); }}>Reset photo preview</button>}
    </div>
    {changed && <p role="status" className="form-intro">Unsaved photo change. Save Profile to apply it, or reset to keep the saved photo.</p>}
  </div>;
}
