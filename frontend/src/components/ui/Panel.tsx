import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function Panel({ children, className, style }: PanelProps) {
  return (
    <section className={['panel', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </section>
  );
}

interface PanelHeadProps {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PanelHead({ title, actions, children }: PanelHeadProps) {
  if (children) return <div className="panel-head">{children}</div>;
  return (
    <div className="panel-head">
      {typeof title === 'string' ? <span className="panel-title">{title}</span> : title}
      {actions}
    </div>
  );
}
