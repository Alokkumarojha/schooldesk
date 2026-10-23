'use client';

import { useEffect, useState } from 'react';
import { UserButton } from '@clerk/nextjs';
import Image from 'next/image';
import type { DashboardUser } from '@/lib/dashboard-identity';
import { academicSessionLabel } from '@/lib/school-settings';
import { Section, sections } from '@/lib/demo';
import { Icon } from './icon';
import { Dialog } from './ui';
import { ThemeToggle } from './theme-toggle';
import { MobileBottomNav } from './mobile-bottom-nav';

function NavigationLinks({
  section,
  noticeCount,
  onNavigate,
}: {
  section: Section;
  noticeCount: number;
  onNavigate: (section: Section) => void;
}) {
  return (
    <>
      <div className="navlabel">Management</div>
      <nav className="nav" aria-label="Main navigation">
        {sections.map((item) => (
          <a
            key={item}
            href={`#${item.toLowerCase()}`}
            className={section === item ? 'active' : ''}
            aria-current={section === item ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(item);
            }}
          >
            <Icon name={item.toLowerCase()} />
            <span>{item}</span>
            {item === 'Notices' && (
              <span className="count" aria-label={`${noticeCount} notices`}>
                {noticeCount}
              </span>
            )}
          </a>
        ))}
      </nav>
    </>
  );
}

function SidebarContent({
  section,
  schoolName,
  academicYear,
  noticeCount,
  onNavigate,
}: {
  section: Section;
  schoolName: string;
  academicYear: string | null;
  noticeCount: number;
  onNavigate: (section: Section) => void;
}) {
  return (
    <>
      <div className="workspace">
        <span className="workspace-icon">
          <Icon name="classes" />
        </span>
        <div className="workspace-copy">
          <strong>{schoolName}</strong>
          <small>Active school</small>
        </div>
      </div>
      <NavigationLinks
        section={section}
        noticeCount={noticeCount}
        onNavigate={onNavigate}
      />
      <div className="sidebar-bottom">
        <div className="session-card">
          <span>Academic session</span>
          <strong>{academicSessionLabel(academicYear)}</strong>
        </div>
        <div className="sidebar-footer">
          <Icon name="shield" size={15} />
          SchoolDesk · School management
        </div>
      </div>
    </>
  );
}

export function Sidebar(props: {
  section: Section;
  schoolName: string;
  academicYear: string | null;
  noticeCount: number;
  onNavigate: (section: Section) => void;
}) {
  return (
    <aside
      className="sidebar desktop-sidebar"
      aria-label="School workspace navigation"
    >
      <a
        href="#dashboard"
        className="brand"
        onClick={(event) => {
          event.preventDefault();
          props.onNavigate('Dashboard');
        }}
      >
        <span className="brandmark">
          <Icon name="classes" size={23} />
        </span>
        SchoolDesk
      </a>
      <SidebarContent {...props} />
    </aside>
  );
}

function ProfileAvatar({ user }: { user: DashboardUser }) {
  const [failed, setFailed] = useState(false);
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toUpperCase();
  return (
    <span className="avatar account-avatar" aria-hidden="true">
      {user.imageUrl && !failed ? (
        <Image
          src={user.imageUrl}
          alt=""
          width={38}
          height={38}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        initials || 'U'
      )}
    </span>
  );
}

export function Topbar(props: {
  section: Section;
  schoolName: string;
  academicYear: string | null;
  user: DashboardUser;
  noticeCount: number;
  onNavigate: (section: Section) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 761px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    query.addEventListener('change', closeOnDesktop);
    return () => query.removeEventListener('change', closeOnDesktop);
  }, []);
  return (
    <>
      <header className="topbar">
        <div className="breadcrumb">
          <button
            className="iconbutton mobile-menu"
            aria-label="Open navigation"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <span className="breadcrumb-root">Workspace</span>
          <Icon name="chevron" size={13} />
          <strong>{props.section}</strong>
        </div>
        <div className="profile">
          <ThemeToggle />

          <div className="account-menu" aria-label="Account menu">
            <UserButton
              fallback={
                <ProfileAvatar
                  key={props.user.imageUrl ?? props.user.name}
                  user={props.user}
                />
              }
              appearance={{
                elements: {
                  avatarBox: 'account-avatar',
                  userButtonTrigger: 'account-trigger',
                },
              }}
            />
          </div>
          <div className="profile-copy">
            <strong title={props.user.name}>{props.user.name}</strong>
            <small title={props.user.email ?? undefined}>
              {props.user.email ?? 'Email not available'}
            </small>
          </div>
        </div>
      </header>
      <MobileBottomNav section={props.section} onNavigate={props.onNavigate}
        onMore={() => setOpen(true)} drawerOpen={open} />
      {open && (
        <Dialog
          title="SchoolDesk"
          variant="drawer"
          onClose={() => setOpen(false)}
        >
          <div className="drawer-content">
            <SidebarContent
              {...props}
              onNavigate={(section) => {
                setOpen(false);
                props.onNavigate(section);
              }}
            />
          </div>
        </Dialog>
      )}
    </>
  );
}
