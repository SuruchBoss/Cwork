import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Avatar, Button } from '@/components/ui';
import { api } from '@/lib/api-client';
import { env } from '@/lib/env';
import { P } from '@/lib/permissions';
import { qk } from '@/app/query-client';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Shown when the user holds ANY of these. Omit for "everyone". */
  permissions?: string[];
  badge?: 'approvals';
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    heading: 'ภาพรวม',
    items: [
      { to: '/', label: 'แดชบอร์ด', icon: '◎' },
      { to: '/approvals', label: 'รออนุมัติ', icon: '✓', badge: 'approvals' },
      { to: '/assistant', label: 'ผู้ช่วย HR', icon: '✦', permissions: [P.ASSISTANT_USE] },
    ],
  },
  {
    heading: 'พนักงาน',
    items: [
      {
        to: '/employees',
        label: 'ทะเบียนพนักงาน',
        icon: '☰',
        permissions: [P.EMPLOYEE_READ, P.EMPLOYEE_READ_TEAM],
      },
      { to: '/offboarding', label: 'การลาออก', icon: '↪', permissions: [P.OFFBOARDING_READ] },
      {
        to: '/performance',
        label: 'ประเมินผล / KPI',
        icon: '◈',
        permissions: [P.PERFORMANCE_READ, P.KPI_MANAGE_TEAM],
      },
    ],
  },
  {
    heading: 'เวลาและการลา',
    items: [
      { to: '/leave', label: 'การลา', icon: '⏸', permissions: [P.LEAVE_READ, P.LEAVE_READ_TEAM] },
      {
        to: '/attendance',
        label: 'ลงเวลาทำงาน',
        icon: '◔',
        permissions: [P.ATTENDANCE_READ, P.ATTENDANCE_READ_TEAM],
      },
    ],
  },
  {
    heading: 'ค่าตอบแทน',
    items: [
      { to: '/payroll', label: 'เงินเดือน', icon: '฿', permissions: [P.PAYROLL_READ] },
      { to: '/expenses', label: 'เบิกค่าใช้จ่าย', icon: '▤', permissions: [P.EXPENSE_READ] },
    ],
  },
  {
    heading: 'สรรหา',
    items: [
      { to: '/recruitment', label: 'ผู้สมัครงาน', icon: '⚑', permissions: [P.RECRUITMENT_READ] },
    ],
  },
  {
    heading: 'จัดการระบบ',
    items: [
      { to: '/documents', label: 'คำขอเอกสาร', icon: '▣', permissions: [P.DOCUMENT_ISSUE] },
      {
        to: '/knowledge',
        label: 'ฐานความรู้ HR',
        icon: '◫',
        permissions: [P.ASSISTANT_KNOWLEDGE_MANAGE],
      },
      { to: '/organization', label: 'โครงสร้างองค์กร', icon: '⌗', permissions: [P.ORG_READ] },
      { to: '/audit', label: 'บันทึกการใช้งาน', icon: '⎙', permissions: [P.AUDIT_READ] },
    ],
  },
];

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const canAny = useAuthStore((s) => s.canAny);
  const logout = useAuthStore((s) => s.logout);
  const { sidebarOpen, toggleSidebar, closeSidebar, theme, setTheme } = useUiStore();
  const location = useLocation();

  const { data: pendingApprovals } = useQuery({
    queryKey: qk.approvalTasks('PENDING'),
    queryFn: () => api.get<unknown[]>('/approvals/tasks', { query: { status: 'PENDING' } }),
    refetchInterval: 60_000,
  });

  const badgeCounts = { approvals: pendingApprovals?.length ?? 0 };

  const visibleSections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permissions || canAny(...item.permissions)),
  })).filter((section) => section.items.length > 0);

  const currentLabel =
    visibleSections
      .flatMap((s) => s.items)
      .find((item) => item.to === location.pathname || (item.to !== '/' && location.pathname.startsWith(item.to)))
      ?.label ?? env.appName;

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button className="sidebar-scrim" onClick={closeSidebar} aria-label="ปิดเมนู" />
      )}

      <aside className={clsx('sidebar', sidebarOpen && 'sidebar--open')}>
        <div className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden>
            MM
          </span>
          <span>{env.appName}</span>
        </div>

        <nav className="sidebar__nav" aria-label="เมนูหลัก">
          {visibleSections.map((section) => (
            <div key={section.heading}>
              <div className="sidebar__section">{section.heading}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={closeSidebar}
                  className={({ isActive }) => clsx('nav-link', isActive && 'nav-link--active')}
                >
                  <span className="nav-link__icon" aria-hidden>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  {item.badge && badgeCounts[item.badge] > 0 && (
                    <span className="nav-link__badge">{badgeCounts[item.badge]}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="row" style={{ gap: 10, padding: '4px 6px' }}>
            <Avatar name={user?.displayName ?? user?.email ?? '?'} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="truncate" style={{ fontWeight: 500, fontSize: 13 }}>
                {user?.displayName ?? user?.email}
              </div>
              <div className="subtle truncate">{user?.roles.join(', ')}</div>
            </div>
          </div>
          <div className="row" style={{ marginTop: 8, gap: 6 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="สลับธีมสว่าง/มืด"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void logout()} style={{ flex: 1 }}>
              ออกจากระบบ
            </Button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Button variant="ghost" size="sm" className="sidebar-toggle" onClick={toggleSidebar}>
            ☰
          </Button>
          <span className="topbar__title">{currentLabel}</span>
          <span className="topbar__spacer" />
        </header>

        <Outlet />
      </div>
    </div>
  );
}
