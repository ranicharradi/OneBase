// ── Toast notifications ──

import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2Icon, XCircleIcon, InfoIcon, ArrowRightIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

const TYPE_ICON: Record<ToastData['type'], LucideIcon> = {
  success: CheckCircle2Icon,
  error: XCircleIcon,
  info: InfoIcon,
};

const TONE_BORDER: Record<'ok' | 'danger' | 'info', string> = {
  ok: 'border-l-emerald-600',
  danger: 'border-l-destructive',
  info: 'border-l-sky-600',
};

const TONE_ICON: Record<'ok' | 'danger' | 'info', string> = {
  ok: 'text-emerald-600',
  danger: 'text-destructive',
  info: 'text-sky-600',
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
  const IconCmp = TYPE_ICON[type];

  return (
    <div
      role="alert"
      className={cn(
        'w-[360px] max-w-[calc(100vw-32px)] bg-card border border-border border-l-[3px] rounded-md shadow-lg p-2.5 flex items-start gap-2.5 transition-all duration-200',
        TONE_BORDER[tone],
        exiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0',
      )}
    >
      <IconCmp className={cn('size-4 shrink-0 mt-0.5', TONE_ICON[tone])} />

      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-foreground">{message}</div>
        {detail && (
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-[1.4]">
            {detail}
          </div>
        )}
        {action && (
          <a
            href={action.href}
            className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-primary font-medium no-underline"
          >
            {action.label}
            <ArrowRightIcon className="size-3" />
          </a>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={dismiss}
        className="size-5 p-0 shrink-0"
        aria-label="Dismiss notification"
      >
        <XIcon className="size-3" />
      </Button>
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
