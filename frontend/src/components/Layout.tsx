// ── App shell with sidebar navigation — dark precision editorial ──

import { useState, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useMatchingNotifications } from '../hooks/useMatchingNotifications';
import { ToastContainer } from './Toast';
import type { ToastData } from './Toast';
import type { MatchingNotification } from '../api/types';

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    to: '/unified',
    label: 'Unified',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
  {
    to: '/upload',
    label: 'Upload',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    to: '/review',
    label: 'Review',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    to: '/sources',
    label: 'Sources',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  {
    to: '/users',
    label: 'Users',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Wire WebSocket notifications to toast system
  useMatchingNotifications(useCallback((notification: MatchingNotification) => {
    if (notification.type === 'matching_complete') {
      const { candidate_count = 0, group_count = 0 } = notification.data;
      addToast({
        type: 'success',
        message: 'Matching complete',
        detail: `${candidate_count} candidate pairs found in ${group_count} groups`,
        action: { label: 'View results →', href: '/review' },
      });
    } else if (notification.type === 'matching_failed') {
      addToast({
        type: 'error',
        message: 'Matching failed',
        detail: notification.data.error || 'An unexpected error occurred during matching',
      });
    }
  }, [addToast]));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface-950">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden animate-fadeIn"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — atmospheric glass with gradient depth */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex w-64 flex-col
          bg-gradient-to-b from-surface-900 via-surface-900/95 to-surface-950
          border-r border-white/[0.06]
          transform transition-transform duration-300 ease-out
          lg:static lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Sidebar atmospheric overlay — subtle noise texture */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Accent gradient bleed at top */}
          <div className="absolute -top-20 -left-20 w-60 h-60 bg-accent-500/[0.04] rounded-full blur-3xl" />
          {/* Geometric line pattern */}
          <div
            className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage: `repeating-linear-gradient(
                -45deg,
                transparent,
                transparent 30px,
                rgba(255,255,255,0.5) 30px,
                rgba(255,255,255,0.5) 31px
              )`,
            }}
          />
        </div>

        {/* Brand */}
        <div className="relative flex h-20 items-center gap-3.5 px-6 border-b border-white/[0.06]">
          {/* Brand icon with glow */}
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-accent-500/10 border border-accent-500/25 glow-accent">
            <svg className="w-5 h-5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-display tracking-tight text-white text-glow-accent">
              OneBase
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-surface-500">
              Data Platform
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="relative flex-1 overflow-y-auto px-3 py-5">
          <div className="space-y-1">
            {navItems.map((item, index) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                style={{ animationDelay: `${index * 0.06}s` }}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 animate-slideInLeft ${
                    isActive
                      ? 'bg-accent-500/[0.08] text-accent-300 border border-accent-500/20 glow-accent'
                      : 'text-surface-500 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.04]'
                  }`
                }
              >
                {({ isActive }: { isActive: boolean }) => (
                  <>
                    {/* Active indicator bar */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-accent-400 rounded-r-full" />
                    )}
                    <span className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-accent-400' : ''}`}>
                      {item.icon}
                    </span>
                    <span className="transition-all duration-200 group-hover:translate-x-0.5">
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div className="relative border-t border-white/[0.06] p-4">
          <div className="flex items-center gap-3">
            {/* Avatar with gradient ring */}
            <div className="relative">
              <div className="absolute -inset-[2px] rounded-full bg-gradient-to-br from-accent-400/40 to-accent-600/20 blur-[1px]" />
              <div className="relative flex items-center justify-center w-9 h-9 rounded-full bg-surface-800 text-xs font-bold text-accent-300 uppercase ring-1 ring-white/10">
                {user?.username?.[0] ?? '?'}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {user?.username}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" />
                <p className="text-[11px] text-surface-500 font-medium">Active</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-surface-500 hover:text-danger-400 hover:bg-danger-500/10 transition-all duration-200 hover:scale-105"
              title="Logout"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="flex h-14 items-center gap-4 border-b border-white/[0.06] glass-subtle px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="group p-1.5 rounded-lg text-surface-500 hover:text-accent-400 hover:bg-accent-500/10 transition-all duration-200"
          >
            <svg className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="text-sm font-display tracking-tight text-white text-glow-accent">
            OneBase
          </span>
        </header>

        {/* Page content — subtle depth gradient */}
        <main className="relative flex-1 overflow-y-auto">
          {/* Subtle radial gradient for depth separation */}
          <div className="pointer-events-none absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-surface-900/30 to-transparent" />
          <div className="relative mx-auto max-w-6xl px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
