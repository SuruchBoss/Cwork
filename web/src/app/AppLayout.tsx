// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Avatar, Button } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { api } from '@/lib/api-client';
import { env } from '@/lib/env';
import { usePlatformConfig } from '@/lib/platform';
import { useT } from '@/lib/i18n/useT';
import { roleLabels } from '@/lib/labels';
import { qk } from '@/app/query-client';
import { visibleSectionsFor } from '@/app/navigation';
import { DemoBanner } from '@/features/demo/DemoBanner';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const canAny = useAuthStore((s) => s.canAny);
  const logout = useAuthStore((s) => s.logout);
  const { sidebarOpen, toggleSidebar, closeSidebar, theme, setTheme, language, setLanguage } =
    useUiStore();
  const location = useLocation();
  const t = useT();

  const { data: pendingApprovals } = useQuery({
    queryKey: qk.approvalTasks('PENDING'),
    queryFn: () => api.get<unknown[]>('/approvals/tasks', { query: { status: 'PENDING' } }),
    refetchInterval: 60_000,
  });

  const badgeCounts = { approvals: pendingApprovals?.length ?? 0 };

  const platform = usePlatformConfig();
  const visibleSections = visibleSectionsFor(canAny, platform);

  const currentLabelKey = visibleSections
    .flatMap((s) => s.items)
    .find(
      (item) =>
        item.to === location.pathname ||
        (item.to !== '/' && location.pathname.startsWith(item.to)),
    )?.label;
  const currentLabel = currentLabelKey ? t(currentLabelKey) : env.appName;

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button className="sidebar-scrim" onClick={closeSidebar} aria-label={t('Close menu')} />
      )}

      <aside className={clsx('sidebar', sidebarOpen && 'sidebar--open')}>
        <div className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden>
            CW
          </span>
          <span>{env.appName}</span>
        </div>

        <nav className="sidebar__nav" aria-label={t('Main menu')}>
          {visibleSections.map((section) => (
            <div key={section.heading}>
              <div className="sidebar__section">{t(section.heading)}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={closeSidebar}
                  className={({ isActive }) => clsx('nav-link', isActive && 'nav-link--active')}
                >
                  <span className="nav-link__icon" aria-hidden>
                    <Icon name={item.icon} />
                  </span>
                  <span>{t(item.label)}</span>
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
              <div className="subtle truncate">
                {user?.roles.map((role) => t(roleLabels[role] ?? role)).join(', ')}
              </div>
            </div>
          </div>
          <div className="sidebar__controls">
            <Button
              variant="ghost"
              className="sidebar__control"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={t('Toggle light/dark theme')}
              aria-label={theme === 'dark' ? t('Switch to light theme') : t('Switch to dark theme')}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </Button>
            <Button
              variant="ghost"
              className="sidebar__control"
              onClick={() => setLanguage(language === 'th' ? 'en' : 'th')}
              title={t('Language')}
              aria-label={language === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
              lang={language === 'th' ? 'en' : 'th'}
            >
              {language === 'th' ? 'EN' : 'ไทย'}
            </Button>
            <Button
              variant="ghost"
              className="sidebar__control sidebar__control--wide"
              onClick={() => void logout()}
            >
              <Icon name="signOut" />
              {t('Sign out')}
            </Button>
          </div>
        </div>
      </aside>

      <div className="main">
        <DemoBanner switcher />
        <header className="topbar">
          <Button
            variant="ghost"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={t('Open or close menu')}
            aria-expanded={sidebarOpen}
          >
            <Icon name="menu" size={20} />
            <span aria-hidden="true">{t('Menu')}</span>
          </Button>
          <span className="topbar__title">{currentLabel}</span>
          <span className="topbar__spacer" />
        </header>

        <Outlet />
      </div>
    </div>
  );
}
