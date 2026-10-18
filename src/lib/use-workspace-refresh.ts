'use client';

import { useEffect, useRef } from 'react';

// Refresh once per visit (or explicit retry), deferring while local work is protected.
// Callers keep refresh stable and guard every read result with the supplied signal.
export function useWorkspaceRefresh(active: boolean, blocked: boolean, revision: number, refresh: (signal: AbortSignal) => Promise<void>) {
  const needed = useRef(true);
  const lastRevision = useRef(revision);
  useEffect(() => {
    if (!active || lastRevision.current !== revision) needed.current = true;
    lastRevision.current = revision;
    if (!active || blocked || !needed.current) return;
    needed.current = false;
    const controller = new AbortController();
    let finished = false;
    void refresh(controller.signal).finally(() => { finished = true; });
    return () => {
      controller.abort();
      // An interrupted read must be retried, including React's development remount.
      if (!finished) needed.current = true;
    };
  }, [active, blocked, revision, refresh]);
}
