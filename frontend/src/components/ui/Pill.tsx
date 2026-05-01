import type { ReactNode } from 'react';

export type PillTone = 'ok' | 'warn' | 'danger' | 'info' | 'accent' | 'neutral';

interface PillProps {
  tone?: PillTone;
  dot?: boolean;
  icon?: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function Pill({ tone, dot = false, icon, children, className, style }: PillProps) {
  const cls = ['pill', tone, className].filter(Boolean).join(' ');
  return (
    <span className={cls} style={style}>
      {dot && <span className="pill-dot" />}
      {icon && (
        <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
