import type { ReactNode } from 'react';
import Hbar from './Hbar';
import type { PillTone } from './Pill';

interface KpiProps {
  label: string;
  /** Material Symbols icon name shown in front of the label. */
  icon?: string;
  value: string;
  delta?: ReactNode;
  /** 0–100 */
  bar?: number;
  tone?: Exclude<PillTone, 'neutral'>;
}

export default function Kpi({ label, icon, value, delta, bar, tone }: KpiProps) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        {icon && (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 12, color: tone ? `var(--${tone})` : 'var(--fg-2)' }}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {delta && <div className="kpi-sub">{delta}</div>}
      {typeof bar === 'number' && (
        <Hbar value={bar} tone={tone} style={{ marginTop: 10, height: 4 }} />
      )}
    </div>
  );
}
