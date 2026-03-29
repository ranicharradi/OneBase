// ── App shell — light glassmorphism with icon sidebar + top navbar ──

import { useState, useCallback, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useMatchingNotifications } from '../hooks/useMatchingNotifications';
import { ToastContainer } from './Toast';
import type { ToastData } from './Toast';
import type { MatchingNotification } from '../api/types';
import { SearchProvider, useSearch } from '../contexts/SearchContext';
import NotificationCenter from './NotificationCenter';
import { useNotifications } from '../hooks/useNotifications';

const navItems = [
  { to: '/dashboard', icon: 'home', label: 'Dashboard' },
  { to: '/unified', icon: 'verified', label: 'Unified' },
  { to: '/upload', icon: 'cloud_upload', label: 'Upload' },
  { to: '/review', icon: 'swap_horiz', label: 'Review' },
  { to: '/sources', icon: 'storage', label: 'Sources' },
  { to: '/users', icon: 'group', label: 'Users' },
];

function SearchButton() {
  const { query, isOpen, setQuery, toggle, close } = useSearch();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  if (isOpen) {
    return (
      <div className="flex items-center gap-2">
        <label htmlFor="global-search" className="sr-only">Search</label>
        <input
          id="global-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
          placeholder="Search..."
          autoFocus
          className="input-field w-48 text-sm"
          aria-expanded={true}
        />
        <button onClick={close} className="w-10 h-10 rounded-full bg-white/40 flex items-center justify-center border border-white/60 shadow-sm hover:bg-white/60 transition-colors" aria-label="Close search">
          <span className="material-symbols-outlined text-on-surface-variant">close</span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={toggle}
      className="w-10 h-10 rounded-full bg-white/40 flex items-center justify-center border border-white/60 shadow-sm hover:bg-white/60 transition-colors"
      aria-label="Open search"
      aria-expanded={false}
    >
      <span className="material-symbols-outlined text-on-surface-variant">search</span>
    </button>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const notifs = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);

  const addToast = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Wire WebSocket notifications to toast system and notification center
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <SearchProvider>
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden animate-fadeIn"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — narrow icon-only glass strip */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-[60] flex flex-col
          w-20 lg:w-24 py-8 px-4 items-center
          sidebar-glass
          transform transition-transform duration-300 ease-out
          md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Brand mark */}
        <div className="mb-10">
          <div className="w-10 h-10 bg-accent-600/10 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-accent-600 font-bold text-xl">token</span>
          </div>
        </div>

        {/* Navigation icons */}
        <nav className="flex-1 space-y-4 flex flex-col items-center">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              title={item.label}
              className={({ isActive }) =>
                `group relative w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 ${
                  isActive
                    ? 'bg-white/60 text-accent-600 shadow-sm'
                    : 'text-on-surface-variant/50 hover:text-accent-600 hover:bg-white/30'
                }`
              }
            >
              <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
              {/* Tooltip */}
              <span className="absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-on-surface text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="mt-auto flex flex-col items-center gap-4">
          <button
            onClick={handleLogout}
            className="w-10 h-10 flex items-center justify-center text-on-surface-variant/40 hover:text-danger-500 transition-colors rounded-full hover:bg-white/30"
            title="Logout"
          >
            <span className="material-symbols-outlined text-[22px]">logout</span>
          </button>
        </div>
      </aside>

      {/* Main content wrapper */}
      <main className="flex-1 md:ml-20 lg:ml-24 flex flex-col min-h-screen">
        {/* Top navbar */}
        <header className="h-20 px-6 lg:px-12 flex justify-between items-center w-full z-50">
          <div className="flex items-center gap-4">
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-on-surface-variant hover:bg-white/40 transition-colors md:hidden"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>

            <span className="text-on-surface font-extrabold text-2xl tracking-tight font-display">OneBase</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification center */}
            <NotificationCenter
              notifications={notifs.notifications}
              unreadCount={notifs.unreadCount}
              isOpen={notifOpen}
              onToggle={() => setNotifOpen(prev => !prev)}
              onMarkRead={notifs.markRead}
              onMarkAllRead={notifs.markAllRead}
            />

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-full bg-white/40 flex items-center justify-center border border-white/60 shadow-sm hover:bg-white/60 transition-colors"
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label="Toggle theme"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                {theme === 'light' ? 'dark_mode' : 'light_mode'}
              </span>
            </button>

            {/* Search button */}
            <SearchButton />

            {/* Profile avatar */}
            <div className="ml-2 w-10 h-10 rounded-full bg-accent-600/10 border-2 border-white shadow-sm flex items-center justify-center">
              <span className="text-sm font-bold text-accent-600 uppercase font-display">
                {user?.username?.[0] ?? '?'}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 px-6 lg:px-12 pb-8 pt-2 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Global toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
    </SearchProvider>
  );
}
