'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <label className="theme-toggle">
      <span>Theme</span>

      <select
        aria-label="Choose theme"
        value={mounted ? (theme ?? 'system') : 'system'}
        disabled={!mounted}
        onChange={(event) => setTheme(event.target.value)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
