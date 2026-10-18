'use client';

import { useState, type ReactNode } from 'react';

// Mount on first visit, then preserve filters, forms, and drafts while inactive.
export function WorkspacePanel({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return <div hidden={!active}>{(active || visited) && children}</div>;
}
