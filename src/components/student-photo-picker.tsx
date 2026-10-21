'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';

// Convenience checks only. The future upload endpoint must validate actual bytes.
export function photoSelectionError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG or WebP image.';
  if (!file.size || file.size > 2 * 1024 * 1024) return 'Choose a non-empty image no larger than 2 MB.';
  return null;
}

export function StudentPhotoPicker({ imageUrl, disabled, onDraftChange }: {
  imageUrl: string | null; disabled: boolean; onDraftChange: (changed: boolean) => void;
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
  let existing: string | null = null;
  try { const url = new URL(imageUrl ?? ''); if (url.protocol === 'https:' && !url.username && !url.password) existing = url.href; } catch {}
  const src = removed ? null : preview ?? existing;
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
        release(); objectUrl.current = url; setPreview(url); setRemoved(false); setFailed(false); setError(''); onDraftChange(true);
      }} />
    <p id={`${id}-help`} className="form-intro">JPEG, PNG or WebP · maximum 2 MB. Preview only: Cloudinary upload and removal are not connected yet. Your saved photo stays unchanged.</p>
    {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
    <div className="action-group">
      {src && <button type="button" className="button" disabled={disabled} onClick={() => { release(); setRemoved(true); setError(''); setFailed(false); onDraftChange(true); }}>Remove photo</button>}
      {changed && <button type="button" className="button" disabled={disabled} onClick={() => { release(); setRemoved(false); setError(''); setFailed(false); onDraftChange(false); }}>Reset photo preview</button>}
    </div>
    {changed && <p role="status" className="form-intro">Photo change is local only. Reset the preview to save other profile details.</p>}
  </div>;
}
