import type { PillTone } from './Pill';

type HbarTone = Exclude<PillTone, 'neutral'>;

interface HbarProps {
  /** 0–100 */
  value: number;
  tone?: HbarTone;
  height?: number;
  width?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export default function Hbar({ value, tone, height, width, className, style }: HbarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const cls = ['hbar', tone, className].filter(Boolean).join(' ');
  return (
    <span className={cls} style={{ width, height, ...style, display: width ? 'inline-block' : undefined }}>
      <span style={{ width: `${clamped}%` }} />
    </span>
  );
}
