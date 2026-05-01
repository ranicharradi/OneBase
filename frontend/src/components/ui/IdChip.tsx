import type { ReactNode } from 'react';

export default function IdChip({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <span className="id-chip" style={style}>{children}</span>;
}
