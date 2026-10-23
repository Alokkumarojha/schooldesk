'use client';

import type { Section } from '@/lib/demo';
import { Icon } from './icon';

const primaryTabs = [
  { section: 'Dashboard', label: 'Home', icon: 'dashboard' },
  { section: 'Students', label: 'Students', icon: 'students' },
  { section: 'Attendance', label: 'Attendance', icon: 'attendance' },
] as const satisfies readonly { section: Section; label: string; icon: string }[];

export function MobileBottomNav({ section, onNavigate, onMore, drawerOpen }: {
  section: Section;
  onNavigate: (section: Section) => void;
  onMore: () => void;
  drawerOpen: boolean;
}) {
  const moreActive = !primaryTabs.some(tab => tab.section === section);
  return <nav className="mobile-bottom-nav" aria-label="Mobile workspace navigation">
    {primaryTabs.map(tab => <button
      key={tab.section}
      type="button"
      aria-current={section === tab.section ? 'page' : undefined}
      onClick={() => onNavigate(tab.section)}
    >
      <Icon name={tab.icon} size={22} />
      <span>{tab.label}</span>
    </button>)}
    <button type="button" onClick={onMore} aria-label="More navigation"
      aria-haspopup="dialog" aria-expanded={drawerOpen}
      aria-current={moreActive ? 'true' : undefined}>
      <Icon name="menu" size={22} />
      <span>More</span>
    </button>
  </nav>;
}
