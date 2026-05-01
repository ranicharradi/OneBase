// ── App shell — terminal aesthetic: sidebar + topbar + main + statusbar ──

import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useMatchingNotifications } from '../hooks/useMatchingNotifications';
import { useNotifications } from '../hooks/useNotifications';
import { ToastContainer } from './Toast';
import type { ToastData } from './Toast';
import type { MatchingNotification, ReviewStats } from '../api/types';
import NotificationCenter from './NotificationCenter';
import CommandPalette from './CommandPalette';
import { SearchProvider } from '../contexts/SearchContext';
import { api } from '../api/client';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  badge?: number;
}

interface NavSection {
  section: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    section: 'Pipeline',
    items: [
      { to: '/dashboard', icon: 'home', label: 'Overview' },
      { to: '/upload', icon: 'cloud_upload', label: 'Upload' },
      { to: '/sources', icon: 'storage', label: 'Sources' },
    ],
  },
  {
    section: 'Matching',
    items: [
      { to: '/review', icon: 'swap_horiz', label: 'Review queue' },
      { to: '/merge', icon: 'merge', label: 'Merge queue' },
      { to: '/unified', icon: 'verified', label: 'Unified' },
    ],
  },
  {
    section: 'Admin',
    items: [
      { to: '/users', icon: 'group', label: 'Users & access' },
    ],
  },
];

// Routes that render `.table` elements — only these benefit from the density toggle
const DENSITY_ROUTE_PREFIXES = ['/upload', '/sources', '/review', '/merge', '/unified', '/users'];

function routeHasDensity(pathname: string): boolean {
  return DENSITY_ROUTE_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

const BREADCRUMBS: Record<string, string[]> = {
  '/dashboard': ['Pipeline', 'Overview'],
  '/upload': ['Pipeline', 'Upload'],
  '/sources': ['Pipeline', 'Sources'],
  '/review': ['Matching', 'Review queue'],
  '/merge': ['Matching', 'Merge queue'],
  '/unified': ['Matching', 'Unified'],
  '/users': ['Admin', 'Users'],
};

function Icon({ name, size = 14, filled = false }: { name: string; size?: number; filled?: boolean }) {
  return (
    <span
      className={'material-symbols-outlined' + (filled ? ' filled' : '')}
      style={{
        fontSize: size,
        width: size,
        height: size,
        lineHeight: `${size}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
        flexShrink: 0,
        userSelect: 'none',
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function Sidebar({
  collapsed,
  onToggleCollapse,
  onLogout,
  username,
  reviewCount,
  mergeCount,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLogout: () => void;
  username: string | undefined;
  reviewCount: number;
  mergeCount: number;
}) {
  return (
    <aside
      style={{
        width: collapsed ? 56 : 240,
        transition: 'width 0.2s ease',
        background: 'var(--bg-1)',
        borderRight: '1px solid var(--border-0)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: 48,
          padding: collapsed ? 0 : '0 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
          borderBottom: '1px solid var(--border-0)',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            background: 'var(--fg-0)',
            color: 'var(--bg-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 14,
            fontFamily: 'IBM Plex Mono, monospace',
            borderRadius: 5,
            flexShrink: 0,
          }}
        >
          1B
        </div>
        {!collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>OneBase</span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--fg-2)' }}>
              record unification
            </span>
          </div>
        )}
      </div>

      <nav className="scroll" style={{ flex: 1, padding: '8px 0' }}>
        {NAV.map(sec => (
          <div key={sec.section}>
            {!collapsed && (
              <div className="label" style={{ padding: '12px 14px 6px', fontSize: 11 }}>
                {sec.section}
              </div>
            )}
            {sec.items.map(item => {
              const badge = item.to === '/review' ? reviewCount
                          : item.to === '/merge'  ? mergeCount
                          : undefined;
              const badgeColor = item.to === '/review' ? 'var(--warn)' : 'var(--accent)';
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                  style={{
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    padding: collapsed ? 0 : '0 12px',
                  }}
                >
                  <Icon name={item.icon} size={collapsed ? 20 : 18} />
                  {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                  {!collapsed && badge !== undefined && badge > 0 && (
                    <span className="nav-badge mono" style={{ background: badgeColor }}>
                      {badge}
                    </span>
                  )}
                  {collapsed && badge !== undefined && badge > 0 && (
                    <span style={{
                      position: 'absolute', top: 6, right: 6,
                      width: 7, height: 7, borderRadius: '50%',
                      background: badgeColor,
                    }} />
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div
        style={{
          padding: collapsed ? '8px 6px' : 10,
          borderTop: '1px solid var(--border-0)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {!collapsed && username && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: 'var(--bg-2)',
              borderRadius: 4,
              fontSize: 11,
              minWidth: 0,
            }}
          >
            <span className="pill-dot" style={{ background: 'var(--ok)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {username}
            </span>
            <button
              onClick={onLogout}
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto', padding: 4, height: 22 }}
              title="Log out"
              aria-label="Log out"
            >
              <Icon name="logout" size={12} />
            </button>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="nav-item"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 12px',
            color: 'var(--fg-2)',
            fontSize: 11,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <Icon name="arrow_forward" size={collapsed ? 20 : 16} />
          </span>
          {!collapsed && <span style={{ flex: 1 }}>Collapse</span>}
          {!collapsed && <span className="kbd">[</span>}
        </button>
      </div>
    </aside>
  );
}

function TopBar({
  breadcrumb,
  onOpenPalette,
  notificationCenter,
  density,
  onCycleDensity,
  showDensity,
  theme,
  onToggleTheme,
  username,
}: {
  breadcrumb: string[];
  onOpenPalette: () => void;
  notificationCenter: React.ReactNode;
  density: 'compact' | 'comfortable' | 'spacious';
  onCycleDensity: () => void;
  showDensity: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  username: string | undefined;
}) {
  const initial = (username?.[0] ?? '?').toUpperCase();
  const densityIcon: Record<typeof density, string> = {
    compact: 'density_small',
    comfortable: 'density_medium',
    spacious: 'density_large',
  };
  return (
    <div className="topbar">
      {breadcrumb.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--fg-2)', fontSize: 12 }}>
          {breadcrumb.map((b, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <Icon name="chevron_right" size={10} />}
              <span
                style={{
                  color: i === breadcrumb.length - 1 ? 'var(--fg-0)' : 'var(--fg-2)',
                  fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
                }}
              >
                {b}
              </span>
            </span>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      <button
        onClick={onOpenPalette}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 10px',
          height: 26,
          minWidth: 260,
          background: 'var(--bg-2)',
          border: '1px solid var(--border-0)',
          borderRadius: 4,
          cursor: 'pointer',
          color: 'var(--fg-2)',
          fontFamily: 'inherit',
          fontSize: 12,
        }}
        aria-label="Open command palette"
      >
        <Icon name="search" size={13} />
        <span style={{ flex: 1, textAlign: 'left' }}>Jump to, search, run…</span>
        <span className="kbd">⌘K</span>
      </button>

      {showDensity && (
        <button
          onClick={onCycleDensity}
          className="btn btn-ghost btn-sm"
          style={{ padding: 4 }}
          title={`Density: ${density}`}
          aria-label={`Density: ${density}. Click to cycle.`}
        >
          <Icon name={densityIcon[density]} size={14} />
        </button>
      )}

      <button
        onClick={onToggleTheme}
        className="btn btn-ghost btn-sm"
        style={{ padding: 4 }}
        title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        aria-label="Toggle theme"
      >
        <Icon name={theme === 'light' ? 'dark_mode' : 'light_mode'} size={14} />
      </button>

      {notificationCenter}

      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: 'var(--accent)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
        }}
        title={username ?? 'Account'}
      >
        {initial}
      </div>
    </div>
  );
}

function StatusDot({ tone = 'ok', label }: { tone?: 'ok' | 'warn' | 'danger'; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        className="live-dot"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: `var(--${tone})`,
          display: 'inline-block',
        }}
      />
      <span>{label}</span>
    </span>
  );
}

function StatusBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="statusbar">
      <StatusDot label="api" />
      <StatusDot label="worker" />
      <StatusDot label="redis" />
      <StatusDot label="postgres" />
      <span className="sep">│</span>
      <span style={{ marginLeft: 'auto' }}>{now.toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
    </div>
  );
}

const NEXT_DENSITY: Record<'compact' | 'comfortable' | 'spacious', 'compact' | 'comfortable' | 'spacious'> = {
  compact: 'comfortable',
  comfortable: 'spacious',
  spacious: 'compact',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, density, setDensity } = useTheme();

  const { data: reviewStats } = useQuery({
    queryKey: ['review-stats'],
    queryFn: () => api.get<ReviewStats>('/api/review/stats'),
    refetchInterval: 30_000,
  });
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const notifs = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);

  const addToast = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useMatchingNotifications(useCallback((notification: MatchingNotification) => {
    if (notification.type === 'matching_complete') {
      const { candidate_count = 0, group_count = 0 } = notification.data;
      addToast({
        type: 'success',
        message: 'Matching complete',
        detail: `${candidate_count} candidate pairs found in ${group_count} groups`,
        action: { label: 'View results →', href: '/review' },
      });
      notifs.add('matching_complete', `Matching complete: ${candidate_count} candidates in ${group_count} groups`);
    } else if (notification.type === 'matching_failed') {
      addToast({
        type: 'error',
        message: 'Matching failed',
        detail: notification.data.error || 'An unexpected error occurred during matching',
      });
      notifs.add('matching_failed', `Matching failed: ${notification.data.error || 'Unknown error'}`);
    }
  }, [addToast, notifs]));

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const cycleDensity = useCallback(() => {
    setDensity(NEXT_DENSITY[density]);
  }, [density, setDensity]);

  // Keyboard shortcuts: Cmd/Ctrl+K command palette, [ collapses sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
        return;
      }
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !t?.isContentEditable) {
          e.preventDefault();
          setCollapsed(c => !c);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const breadcrumb = useMemo(() => {
    // Match longest prefix in BREADCRUMBS, then append dynamic ID segment if any
    const path = location.pathname;
    const matched = Object.keys(BREADCRUMBS)
      .sort((a, b) => b.length - a.length)
      .find(prefix => path === prefix || path.startsWith(prefix + '/'));
    if (!matched) return ['OneBase'];
    const base = BREADCRUMBS[matched];
    const rest = path.slice(matched.length).split('/').filter(Boolean);
    return rest.length > 0 ? [...base, rest[rest.length - 1]] : base;
  }, [location.pathname]);

  return (
    <SearchProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(c => !c)}
          onLogout={handleLogout}
          username={user?.username}
          reviewCount={reviewStats?.total_pending ?? 0}
          mergeCount={reviewStats?.total_confirmed ?? 0}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <TopBar
            breadcrumb={breadcrumb}
            onOpenPalette={() => setPaletteOpen(true)}
            density={density}
            onCycleDensity={cycleDensity}
            showDensity={routeHasDensity(location.pathname)}
            theme={theme}
            onToggleTheme={toggleTheme}
            username={user?.username}
            notificationCenter={
              <NotificationCenter
                notifications={notifs.notifications}
                unreadCount={notifs.unreadCount}
                isOpen={notifOpen}
                onToggle={() => setNotifOpen(p => !p)}
                onMarkRead={notifs.markRead}
                onMarkAllRead={notifs.markAllRead}
                onRemove={notifs.remove}
                onClearAll={notifs.clearAll}
              />
            }
          />

          <main style={{ flex: 1, minHeight: 0, background: 'var(--bg-0)', overflow: 'hidden' }}>
            <Outlet />
          </main>

          <StatusBar />
        </div>

        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </div>
    </SearchProvider>
  );
}
