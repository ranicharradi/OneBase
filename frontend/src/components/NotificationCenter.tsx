import { useRef, useEffect } from 'react';
import type { Notification } from '../hooks/useNotifications';

interface NotificationCenterProps {
  notifications: Notification[];
  unreadCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_ICONS: Record<string, string> = {
  matching_complete: 'check_circle',
  matching_failed: 'error',
  matching_progress: 'sync',
  upload: 'upload_file',
  info: 'info',
};

export default function NotificationCenter({
  notifications, unreadCount, isOpen, onToggle, onMarkRead, onMarkAllRead, onRemove, onClearAll,
}: NotificationCenterProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onToggle]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onToggle();
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className="flex items-center bg-white/40 px-3 py-1.5 rounded-full border border-white/60 shadow-sm hover:bg-white/60 transition-colors"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Notifications"
      >
        <span className="material-symbols-outlined text-sm text-on-surface-variant mr-1">notifications</span>
        <span className="text-[10px] font-bold text-accent-600">
          {unreadCount > 0 ? `+${unreadCount}` : '0'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-surface-100 border border-on-surface/10 rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-on-surface/5">
            <span className="text-sm font-semibold text-on-surface">Notifications</span>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="text-xs text-accent-600 hover:text-accent-600/80 font-medium"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={onClearAll}
                  className="text-xs text-danger-500 hover:text-danger-400 font-medium"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-on-surface-variant/60">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y divide-on-surface/5">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`group/notif w-full text-left px-4 py-3 hover:bg-white/30 transition-colors ${
                    !n.read ? 'bg-accent-600/[0.04]' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => onMarkRead(n.id)}
                      className="flex items-start gap-2 flex-1 min-w-0"
                    >
                      <span className="material-symbols-outlined text-sm mt-0.5 text-on-surface-variant">
                        {TYPE_ICONS[n.type] || 'info'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-on-surface leading-relaxed text-left">{n.message}</p>
                        <p className="text-[10px] text-on-surface-variant/60 mt-0.5 text-left">{timeAgo(n.timestamp)}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-accent-600" />
                      )}
                      <button
                        onClick={() => onRemove(n.id)}
                        className="opacity-0 group-hover/notif:opacity-100 transition-opacity p-0.5 rounded hover:bg-danger-500/10"
                        aria-label="Delete notification"
                      >
                        <span className="material-symbols-outlined text-[14px] text-on-surface-variant/40 hover:text-danger-500">close</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
