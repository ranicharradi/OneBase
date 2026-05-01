import { useEffect, useRef } from 'react';
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

const TYPE_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'accent'> = {
  matching_complete: 'ok',
  matching_failed: 'danger',
  matching_progress: 'info',
  upload: 'info',
  info: 'info',
};

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
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        className="btn btn-ghost btn-sm"
        style={{ padding: 4, position: 'relative' }}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>notifications</span>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 14,
              height: 14,
              padding: '0 4px',
              borderRadius: 7,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'IBM Plex Mono, monospace',
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="panel"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: 360,
            maxHeight: '70vh',
            overflow: 'hidden',
            zIndex: 90,
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="panel-head">
            <span className="panel-title">Notifications</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {unreadCount > 0 && (
                <button onClick={onMarkAllRead} className="btn btn-ghost btn-sm">
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={onClearAll} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
                No notifications yet
              </div>
            ) : (
              notifications.map((n, i) => {
                const tone = TYPE_TONE[n.type] || 'info';
                const icon = TYPE_ICONS[n.type] || 'info';
                return (
                  <div
                    key={n.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '20px 1fr auto',
                      gap: 10,
                      padding: '10px 14px',
                      borderBottom: i < notifications.length - 1 ? '1px solid var(--border-0)' : 'none',
                      background: !n.read ? 'var(--accent-soft)' : 'transparent',
                      alignItems: 'flex-start',
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 14, color: `var(--${tone})`, marginTop: 1 }}
                    >
                      {icon}
                    </span>
                    <button
                      onClick={() => onMarkRead(n.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: 'inherit',
                        font: 'inherit',
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--fg-0)', lineHeight: 1.4 }}>{n.message}</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 2 }}>
                        {timeAgo(n.timestamp)}
                      </div>
                    </button>
                    <button
                      onClick={() => onRemove(n.id)}
                      className="btn btn-ghost btn-sm"
                      style={{ padding: 2, height: 18 }}
                      aria-label="Dismiss"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
