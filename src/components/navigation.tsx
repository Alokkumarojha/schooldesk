'use client';

import { useEffect, useState } from 'react';
import { Section, sections } from '@/lib/demo';
import { Icon } from './icon';
import { Dialog } from './ui';

function NavigationLinks({ section, noticeCount, onNavigate }: {
  section: Section; noticeCount: number; onNavigate: (section: Section) => void;
}) {
  return <><div className="navlabel">Management</div>
    <nav className="nav" aria-label="Main navigation">
      {sections.map(item => <a key={item} href={`#${item.toLowerCase()}`} className={section === item ? 'active' : ''}
        aria-current={section === item ? 'page' : undefined} onClick={event => { event.preventDefault(); onNavigate(item); }}>
        <Icon name={item.toLowerCase()} /><span>{item}</span>{item === 'Notices' && <span className="count" aria-label={`${noticeCount} notices`}>{noticeCount}</span>}
      </a>)}
    </nav>
  </>;
}

function SidebarContent({ section, noticeCount, onNavigate }: {
  section: Section; noticeCount: number; onNavigate: (section: Section) => void;
}) {
  return <>
    <div className="workspace"><span className="workspace-icon"><Icon name="classes" /></span><div>School workspace<small>Single-school preview</small></div></div>
    <NavigationLinks section={section} noticeCount={noticeCount} onNavigate={onNavigate} />
    <div className="sidebar-bottom"><div className="session-card"><span>Academic session</span><strong>2026 – 2027</strong></div>
      <div className="sidebar-footer"><Icon name="shield" size={15} />SchoolDesk · Demo workspace</div>
    </div>
  </>;
}

export function Sidebar(props: { section: Section; noticeCount: number; onNavigate: (section: Section) => void }) {
  return <aside className="sidebar desktop-sidebar" aria-label="School workspace navigation">
    <a href="#dashboard" className="brand" onClick={event => { event.preventDefault(); props.onNavigate('Dashboard'); }}>
      <span className="brandmark"><Icon name="classes" size={23} /></span>SchoolDesk
    </a>
    <SidebarContent {...props} />
  </aside>;
}

export function Topbar(props: { section: Section; noticeCount: number; onNavigate: (section: Section) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 761px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => { if (event.matches) setOpen(false); };
    query.addEventListener('change', closeOnDesktop);
    return () => query.removeEventListener('change', closeOnDesktop);
  }, []);
  return <>
    <header className="topbar">
      <div className="breadcrumb"><button className="iconbutton mobile-menu" aria-label="Open navigation" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon name="menu" /></button>
        <span className="breadcrumb-root">Workspace</span><Icon name="chevron" size={13} /><strong>{props.section}</strong>
      </div>
      <div className="profile"><span className="badge profile-demo">Demo</span><div className="avatar" aria-hidden="true">SA</div><div className="profile-copy"><strong>School Admin</strong><small>Preview account</small></div></div>
    </header>
    {open && <Dialog title="SchoolDesk" variant="drawer" onClose={() => setOpen(false)}>
      <div className="drawer-content"><SidebarContent {...props} onNavigate={section => { setOpen(false); props.onNavigate(section); }} /></div>
    </Dialog>}
  </>;
}
