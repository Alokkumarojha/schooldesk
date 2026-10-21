'use client';
import { useEffect, useState } from 'react';
import { legacyPhotoUrl, loadPhotoBlob, loadPhotoState, type PhotoState } from '@/lib/student-photo-client';

export function useStudentPhoto(schoolId: string, studentId: string, reference: string | null) {
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([schoolId, studentId, reference, revision]);
  const [result, setResult] = useState<{ key: string; photo: PhotoState | null; src: string | null; error: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | null = null;
    async function load() {
      let photo: PhotoState | null = null;
      try {
        photo = await loadPhotoState(schoolId, studentId, controller.signal);
        let src = legacyPhotoUrl(photo.imageUrl);
        if (photo.imageUrl?.startsWith('cld-auth:')) {
          const blob = await loadPhotoBlob(schoolId, studentId, photo.version, controller.signal);
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob); src = objectUrl;
        }
        if (!controller.signal.aborted) setResult({ key, photo, src, error: '' });
      } catch {
        if (!controller.signal.aborted) setResult({ key, photo, src: null, error: 'The current photo could not be loaded. Please retry.' });
      }
    }
    void load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [schoolId, studentId, key]);
  // Never render another student's/school's previous result while a new load runs.
  const current = result?.key === key ? result : null;
  return { photo: current?.photo ?? null, src: current?.src ?? null, loading: !current,
    error: current?.error ?? '', reload: () => setRevision(value => value + 1) };
}
