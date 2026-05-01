// ── Toast notifications — terminal aesthetic ──

import { useCallback, useEffect, useState } from 'react';

export interface ToastData {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  detail?: string;
  action?: { label: string; href: string };
  autoDismiss?: number;
}

interface ToastProps extends ToastData {
  onDismiss: (id: string) => void;
}

const TYPE_TONE: Record<ToastData['type'], 'ok' | 'danger' | 'info'> = {
  success: 'ok',
  error: 'danger',
  info: 'info',
};

const TYPE_ICON: Record<ToastData['type'], string> = {
  success: 'check_circle',
  error: 'error',
  info: 'info',
};

function Toast({ id, type, message, detail, action, autoDismiss, onDismiss }: ToastProps) {
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(id), 200);
  }, [id, onDismiss]);

  useEffect(() => {
    const TOAST_DISMISS_MS = 8000;
    const timeout = autoDismiss ?? (type === 'error' ? 0 : TOAST_DISMISS_MS);
    if (timeout <= 0) return;
    const timer = setTimeout(dismiss, timeout);
    return () => clearTimeout(timer);
  }, [autoDismiss, type, dismiss]);

  const tone = TYPE_TONE[type];

  return (
    <div
      role="alert"
      className={exiting ? '' : 'fade'}
      style={{
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
        background: 'var(--bg-1)',
        border: '1px solid var(--border-1)',
        borderLeft: `3px solid var(--${tone})`,
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateY(8px)' : 'translateY(0)',
        transition: 'all 0.2s ease',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 16, color: `var(--${tone})`, flexShrink: 0, marginTop: 1 }}
      >
        {TYPE_ICON[type]}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-0)' }}>{message}</div>
        {detail && (
          <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2, lineHeight: 1.4 }}>
            {detail}
          </div>
        )}
        {action && (
          <a
            href={action.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 6,
              fontSize: 11,
              color: 'var(--accent)',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            {action.label}
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_forward</span>
          </a>
        )}
      </div>

      <button
        onClick={dismiss}
        className="btn btn-ghost btn-sm"
        style={{ padding: 2, height: 18, flexShrink: 0 }}
        aria-label="Dismiss notification"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const visible = toasts.slice(-3);
  if (visible.length === 0) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 36, // clear of statusbar
        right: 16,
        zIndex: 250,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {visible.map(toast => (
        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
          <Toast {...toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
