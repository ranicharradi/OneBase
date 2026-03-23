// ── Toast notification system — Light Glassmorphism ──
// Glass-morphic toasts with subtle accents, slide-up animation, auto-dismiss

import { useEffect, useState, useCallback } from 'react';

export interface ToastData {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  detail?: string;
  action?: { label: string; href: string };
  autoDismiss?: number; // ms, default 8000 for success/info, no auto-dismiss for errors
}

interface ToastProps extends ToastData {
  onDismiss: (id: string) => void;
}

function Toast({ id, type, message, detail, action, autoDismiss, onDismiss }: ToastProps) {
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(id), 300); // Match exit animation duration
  }, [id, onDismiss]);

  useEffect(() => {
    const TOAST_DISMISS_MS = 8000;
    const timeout = autoDismiss ?? (type === 'error' ? 0 : TOAST_DISMISS_MS);
    if (timeout <= 0) return;

    const timer = setTimeout(dismiss, timeout);
    return () => clearTimeout(timer);
  }, [autoDismiss, type, dismiss]);

  const borderColor =
    type === 'success'
      ? 'border-success-500/25'
      : type === 'error'
        ? 'border-danger-500/25'
        : 'border-accent-600/25';

  const shadowColor =
    type === 'success'
      ? 'shadow-success-500/10'
      : type === 'error'
        ? 'shadow-danger-500/10'
        : 'shadow-accent-600/10';

  const iconColor =
    type === 'success'
      ? 'text-success-500'
      : type === 'error'
        ? 'text-danger-500'
        : 'text-accent-600';

  const iconBg =
    type === 'success'
      ? 'bg-success-500/10 border-success-500/20'
      : type === 'error'
        ? 'bg-danger-500/10 border-danger-500/20'
        : 'bg-accent-600/10 border-accent-600/20';

  return (
    <div
      className={`
        relative flex items-start gap-3 w-[380px] max-w-[calc(100vw-2rem)]
        bg-white/45 backdrop-blur-[40px] rounded-xl border ${borderColor}
        px-4 py-3.5 shadow-lg ${shadowColor}
        transition-all duration-300
        ${exiting ? 'opacity-0 translate-y-2 scale-95' : 'animate-slideUp'}
      `}
      role="alert"
    >
      {/* Icon */}
      <div className={`relative flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border ${iconBg}`}>
        {type === 'success' ? (
          <svg className={`w-4.5 h-4.5 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : type === 'error' ? (
          <svg className={`w-4.5 h-4.5 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        ) : (
          <svg className={`w-4.5 h-4.5 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="relative flex-1 min-w-0 pt-0.5">
        <p className="text-sm font-display text-on-surface tracking-wide leading-snug">
          {message}
        </p>
        {detail && (
          <p className="mt-1 text-xs text-on-surface-variant/60 font-body leading-relaxed">
            {detail}
          </p>
        )}
        {action && (
          <a
            href={action.href}
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-accent-600 hover:text-accent-700 transition-colors duration-200"
          >
            {action.label}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={dismiss}
        className="relative flex-shrink-0 p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5 transition-all duration-200"
        aria-label="Dismiss notification"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Toast Container — manages stack of toasts in fixed position ──

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  // Show max 3 toasts at a time (most recent on top)
  const visible = toasts.slice(-3);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-3 pointer-events-none">
      {visible.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast {...toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
